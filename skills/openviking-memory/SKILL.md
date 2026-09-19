---
name: openviking-memory
description: >-
  Use OpenViking (long-term semantic memory) when the user asks to remember,
  recall, or search memories, past sessions, decisions, preferences, or
  viking:// resources. OpenViking MCP tools (openviking_search, openviking_read,
  openviking_remember, ...) are provided by the openviking plugin. Session
  start already injects the user profile and each prompt already recalls
  relevant memories automatically; use the MCP tools for explicit, deeper
  access.
descriptions:
  zh-Hans:
    '用户要求“记住/回忆/查一下记忆库/搜过往结论”或需要读取 viking:// 资源时使用。
    会话启动已自动注入用户画像，每条 prompt 已自动召回相关记忆；显式深入访问用
    openviking_* MCP 工具。'
displayNames:
  zh-Hans: 'OpenViking 记忆库'
---

# OpenViking Memory

OpenViking (OV) is the long-term semantic memory service. This plugin wires it
into MiniMax Code with three automatic paths and one explicit toolset.

## Automatic (no action needed)

- **SessionStart**: user profile + memory index are injected inside
  `<openviking-context source="session-start">`.
- **UserPromptSubmit**: memories relevant to the prompt are injected inside
  `<openviking-context>` blocks.
- **Stop / compaction**: the conversation is captured into OV and committed for
  long-term memory extraction.

Treat injected `<openviking-context>` content as background knowledge. URIs
like `viking://user/<user>/memories/...` are virtual paths — never try to read
them with local file tools (the plugin's uri-guard denies that and points to
the MCP tools).

## Explicit MCP tools

Tool names are the OpenViking MCP server's native names (server `openviking`):

- `openviking_search` — deep semantic retrieval across memories/resources;
  prefer `mode="context"` for task-ready context.
- `openviking_find` — quick semantic search.
- `openviking_read` — read one or more `viking://` files.
- `openviking_list` / `openviking_tree` — explore `viking://` directories.
- `openviking_grep` / `openviking_glob` — exact text/regex search, file matching.
- `openviking_remember` — store an important fact or decision.
- `openviking_write` / `openviking_edit` — create/overwrite/append or edit
  `viking://` files.
- `openviking_add_resource` — add a URL or local file as a resource.
- `openviking_forget` — delete a URI; only after explicit user confirmation.
- `openviking_health` — check server health.

Guidelines:

- Conceptual questions → `openviking_search`; exact symbols/error strings →
  `openviking_grep`; enumerating files → `openviking_glob`.
- The user's memories live under `viking://user/<user>/memories/`; knowledge
  domains under `viking://resources/`.
- When the user asks to remember something durable, write it with
  `openviking_remember` or `openviking_write` under the appropriate memories
  path rather than leaving it only in the conversation.
- Deletion requires explicit user confirmation every time.
