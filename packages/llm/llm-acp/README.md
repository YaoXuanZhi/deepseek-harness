---
description: "ACP LLM provider adapter and Registry coordinator: connects ACP Registry and local subscription ACP agents to ctx.llm while keeping tool execution inside DeepSeek Harness."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-acp

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-llm-acp` bridges Agent Client Protocol (ACP) services—including subscription coding agents distributed through the official ACP Registry (`npx`, `uvx`, `binary`) and locally installed ACP executables—into `ctx.llm` as native DeepSeek Harness model routes. Instead of delegating workspace execution to the external agent's own filesystem or shell tools, `AcpLlmAdapter` denies external permissions and exposes the active DeepSeek Harness `ToolSchema[]` over an ephemeral loopback Streamable HTTP MCP bridge (`dsh_tools`), capturing tool invocations as standard `ToolCallBlock` chunks so DeepSeek Harness's own `agent-loop`, Blueprint widgets, subagents, and sandbox policies execute every tool natively.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

`dsh-base` mounts `@deepseek-ai/dsh-llm-acp` dormant by default: zero routes register on `ctx.llm` until a provider is added through **Settings → Models** (`@deepseek-ai/dsh-client-ui-settings-acp`) or declared under `providers` in `cordis.patch.yml`.

```yaml
- id: llm-acp
  name: '@deepseek-ai/dsh-llm-acp'
  config:
    providers:
      claude-acp:
        displayName: Claude Subscription ACP
        source: registry
        registryAgentId: claude-acp
        distribution: npx
```

| Field | Default | Meaning |
|---|---|---|
| `registryRoot` | `dshHomePath('acp-registry')` | Directory storing cached Registry metadata, prepared packages, `state.json`, `0o600` `secrets.json`, and an empty sandbox workspace |
| `registryUrl` | `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json` | HTTPS URL of the ACP Registry catalog index |
| `installTimeoutMs` | `600000` | Timeout in milliseconds when downloading or installing ACP Registry distributions |
| `probeTimeoutMs` | `25000` | Timeout in milliseconds when probing an ACP executable via `initialize` and `session/new` |
| `providers` | `{}` | Optional declarative ACP provider routes merged with UI-managed entries |

### Subscription authentication and model probing

Subscription ACP services that do not issue static API keys can authenticate through three flows exposed on `ctx.llmAcp` and its Typert Remote namespace:

1. **Web OAuth flow (`startAuth`)** — spawns the ACP executable, calls `initialize` and `authenticate`, captures authorization URLs emitted on stderr or message updates (`status: 'url_required'`), and automatically re-probes models upon completion.
2. **Interactive OS terminal login (`launchTerminalLogin`)** — opens a native terminal window (`cmd` on Windows, `Terminal.app` on macOS, or an X11/Wayland terminal emulator on Linux) with the provider's configured environment variables so CLI-based subscription sign-ins persist in the agent's credential store.
3. **Write-only environment secrets (`upsertProvider`)** — stores secret environment values in `secrets.json` (`0o600`) without exposing secret material back to browser snapshots.

Probing (`probeProvider`) runs `initialize` followed by `session/new` in an isolated empty directory, extracting advertised `authMethods`, selectable models (`configOptions` category `model` or `id === 'model'`), reasoning effort levels (`thought_level`), `mcpCapabilities.http`, and `promptCapabilities.image`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`AcpLlmService` extends `TypertRemoteService` under namespace `'llmAcp'`, emits `'llm-acp/changed'` on catalog updates, and synchronizes enabled routes with `ctx.llm.registerAdapter`. During each `ctx.llm.stream()` call, `AcpLlmAdapter` spawns the provider process in `$DSH_HOME/acp-registry/empty-workspace`, rejects all `session/request_permission` calls except `dsh_tools` MCP calls, applies selected model and reasoning effort via `session/set_config_option`, and translates `agent_thought_chunk`, `agent_message_chunk`, and captured tool calls into DeepSeek Harness `StreamChunk` events.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `AcpLlmService` persistence, `ctx.llm` route synchronization, and `@Remote` RPC methods |
| [`src/adapter.ts`](src/adapter.ts) | `AcpLlmAdapter` streaming implementation and history-to-ACP prompt serialization |
| [`src/mcp-tool-bridge.ts`](src/mcp-tool-bridge.ts) | Ephemeral `127.0.0.1:0` Streamable HTTP MCP server and `<dsh_tool_call>` XML fallback |
| [`src/probe-auth.ts`](src/probe-auth.ts) | Subprocess lifecycle, `initialize` + `session/new` probing, OAuth URL capture, and OS terminal launcher |
| [`src/registry.ts`](src/registry.ts) | ACP Registry index caching and hermetic `binary` / `npx` / `uvx` package preparation |
| [`src/types.ts`](src/types.ts) | Branded `AcpLlmProviderId`, Remote wire records, error details, and Cordis `Events` |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-llm service](../llm/README.md) — Provider-neutral `LlmAdapter` registry and `StreamChunk` contract.
- [ui-settings-acp](../../client/ui-settings-acp/README.md) — Browser Settings UI for ACP Registry search, OAuth/terminal login, and provider editing.
- [dsh-acp](../../acp/acp/README.md) — Inbound ACP server exposing DeepSeek Harness itself to external ACP clients.

-----

<a id="model-experience"></a>
## Model Experience

### ACP prompt and tool-bridge projection

#### What the model sees

`AcpLlmAdapter` serializes `GenerateOptions.system` inside `<system_instructions>` tags and prior `user`, `assistant`, and `tool` messages into ordered transcript blocks (`<user_message>`, `<assistant_message>`, `<tool_call>`, and `<tool_result>`), passing non-offloaded user images as native ACP `image` content blocks when the provider supports images. When the ACP agent advertises `mcpCapabilities.http`, active `ToolSchema[]` declarations are served through the per-request loopback HTTP MCP server (`dsh_tools`) with no extra prompt text; when `mcpCapabilities.http` is absent and `GenerateOptions.tools` is non-empty, `buildAcpPromptBlocks` injects the fallback `<dsh_tool_call>` instructions below followed by one JSON line per tool declaration.

##### Fallback tool-call instructions for non-HTTP-MCP ACP agents

```markdown
[Available DeepSeek Harness Tools]
You do not have direct local filesystem or shell access inside this transport.
Whenever you need to invoke one or more tools, output ONLY valid JSON objects wrapped in <dsh_tool_call>...</dsh_tool_call> tags, then stop immediately and wait for the host tool results:
<dsh_tool_call>{"name":"ToolName","arguments":{}}</dsh_tool_call>
Tool declarations:
```

#### Token effect

Each request transmits the assembled system prompt, conversation history, and either MCP-listed or fallback-serialized tool declarations to the external ACP agent; ACP does not report exact token counts on `session/prompt`, so `StreamChunk` usage fields remain `0` unless supplied by future protocol extensions.

#### KV Cache effect

Each `ctx.llm.stream()` call starts a fresh stateless ACP session with the deterministic prefix of `<system_instructions>` and chronological history blocks, preserving upstream prompt-cache prefixes across append-only turns when the underlying ACP agent forwards a stable prefix to its backing model.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Stateless per-request ACP session** — each `stream()` call opens a fresh ACP session and replays the harness-owned conversation history so DeepSeek Harness compaction, branching, and cross-model switching remain authoritative; session-local memory held only inside a long-lived external ACP process is not reused across turns.
- **Usage accounting depends on ACP protocol reporting** — standard ACP `session/prompt` responses carry `stopReason` without token usage counters, so token-meter estimates govern context pressure on ACP routes.
- **Interactive terminal login requires a local desktop session** — `launchTerminalLogin` opens an OS terminal window on the Host machine and cannot be completed on a headless server without a display or terminal emulator.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
