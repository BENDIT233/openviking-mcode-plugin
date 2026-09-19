#!/usr/bin/env node

/**
 * MiniMax Code hook dispatcher for OpenViking.
 *
 * Adapted from the official OpenViking agent-hook-plugin ZCode host and the
 * ZCode integration's zcode-hook.mjs. One entry point branched on argv[2];
 * hooks/hooks.json passes the event name through scripts/ov-hook.cmd.
 *
 * Output contract (verified against @mavis/plugin-hooks runner source):
 *   - Context injection: { hookSpecificOutput: { hookEventName, additionalContext } }
 *   - URI guard deny: { hookSpecificOutput: { hookEventName: "PreToolUse",
 *       permissionDecision: "deny", permissionDecisionReason } }
 *   - Side-effect-only events (Stop/PreCompact/PostCompact/SessionEnd): no stdout.
 * Fail-open everywhere: every error path exits 0 with empty output.
 */

import {
  addAgentMessages,
  buildAgentProfile,
  commitAgentSession,
  createAgentLogger,
  deriveAgentSessionId,
  loadAgentHookConfig,
  makeAgentFetchJSON,
  readHookState,
  recallForPrompt,
  replayAgentPending,
  resolveAgentCwd,
  resolveNativeSessionId,
  shouldBypassAgent,
  stableHash,
  withAgentHookLock,
  writeHookState,
} from "./shared/agent-hook-runtime.mjs";

const eventName = process.env.OPENVIKING_HOOK_EVENT || process.argv[2] || "";
const cfg = loadAgentHookConfig("mcode");
const { log, logError } = createAgentLogger("mcode", eventName, cfg);

function outputContext(additionalContext, hookEventName) {
  if (!additionalContext) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext,
      },
    }) + "\n",
  );
}

let input = {};
let nativeSessionId = "";
let sessionId = "";
let cwd = "";
let fetchJSON;

async function main() {
  // URI guard needs no OV access and no shared runtime beyond agent-uri-guard.
  if (eventName === "uri-guard") {
    const { evaluateAgentUriGuard } = await import("./shared/agent-uri-guard.mjs");
    const toolName = input.tool_name ?? input.toolName ?? input.name ?? input.tool;
    const toolInput = input.tool_input ?? input.toolInput ?? input.input ?? {};
    const decision = evaluateAgentUriGuard(toolName, toolInput);
    if (!decision) return;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: decision.reason,
        },
      }) + "\n",
    );
    return;
  }

  if (!cfg.enabled || shouldBypassAgent(cfg, input)) return;
  let state = await readHookState("mcode", nativeSessionId);

  // --- SessionStart: inject user profile + replay pending queue ---
  if (eventName === "session-start") {
    const profile = await withAgentHookLock("mcode", nativeSessionId, async () => {
      state = await readHookState("mcode", nativeSessionId);
      const now = Date.now();
      if (now - Number(state.lastSessionStartAt || 0) < 2000) return null;
      state = { ...state, lastSessionStartAt: now };
      await writeHookState("mcode", nativeSessionId, state);
      await replayAgentPending(fetchJSON, log).catch((error) => logError("pending", error));
      return buildAgentProfile(fetchJSON, cfg, cwd).catch((error) => {
        logError("profile", error);
        return null;
      });
    });
    outputContext(
      profile ? `<openviking-context source="session-start">\n${profile}\n</openviking-context>` : "",
      "SessionStart",
    );
    return;
  }

  // --- UserPromptSubmit: recall relevant memories, remember the prompt ---
  if (eventName === "user-prompt-submit") {
    const { cleanMiniMaxText } = await import("./minimax-turns.mjs");
    const prompt = cleanMiniMaxText(
      input.prompt || input.user_prompt || input.userMessage || input.message || "",
    );
    if (!prompt) return;
    const recallBlock = await withAgentHookLock("mcode", nativeSessionId, async () => {
      state = await readHookState("mcode", nativeSessionId);
      const promptHash = stableHash(prompt);
      const now = Date.now();
      const promptEventId = input.prompt_id || input.promptId || "";
      const duplicateEvent = promptEventId
        ? state.promptEventId === promptEventId
        : state.promptHash === promptHash && now - Number(state.promptAt || 0) < 500;
      if (duplicateEvent) return null;
      const block =
        state.promptHash === promptHash && state.recallBlock
          ? state.recallBlock
          : await recallForPrompt(fetchJSON, cfg, prompt, cwd, log, { sessionId }).catch(
              (error) => {
                logError("recall", error);
                return null;
              },
            );
      await writeHookState("mcode", nativeSessionId, {
        ...state,
        promptHash,
        promptEventId,
        promptAt: now,
        recallBlock: block,
        pendingPrompt: { prompt, hash: promptHash, at: now },
      });
      return block;
    });
    outputContext(recallBlock || "", "UserPromptSubmit");
    return;
  }

  // --- Stop: capture incremental turns + commit ---
  if (eventName === "stop") {
    if (!cfg.autoCapture) return;
    const { buildMiniMaxTurns } = await import("./minimax-turns.mjs");
    const capture = await import("./minimax-capture.mjs");
    const { shouldCaptureText } = await import("./shared/capture-utils.mjs");
    await withAgentHookLock("mcode", nativeSessionId, async () => {
      state = await readHookState("mcode", nativeSessionId);
      const plan = capture.buildMiniMaxCapturePlan(
        buildMiniMaxTurns(input, state),
        state,
        { ...cfg, shouldCaptureText },
        stableHash,
      );
      if (plan.toSend.length === 0) return;
      const result = await addAgentMessages(fetchJSON, sessionId, plan.payloads);
      const { captured, ...nextState } = capture.applyMiniMaxCaptureResult(state, plan, result);
      if (captured <= 0) {
        await writeHookState("mcode", nativeSessionId, { ...nextState, capturedSinceCommit: 0 });
        return;
      }
      let nextCount = Number(state.capturedSinceCommit || 0) + captured;
      const committed = await commitAgentSession(fetchJSON, sessionId, log);
      if (committed.ok) nextCount = 0;
      await writeHookState("mcode", nativeSessionId, {
        ...nextState,
        capturedSinceCommit: nextCount,
      });
    });
    return;
  }

  // --- PreCompact / SessionEnd: best-effort commit of captured turns ---
  if (eventName === "commit") {
    await withAgentHookLock("mcode", nativeSessionId, async () => {
      state = await readHookState("mcode", nativeSessionId);
      if (Number(state.capturedSinceCommit || 0) <= 0) return;
      const commitCfg = {
        ...cfg,
        timeoutMs: Math.min(cfg.timeoutMs, eventName === "session-end" ? 2200 : 6000),
      };
      const commitFetch = makeAgentFetchJSON(commitCfg, cwd).fetchJSON;
      const committed = await commitAgentSession(commitFetch, sessionId, log);
      if (committed.ok) {
        await writeHookState("mcode", nativeSessionId, { ...state, capturedSinceCommit: 0 });
      }
    });
    return;
  }

  // --- PostCompact: the transcript projection is rewritten with fresh uuids ---
  if (eventName === "post-compact") {
    await withAgentHookLock("mcode", nativeSessionId, async () => {
      state = await readHookState("mcode", nativeSessionId);
      await writeHookState("mcode", nativeSessionId, {
        ...state,
        capturedUuids: [],
        capturedSinceCommit: Number(state.capturedSinceCommit || 0) > 0
          ? state.capturedSinceCommit
          : 0,
      });
    });
    return;
  }

  // Unknown event: pass-through silently
}

async function run() {
  if (eventName === "stop" && cfg.enabled && cfg.autoCapture) {
    const { maybeDetach, readHookStdin } = await import("./shared/async-writer.mjs");
    const detached = await maybeDetach(cfg, { approve: () => {} });
    if (detached) return;
    input = parseStdin(await readHookStdin());
  } else {
    input = parseStdin(await readStdin());
  }

  if (!input.session_id && input.sessionId) input.session_id = input.sessionId;
  nativeSessionId = resolveNativeSessionId(input);
  sessionId = deriveAgentSessionId("mcode-", input);
  cwd = resolveAgentCwd(input);
  ({ fetchJSON } = makeAgentFetchJSON(cfg, cwd));
  await main();
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

function parseStdin(raw) {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

run().catch((error) => {
  logError("uncaught", error);
  // Pass-through on error — never block the session
});
