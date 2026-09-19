import { importShared } from "../ov-shared.mjs";

const mod = await importShared("async-writer.mjs");

export const maybeDetach = mod.maybeDetach;
export const readHookStdin = mod.readHookStdin;
