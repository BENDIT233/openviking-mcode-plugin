import { importShared } from "../ov-shared.mjs";

const mod = await importShared("agent-uri-guard.mjs");

export const evaluateAgentUriGuard = mod.evaluateAgentUriGuard;
