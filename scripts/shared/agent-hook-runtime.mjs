/**
 * Re-export shim: keeps the dispatcher's static imports identical in shape to
 * the ZCode host while the implementation stays in the canonical shared lib
 * (single source of truth, no vendored copy). OPENVIKING_SHARED_LIB_DIR can
 * relocate the lib.
 */

import { importShared } from "../ov-shared.mjs";

const mod = await importShared("agent-hook-runtime.mjs");

export const addAgentMessage = mod.addAgentMessage;
export const addAgentMessages = mod.addAgentMessages;
export const buildAgentProfile = mod.buildAgentProfile;
export const commitAgentSession = mod.commitAgentSession;
export const createAgentLogger = mod.createAgentLogger;
export const deriveAgentSessionId = mod.deriveAgentSessionId;
export const loadAgentHookConfig = mod.loadAgentHookConfig;
export const makeAgentFetchJSON = mod.makeAgentFetchJSON;
export const readHookInput = mod.readHookInput;
export const readHookState = mod.readHookState;
export const recallForPrompt = mod.recallForPrompt;
export const replayAgentPending = mod.replayAgentPending;
export const resolveAgentCwd = mod.resolveAgentCwd;
export const resolveNativeSessionId = mod.resolveNativeSessionId;
export const shouldBypassAgent = mod.shouldBypassAgent;
export const stableHash = mod.stableHash;
export const withAgentHookLock = mod.withAgentHookLock;
export const writeHookState = mod.writeHookState;
