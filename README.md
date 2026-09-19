# OpenViking Memory — MiniMax Code 插件

把 OpenViking（OV）长期语义记忆接入 MiniMax Code 桌面端（本地插件格式 V1）。
参照 OV 官方 `agent-hook-plugin` 的 host 适配层模式与 ZCode 集成实现移植。

## 能力

| 事件 | 行为 |
| --- | --- |
| SessionStart | 注入 `<openviking-context source="session-start">`（profile.md 全文 + preferences/entities 索引），并重放 pending 队列 |
| UserPromptSubmit | 语义召回相关记忆（`/api/v1/search/search` context face），注入 additionalContext；记录 pendingPrompt 供捕获兜底 |
| PreToolUse（read/glob/grep） | uri-guard：拒绝本地读 viking:// URI，提示改用 OV MCP 工具（content 键豁免，防误杀） |
| Stop | 捕获会话轮次（transcript-first，uuid 去重）→ addMessages → commit；异步脱离不阻塞 |
| PreCompact / SessionEnd | 压缩前 / 会话终局 best-effort commit |
| PostCompact | 清空 uuid 去重集（转录重写后 uuid 全新） |
| MCP | stdio proxy 暴露 openviking_* 工具（search/find/read/list/tree/grep/glob/remember/write/edit/add_resource/forget/health） |

## 关键实现事实（均已对照 MiniMax Code 源码/官方文档核实）

- 插件安装位置 `<DATA_DIR>/plugins/<plugin-dir>/`，本地插件默认启用，目录 watcher 自动重扫。
- hook 子进程环境是白名单（PATH/USERPROFILE/LOCALAPPDATA 等），`OPENVIKING_*` 用户级
  环境变量不会透传 —— 默认值在 `scripts/ov-hook.cmd` / `servers/ov-mcp.ps1` 内设置。
- MCP stdio 入口不能写成 `cmd /c ...`：MiniMax 插件读取器要求 `command` 是 PATH 解析的可执行名
  （不含 `/`、`\`），且 `args` 不得是绝对路径形态 —— `/c` 会被判为“absolute stdio argument”而整包拒收。
  因此 `servers.mcp.json` 用 `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass
  -File ./servers/ov-mcp.ps1`，由 `.ps1` 直接以子进程继承句柄的方式启动 Electron-as-Node
  （不经 PowerShell 管道，否则 stdout 会被缓冲、MCP 握手拿不到响应）。
- 本机无独立 node.exe：launcher 用 `ELECTRON_RUN_AS_NODE=1` + MiniMax Code.exe 跑 .mjs
  （与 `~/.openviking/bin/ov-hook.cmd` 同模式）。
- `transcript_path` 指向 host 维护的 Claude 兼容 JSONL（`%TEMP%/minimax-plugin-hooks/
  transcripts/<session>.compatible.jsonl`），行格式 `{type, uuid, message:{role, content[]}}`。
- hook stdout 仅输出 MiniMax 认可键（`hookSpecificOutput.hookEventName` 必须等于事件名）；
  其余事件零输出。超时 1-10s/处理器，SessionEnd 共享 3s 预算。
- 会话 id：`mcode-` 前缀 + 原生 session_id；hook 状态 `~/.openviking/hook-state/mcode/`。

## 共享库（单一来源）

脚本不 vendor 共享运行时，经 `scripts/ov-shared.mjs` 从
`~/.openviking/agent-integrations/memory-plugin-shared/lib` 动态导入
（可用 `OPENVIKING_SHARED_LIB_DIR` 覆盖）。`scripts/shared/*.mjs` 只是再导出 shim。

## 凭据与日志

- 凭据：`~/.openviking/ovcli.conf`（url + api_key），可用 `OPENVIKING_*` 环境变量覆盖
  （但需写进 launcher，hook 子进程不继承用户级 env）。
- 日志：`~/.openviking/logs/mcode-hooks.log`（`OPENVIKING_DEBUG=1` 开启调试输出，
  同样需写进 launcher 才对 hook 生效）。

## 版本

- 0.1.1（2026-09-19）：修复插件无法被 MiniMax 识别的问题 —— MCP `command` 原为 `cmd` +
  `["/d","/c","./servers/ov-mcp.cmd"]`，`/c` 被读取器判为绝对 stdio 参数导致整包以
  `MCP_SCHEMA_INVALID: openviking contains an absolute stdio argument` 拒收。改为持久
  PowerShell 启动器 `servers/ov-mcp.ps1`（子进程继承句柄，不用管道），并删除旧的 `ov-mcp.cmd`。
- 0.1.0（2026-09-19）：首版，五事件 + MCP proxy + skill。
