<div align="center">

<img src="icon.png" width="96" alt="OpenViking Memory" />

# OpenViking Memory for MiniMax Code

把 [OpenViking](https://github.com/volcengine/OpenViking)（OV）长期语义记忆接入 MiniMax Code 桌面端（本地插件格式 V1）。

![version](https://img.shields.io/badge/version-0.1.1-blue)
![host](https://img.shields.io/badge/host-MiniMax_Code-orange)
![plugin](https://img.shields.io/badge/plugin_format-V1-8A2BE2)
![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![license](https://img.shields.io/badge/license-MIT-green)

装好后无需任何手动操作：会话启动自动注入你的用户画像，每条 prompt 自动召回相关记忆，会话结束自动沉淀进记忆库；同时提供全套 `openviking_*` MCP 工具供显式读写。

</div>

## 工作方式

插件通过 7 类 hook 事件 + 1 个 MCP 服务器接入 MiniMax Code：

| 通道 | 行为 |
| --- | --- |
| SessionStart | 注入 `<openviking-context source="session-start">`（`profile.md` 全文 + preferences/entities 索引），并重放 pending 队列 |
| UserPromptSubmit | 语义召回与当前 prompt 相关的记忆，注入 additionalContext；记录 pendingPrompt 供捕获兜底 |
| PreToolUse（read/glob/grep） | uri-guard：拒绝本地读 `viking://` URI，提示改用 OV MCP 工具（content 键豁免，防误杀） |
| Stop | 捕获会话轮次（transcript 优先，uuid 去重）→ addMessages → commit，异步脱离不阻塞 |
| PreCompact / SessionEnd | 压缩前 / 会话终局 best-effort commit |
| PostCompact | 清空 uuid 去重集（转录重写后 uuid 全新） |
| MCP（stdio） | `openviking_*` 全套工具：search / find / read / list / tree / grep / glob / remember / write / edit / add_resource / forget / health |

两条硬保证：

- **fail-open**：hook 任何错误路径都是 exit 0 + 零输出，OV 不可用绝不阻塞会话。
- **不回流**：注入的 `<openviking-context>` 块在捕获前被剥离，注入内容不会污染记忆库。

典型的使用方式（来自插件的 exampleQueries）：

- 「回忆一下我之前关于这个脚本的偏好。」
- 「把这次会话的结论存入 OpenViking 记忆库。」
- 「在 OpenViking 里搜索之前的排查结论。」

## 安装

### 前置条件

- **MiniMax Code 桌面端**（Windows，支持插件格式 V1）。
- **运行中的 OpenViking 服务**，凭据位于 `~/.openviking/ovcli.conf`（url + api_key）。
- **OV 共享运行时库**：`~/.openviking/agent-integrations/memory-plugin-shared/lib`（由 OpenViking 安装，本插件不 vendor 副本）。
- Node 运行时**无需单独安装**：launcher 优先复用 MiniMax Code 自带的 Electron 二进制（`ELECTRON_RUN_AS_NODE=1`），找不到时回落 `node`。

### 安装步骤

把仓库 clone 到 MiniMax Code 的插件目录（`<DATA_DIR>/plugins/`）：

```bash
git clone https://github.com/BENDIT233/openviking-mcode-plugin.git "<DATA_DIR>/plugins/openviking"
```

本地插件默认启用，目录 watcher 会自动重扫，无需注册或打包。

### 验证

在 MiniMax Code 里让 agent 调用 `openviking_health`，返回正常即接入成功；也可查看日志确认（见下文「日志与排障」）。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENVIKING_SHARED_LIB_DIR` | `~/.openviking/agent-integrations/memory-plugin-shared/lib` | 共享库目录覆盖 |
| `OPENVIKING_TIMEOUT_MS` | `7000` | hook 侧 OV 调用超时 |
| `OPENVIKING_DEBUG` | 未设置 | 设为 `1` 开启 hook 调试日志 |
| `OPENVIKING_*`（url / api_key 等） | `~/.openviking/ovcli.conf` | 覆盖服务地址与凭据 |

> **注意**：MiniMax Code 的 hook 子进程环境是白名单（PATH / USERPROFILE / LOCALAPPDATA 等），用户级的 `OPENVIKING_*` 环境变量**不会透传**。需要覆盖默认值时，直接修改 `scripts/ov-hook.cmd` / `servers/ov-mcp.ps1` 两个 launcher。

## 日志与排障

| 内容 | 位置 |
| --- | --- |
| 插件日志 | `~/.openviking/logs/mcode-hooks.log`（`OPENVIKING_DEBUG=1` 开调试，需写进 launcher） |
| hook 状态（去重集 / pendingPrompt） | `~/.openviking/hook-state/mcode/` |
| 会话转录（host 维护，只读） | `%TEMP%/minimax-plugin-hooks/transcripts/<session>.compatible.jsonl` |

## 项目结构

```
.
├── .minimax-plugin/
│   └── plugin.json           # 插件清单（agent.minimax.cn plugin-v1 schema）
├── hooks/
│   └── hooks.json            # 7 类 hook 事件注册
├── scripts/
│   ├── ov-hook.cmd           # hook 启动器：设置 OPENVIKING_* 默认值，Electron-as-Node
│   ├── openviking-hook.mjs   # hook 主入口：按 argv 事件分发，全路径 fail-open
│   ├── minimax-turns.mjs     # transcript 解析（剥离注入块、uuid 去重）
│   ├── minimax-capture.mjs   # 捕获计划（去重 → addMessages → commit）
│   ├── ov-shared.mjs         # 共享库解析器（单一来源，不 vendor）
│   └── shared/               # 共享库再导出 shim
├── servers/
│   ├── ov-mcp.ps1            # MCP 启动器（绕开 stdio 参数限制，stdio 句柄直传）
│   └── mcp-proxy.mjs         # OpenViking MCP stdio proxy
├── servers.mcp.json          # MCP 服务器声明（schemaVersion 1）
├── skills/
│   └── openviking-memory/
│       └── SKILL.md          # agent skill：何时 / 如何使用 OV 工具
└── icon.png
```

## Windows / MiniMax Code 适配要点

以下事实均已对照 MiniMax Code 源码与官方文档核实，二开或移植到其他 host 时会用到：

- **MCP 声明限制**：插件读取器要求 `command` 是 PATH 可解析的可执行名（不含 `/`、`\`），`args` 不得是绝对路径形态 —— `cmd /c` 的 `/c` 会被判为 absolute stdio argument，整包以 `MCP_SCHEMA_INVALID` 拒收。因此 `servers.mcp.json` 声明 `powershell -File ./servers/ov-mcp.ps1`。
- **stdio 透传**：`.ps1` 通过 `ProcessStartInfo` 直接启动子进程并继承 stdio 句柄（不经 PowerShell 管道），否则 stdout 被缓冲，MCP JSON-RPC 握手拿不到响应。
- **无独立 node.exe**：launcher 设 `ELECTRON_RUN_AS_NODE=1` 复用 MiniMax Code.exe 跑 `.mjs`（与 OV 官方 `ov-hook.cmd` 同模式）。
- **hook 环境白名单**：用户级环境变量不透传，所需 `OPENVIKING_*` 默认值写死在 launcher 内。
- **transcript 格式**：`transcript_path` 指向 host 维护的 Claude 兼容 JSONL，行格式 `{type, uuid, message: {role, content[]}}`；捕获以 transcript 为权威增量源（uuid 去重），stdin `last_assistant_message` + pendingPrompt 仅作兜底。
- **stdout 契约**：只输出 host 认可键，`hookSpecificOutput.hookEventName` 必须等于事件名；副作用类事件（Stop / PreCompact / PostCompact / SessionEnd）零输出。超时 1–10s / 处理器，SessionEnd 共享 3s 预算。
- **会话 id**：`mcode-` 前缀 + 原生 session_id，与 OV 侧其他 host 的会话隔离。

## 版本历史

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| 0.1.1 | 2026-09-19 | 修复 MCP stdio 声明被插件读取器整包拒收的问题（`cmd /c` → PowerShell 启动器，见「适配要点」） |
| 0.1.0 | 2026-09-19 | 首版：五事件 hook + MCP proxy + skill |

## 致谢

- [OpenViking](https://github.com/volcengine/OpenViking) —— 长期语义记忆服务本身。
- [MiniMax Code](https://github.com/MiniMax-AI/minimax-code) —— 宿主 agent 工具，本插件接入的插件格式 V1 与 hook / MCP 体系由其提供。
- [ZCode](https://docs.z.ai) —— agent 工具，本插件的 hook 分发与 MCP proxy 移植自其 OpenViking 集成实现。
- OV 官方 `agent-hook-plugin` 的 host 适配层模式 —— 移植参照。

## 许可证

[MIT](LICENSE) © 2026 BENDIT233
