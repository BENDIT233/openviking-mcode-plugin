/**
 * Transcript parser for MiniMax Code hook events.
 *
 * MiniMax Code gives every hook the `transcript_path` of a Claude-compatible
 * JSONL projection of the active conversation (maintained by the host under
 * %TEMP%/minimax-plugin-hooks/transcripts/<session>.compatible.jsonl). Rows:
 *   { type: 'user'|'assistant'|'system', uuid, parentUuid, sessionId, timestamp,
 *     message: { role, content: [ {type:'text',...}|{type:'tool_use',...}
 *                                 |{type:'tool_result',...} ] } }
 *
 * Strategy:
 * 1. The transcript is the authoritative incremental source; each row carries
 *    a stable uuid used as the capture dedup key.
 * 2. Stdin (`last_assistant_message`) + `state.pendingPrompt` (saved by
 *    UserPromptSubmit) is only the compatibility fallback.
 *
 * stripMeta discipline (ov插件技术发现 第七轮): injected blocks must never leak
 * into the memory store, so openviking-context / system-reminder wrappers are
 * stripped from every captured text.
 */

import { readFileSync } from "node:fs";

const INJECTED_BLOCK_RE = /<openviking-context\b[^>]*>[\s\S]*?<\/openviking-context>/gi;
const RELEVANT_MEMORIES_RE = /<relevant-memories>[\s\S]*?<\/relevant-memories>/gi;
const SYSTEM_REMINDER_RE = /<system-reminder>[\s\S]*?<\/system-reminder>/gi;
const PLUGIN_STATUS_RE = /^\[openviking-memory\]/i;

export function cleanMiniMaxText(value) {
  return String(value || "")
    .replace(INJECTED_BLOCK_RE, "")
    .replace(RELEVANT_MEMORIES_RE, "")
    .replace(SYSTEM_REMINDER_RE, "")
    .trim();
}

function textFromBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return typeof blocks === "string" ? blocks : "";
  }
  return blocks
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function isToolResultRow(row) {
  const blocks = row?.message?.content;
  return (
    Array.isArray(blocks) &&
    blocks.length > 0 &&
    blocks.every((block) => block && block.type === "tool_result")
  );
}

function rowTurn(row) {
  const role = row?.type === "assistant" ? "assistant" : row?.type === "user" ? "user" : null;
  if (!role) return null;
  const content = cleanMiniMaxText(textFromBlocks(row?.message?.content));
  if (!content || PLUGIN_STATUS_RE.test(content)) return null;
  return { role, content, turnId: typeof row.uuid === "string" ? row.uuid : "" };
}

/**
 * Read unseen turns from the compatible transcript projection.
 * Dedup against `capturedUuids` is applied by the capture plan, not here —
 * this function only parses and filters.
 */
export function readMiniMaxTranscriptTurns(transcriptPath) {
  if (!transcriptPath) return { available: false, turns: [] };
  let raw;
  try {
    raw = readFileSync(transcriptPath, "utf8");
  } catch {
    return { available: false, turns: [] };
  }
  const turns = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isToolResultRow(row)) continue;
    const turn = rowTurn(row);
    if (turn) turns.push(turn);
  }
  return { available: true, turns };
}

/**
 * Build the turns to consider capturing for a Stop event.
 * Transcript-first; stdin fields + pendingPrompt as fallback.
 *
 * @param {object} input - Raw hook stdin JSON.
 * @param {object} state - Persistent hook state (pendingPrompt, ...).
 * @returns {Array<{role: string, content: string, turnId?: string}>}
 */
export function buildMiniMaxTurns(input = {}, state = {}) {
  const transcript = readMiniMaxTranscriptTurns(input.transcript_path || input.transcriptPath);
  if (transcript.available && transcript.turns.length > 0) return transcript.turns;
  if (transcript.available) return [];

  const assistantContent = cleanMiniMaxText(
    input.last_assistant_message ||
      input.lastAssistantMessage ||
      input.responseText ||
      input.responsePreview ||
      "",
  );
  const userContent = cleanMiniMaxText(
    input.prompt || state.pendingPrompt?.prompt || "",
  );
  return [
    { role: "user", content: userContent },
    { role: "assistant", content: assistantContent },
  ].filter((turn) => turn.content);
}
