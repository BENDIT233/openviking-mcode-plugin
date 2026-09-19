/**
 * Capture plan and acknowledgement for MiniMax Code Stop events.
 *
 * Dedup is keyed on the transcript row uuid (stable per host projection).
 * Fallback-path turns (no transcript) key on content hash. There is no cursor
 * to advance: compaction rewrites the projection with fresh uuids, so the
 * PostCompact state reset in the dispatcher is the only boundary needed.
 */

export function minimaxTurnDedupKey(turn, hash) {
  return turn.turnId || hash(turn.role, turn.content);
}

export function buildMiniMaxCapturePlan(turns, state = {}, cfg = {}, hash) {
  const capturedUuids = new Set(
    Array.isArray(state.capturedUuids) ? state.capturedUuids : [],
  );
  const candidates = [];
  for (const turn of turns) {
    const decision = cfg.shouldCaptureText(turn.content, turn.role, cfg);
    if (!decision.shouldCapture) continue;
    const dedupKey = minimaxTurnDedupKey(turn, hash);
    candidates.push({ dedupKey, turn, content: decision.text });
  }
  const toSend = candidates.filter((item) => !capturedUuids.has(item.dedupKey));
  const payloads = toSend.map(({ turn, content }) => ({
    role: turn.role,
    content,
    ...(turn.turnId ? { turn_id: turn.turnId } : {}),
  }));
  return { candidates, toSend, payloads };
}

export function applyMiniMaxCaptureResult(state, plan, result) {
  const captured = Math.min(
    plan.toSend.length,
    Math.max(0, Number(result?.sent || 0) + Number(result?.queued || 0)),
  );
  if (captured <= 0) return { ...state, captured: 0 };

  const capturedUuids = new Set(
    Array.isArray(state.capturedUuids) ? state.capturedUuids : [],
  );
  const pendingPrompt = state.pendingPrompt?.prompt || "";
  let pendingPromptAcknowledged = !pendingPrompt;
  for (const item of plan.toSend.slice(0, captured)) {
    capturedUuids.add(item.dedupKey);
    if (item.turn.role === "user" && item.turn.content === pendingPrompt) {
      pendingPromptAcknowledged = true;
    }
  }

  return {
    ...state,
    capturedUuids: [...capturedUuids].slice(-1000),
    pendingPrompt: pendingPromptAcknowledged ? null : state.pendingPrompt,
    captured,
  };
}
