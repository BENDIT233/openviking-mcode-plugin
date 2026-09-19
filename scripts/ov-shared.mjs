/**
 * Resolver for the shared OpenViking memory-plugin runtime.
 *
 * This plugin deliberately does NOT vendor the shared lib: the canonical copy
 * installed by OpenViking at `~/.openviking/agent-integrations/memory-plugin-shared/lib`
 * stays the single source of truth (see 记忆库 discipline: 插件冗余副本清理).
 * Set OPENVIKING_SHARED_LIB_DIR to point somewhere else.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function sharedLibDirs() {
  const candidates = [
    process.env.OPENVIKING_SHARED_LIB_DIR,
    join(homedir(), ".openviking", "agent-integrations", "memory-plugin-shared", "lib"),
  ];
  return candidates.filter(Boolean);
}

export async function importShared(moduleName) {
  const missing = [];
  for (const dir of sharedLibDirs()) {
    const file = join(dir, moduleName);
    if (existsSync(file)) return import(pathToFileURL(file).href);
    missing.push(file);
  }
  throw new Error(`OpenViking shared module not found: ${moduleName} (searched ${missing.join(", ")})`);
}
