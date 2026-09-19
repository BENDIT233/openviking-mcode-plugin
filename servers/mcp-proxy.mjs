#!/usr/bin/env node

/**
 * OpenViking stdio MCP proxy for MiniMax Code.
 *
 * Thin wrapper mirroring the ZCode host's servers/mcp-proxy.mjs: credentials
 * from ~/.openviking/ovcli.conf (or OPENVIKING_* env), implementation in the
 * canonical shared lib. Started by servers/ov-mcp.ps1 (ELECTRON_RUN_AS_NODE).
 */

import { fileURLToPath } from "node:url";
import { resolve as resolvePath } from "node:path";

import { importShared } from "../scripts/ov-shared.mjs";

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isEntrypoint) {
  const [{ loadAgentHookConfig }, { createLogger }, { buildMcpProxyConfig, resolveMcpActorPeerId }, { createOpenVikingMcpProxy }] =
    await Promise.all([
      importShared("agent-hook-runtime.mjs"),
      importShared("debug-log.mjs"),
      importShared("mcp-proxy-config.mjs"),
      importShared("mcp-proxy-core.mjs"),
    ]);

  function readConfig() {
    const cfg = loadAgentHookConfig("mcode");
    return buildMcpProxyConfig({
      mcpUrl: cfg.mcpUrl,
      apiKey: cfg.apiKey,
      account: cfg.account,
      user: cfg.user,
      peerId: resolveMcpActorPeerId(cfg),
      userAgent: cfg.userAgent,
      timeoutMs: cfg.timeoutMs,
      debug: cfg.debug,
      debugLogPath: cfg.debugLogPath,
      credentialSource: cfg.credentialSource,
      credentialPath: cfg.cliPath || cfg.ovPath || "",
      watchedPaths: [cfg.cliPath, cfg.ovPath],
    });
  }

  createOpenVikingMcpProxy({ readConfig, loggerFactory: createLogger }).start();
}
