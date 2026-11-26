---
description: "ACP 大语言模型提供商适配器与注册表协调服务：将 ACP Registry 及本地订阅制 ACP 服务接入 ctx.llm，同时保留 DeepSeek Harness 原生工具闭环。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-acp

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-llm-acp` 将遵循 Agent Client Protocol（ACP）的服务——包括通过官方 ACP Registry 分发（`npx`、`uvx`、`binary`）的订阅制编程代理以及本机安装的 ACP 可执行程序——作为原生模型路由接入 `ctx.llm`。`AcpLlmAdapter` 不会把工作区执行委托给外部代理自带的文件或终端工具，而是拒绝外部本地权限并通过单次请求生命周期的回环 Streamable HTTP MCP 桥接服务（`dsh_tools`）暴露当前激活的 DeepSeek Harness `ToolSchema[]`，将工具调用捕获为标准 `ToolCallBlock` 分片交回 DeepSeek Harness 自身的 `agent-loop`、蓝图小组件、子智能体与沙箱策略原生执行。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

`dsh-base` 默认以休眠姿态挂载 `@deepseek-ai/dsh-llm-acp`：在用户通过**设置 → 模型**（`@deepseek-ai/dsh-client-ui-settings-acp`）添加服务或在 `cordis.patch.yml` 的 `providers` 中声明路由之前，不会向 `ctx.llm` 注册任何额外模型。

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

| 字段 | 默认值 | 含义 |
|---|---|---|
| `registryRoot` | `dshHomePath('acp-registry')` | 保存缓存的 Registry 元数据、已安装分发包、`state.json`、`0o600` `secrets.json` 与隔离空工作区的目录 |
| `registryUrl` | `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json` | ACP Registry 目录索引的 HTTPS 地址 |
| `installTimeoutMs` | `600000` | 下载或安装 ACP Registry 分发包的超时毫秒数 |
| `probeTimeoutMs` | `25000` | 通过 `initialize` 与 `session/new` 探测 ACP 可执行程序的超时毫秒数 |
| `providers` | `{}` | 与界面管理条目合并的可选声明式 ACP 提供商路由 |

### 订阅授权登录与模型探测

不提供静态 API Key 的订阅制 ACP 服务可通过 `ctx.llmAcp` 及其 Typert Remote 命名空间提供的三种方式完成鉴权：

1. **网页 OAuth 授权（`startAuth`）**——拉起 ACP 子进程并调用 `initialize` 与 `authenticate`，实时捕获标准错误流或消息更新中的授权链接（`status: 'url_required'`），并在授权完成后自动重新探测模型目录。
2. **页内嵌入式 Web PTY 与系统终端登录（`startTerminalAuth`、`writeTerminalAuth`、`stopTerminalAuth`、`launchTerminalLogin`）**——通过 `ctx.subprocess.spawnTerminal` 直接在设置页内嵌伪终端完成交互登录（自动提取 `https://` 授权链接并在退出码 `0` 时自动重探测模型），同时也支持按需弹出本机系统终端窗口。
3. **只写环境变量密钥（`upsertProvider`）**——将敏感环境变量写入 `0o600` 权限的 `secrets.json`，且不会向浏览器快照回传明文密钥。

模型探测（`probeProvider`）在隔离空目录中执行 `initialize` 与 `session/new`，自动提取声明的 `authMethods`、可选模型列表（`configOptions` 类别 `model` 或 `id === 'model'`）、思考档位（`thought_level`）、`mcpCapabilities.http` 与 `promptCapabilities.image`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

`AcpLlmService` 继承命名空间为 `'llmAcp'` 的 `TypertRemoteService`，在目录变更时发出 `'llm-acp/changed'` 事件，并通过 `ctx.llm.registerAdapter` 实时同步已启用路由。每次调用 `ctx.llm.stream()` 时，`AcpLlmAdapter` 在 `$DSH_HOME/acp-registry/empty-workspace` 中拉起子进程，拒绝除 `dsh_tools` MCP 调用以外的一切 `session/request_permission` 请求，通过 `session/set_config_option` 应用所选模型与推理档位，并将 `agent_thought_chunk`、`agent_message_chunk` 及捕获的工具调用转换为 DeepSeek Harness `StreamChunk` 事件流。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `AcpLlmService` 持久化存储、`ctx.llm` 路由同步与 `@Remote` RPC 方法 |
| [`src/adapter.ts`](src/adapter.ts) | `AcpLlmAdapter` 流式实现与历史消息到 ACP 提示块的序列化 |
| [`src/mcp-tool-bridge.ts`](src/mcp-tool-bridge.ts) | 临时 `127.0.0.1:0` Streamable HTTP / `McpServerStdio` 桥接与 `<dsh_tool_call>` XML 降级解析 |
| [`src/probe-auth.ts`](src/probe-auth.ts) | 子进程生命周期、`initialize` + `session/new` 探测、OAuth 链接捕获与交互登录命令推导 |
| [`src/pty-auth.ts`](src/pty-auth.ts) | `EmbeddedPtyAuthManager` 页内交互式 Web PTY 登录会话、链接识别与零退出码自动探测 |
| [`src/registry.ts`](src/registry.ts) | ACP Registry 索引缓存及 `binary` / `npx` / `uvx` 沙箱隔离安装 |
| [`src/types.ts`](src/types.ts) | 品牌化 `AcpLlmProviderId`、Remote 传输结构、错误详情与 Cordis `Events` |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-llm 服务](../llm/README.zh.md)——提供方无关的 `LlmAdapter` 注册表与 `StreamChunk` 契约。
- [ui-settings-acp](../../client/ui-settings-acp/README.zh.md)——提供 ACP Registry 搜索、OAuth/终端授权登录与服务编辑的浏览器设置界面。
- [dsh-acp](../../acp/acp/README.zh.md)——将 DeepSeek Harness 自身暴露给外部 ACP 客户端的入站 ACP 服务端。

-----

<a id="model-experience"></a>
## 模型体验

### ACP 提示词与工具桥接投影

#### 模型看到的内容

`AcpLlmAdapter` 将 `GenerateOptions.system` 封装在 `<system_instructions>` 标签内，并将历史 `user`、`assistant` 与 `tool` 消息按顺序序列化为结构化记录块（`<user_message>`、`<assistant_message>`、`<tool_call>` 与 `<tool_result>`）；当提供商支持图片输入时，未卸载的用户图片会作为原生 ACP `image` 内容块传递。当 ACP 代理声明 `mcpCapabilities.http` 时，当前激活的 `ToolSchema[]` 通过单次请求的回环 HTTP MCP 服务（`dsh_tools`）暴露，不注入额外提示文本；当代理未声明 `mcpCapabilities.http` 且 `GenerateOptions.tools` 非空时，`buildAcpPromptBlocks` 会注入下方降级 `<dsh_tool_call>` 指令以及每项工具声明的单行 JSON。

##### 面向不支持 HTTP MCP 的 ACP 代理的降级工具调用指令

```markdown
[Available DeepSeek Harness Tools]
You do not have direct local filesystem or shell access inside this transport.
Whenever you need to invoke one or more tools, output ONLY valid JSON objects wrapped in <dsh_tool_call>...</dsh_tool_call> tags, then stop immediately and wait for the host tool results:
<dsh_tool_call>{"name":"ToolName","arguments":{}}</dsh_tool_call>
Tool declarations:
```

#### Token 影响

每次请求向外部 ACP 代理发送组装后的系统提示词、会话历史，以及通过 MCP 列出或降级序列化的工具声明；标准 ACP `session/prompt` 未返回精确 token 计数，因此在协议扩展提供用量前 `StreamChunk` 的用量字段保持为 `0`。

#### KV 缓存影响

每次 `ctx.llm.stream()` 调用都会建立全新的无状态 ACP 会话，并以确定性的 `<system_instructions>` 与按时间排序的历史块作为前缀；只要底层 ACP 代理向其上游模型转发稳定前缀，仅追加的对话轮次即可保持上游提示词缓存复用。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **按请求建立无状态 ACP 会话**——每次 `stream()` 调用都会建立新 ACP 会话并重放由 harness 持有的会话历史，以确保上下文压缩、分支与跨模型切换以 DeepSeek Harness 日志为准；仅保存在外部常驻 ACP 进程内存中的会话状态不会跨轮复用。
- **用量统计受限于 ACP 协议返回字段**——标准 ACP `session/prompt` 响应仅携带 `stopReason` 而不含 token 计数器，因此 ACP 路由上的上下文压力由 `token-meter` 估算规则驱动。
- **弹出外部系统终端依赖本机桌面会话**——内嵌的 `startTerminalAuth` 支持在无头远程服务器上通过浏览器伪终端完成登录，而备选的 `launchTerminalLogin` 外部弹窗按钮仍需宿主具备本地图形界面或终端模拟器。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
