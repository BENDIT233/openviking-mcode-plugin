import { importShared } from "../ov-shared.mjs";

const mod = await importShared("capture-utils.mjs");

export const shouldCaptureText = mod.shouldCaptureText;
export const truncateCaptureText = mod.truncateCaptureText;
export const sanitizeCapturedText = mod.sanitizeCapturedText;
