---
description: "输入框集群模式切换胶囊与支持细粒度实时状态、工具计数及内联结论摘要的多角色并行助手矩阵卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-swarm

[English](README.md) | 中文

## 概述

`ui-swarm` 在 Web 与桌面端界面渲染与 Kimi Work 完全一致的 `集群`（Swarm）及多角色子代理协同视图：包括输入框工具栏左侧的 `集群` 模式切换胶囊（`conversation.input.left`）、集群激活态输入占位提示，以及展示专业角色徽章、细粒度实时活动状态（正在思考、正在搜索、正在阅读、正在编写、正在执行命令、正在查阅资料、正在分析）、工具调用计数、内联 1–2 句结论摘要与右侧栏一键查看轨迹的多角色并行助手矩阵卡片（`tool.call.toolview` 与 `conversation.chat.turnTail`）。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在浏览器插件列表中将 `@deepseek-ai/dsh-client-ui-swarm` 与 `ui-conversation`、`ui-tool`、`ui-subagent` 以及宿主预设中的 `@deepseek-ai/dsh-swarm-mode` 一同挂载。

### 界面入口

- **输入框 `集群` 切换胶囊**：当当前会话公开 `swarm` 投影时展示在 `conversation.input.left`，点击即可通过 `ctx.remote.commands.execute` 切换 `/swarm` 与 `/swarm off`。
- **多角色并行助手矩阵卡片**：同时承载 `agent_swarm`（`items`、`roles` 与 `resume_agent_ids`）以及同一轮次内 2 个以上并行 `subagent` / `subagent_fork` 调用的 `conversation.chat.turnTail` 常驻矩阵卡，实时展示 `{done}/{total} 个助手已完成任务`、细粒度工作动态、`{tools} 个工具`、角色核心结论摘要，并支持点击任意卡片在 `ctx.sidebarRight` 打开对应子代理完整对话。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

`SwarmModeControl` 通过 `useProjection('swarm')` 读取宿主折叠状态（`pending ? !active : active`）。`SwarmToolView` 与 `SwarmTurnTail` 将 `agent_swarm` 或同轮次聚合的并行 `subagent` 子代理条目与父会话 `subagentCatalog`、子会话随摘要推送的 `subagentActivity` 投影（`busyKind`、`toolCallCount`、`summary`）及 `useSessionStatus` 状态表关联，并通过 `dsh-resource://subagentchat/session/...` 在右侧边栏打开子会话。

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 注册 `conversation.input.left`、`conversation.input.placeholder`、`tool.call.toolview` 与 `conversation.chat.turnTail` 插槽 |
| [`src/client/SwarmModeControl.tsx`](src/client/SwarmModeControl.tsx) | 输入框集群模式切换胶囊组件 |
| [`src/client/SwarmToolView.tsx`](src/client/SwarmToolView.tsx) | 支持细粒度实时动态、工具计数与结论摘要的多角色并行矩阵卡片组件 |
| [`src/client/turn-swarm.ts`](src/client/turn-swarm.ts) | 轮次级 `agent_swarm` 批次与 2+ 并行 `subagent` 聚合累加器 |
| [`src/client/locales.ts`](src/client/locales.ts) | 完整八语种界面字典 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-swarm-mode](../../subagent/swarm-mode/README.zh.md) — 宿主侧 `/swarm` 命令、`subagentActivity` 投影、`<git-context>` 注入与 `agent_swarm` 汇总工具。
- [ui-subagent](../ui-subagent/README.zh.md) — 右侧边栏 `subagentchat` 子代理对话视图。

-----

<a id="model-experience"></a>
## 模型体验

间接影响：输入框胶囊仅派发 `/swarm` 与 `/swarm off` 命令，模型可见的 `swarm:policy`、`swarm:status` 提示段落及 `agent_swarm` 工具结构均由 `dsh-swarm-mode` 负责。

#### KV Cache 影响

切换集群模式后，宿主在下一步追加 `swarm:status` 状态提示；浏览器端渲染矩阵卡片不向模型请求添加任何内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **右侧边栏详情依赖 `ui-subagent`** — 点击子代理卡片会打开 `dsh-resource://subagentchat/session/...`，需浏览器组合中包含 `ui-subagent`。
- **随预设按需展示** — 未挂载 `dsh-swarm-mode` 的会话预设不会公开 `swarm` 投影，输入框切换胶囊会自动隐藏。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
