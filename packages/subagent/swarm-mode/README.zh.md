---
description: "集群协作模式（/swarm）、角色子代理实时活动投影、仓库 git-context 注入与整批 agent_swarm XML 信息汇总工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-swarm-mode

[English](README.md) | 中文

## 概述

`dsh-swarm-mode` 提供与 Kimi Work 完全对齐的角色子代理协同编排（`集群` / Swarm 模式）与配套信息汇总机制：通过 `/swarm`（或 `/swarm <任务>`）开启，通过 `/swarm off` 退出。本包注册 `swarm` 与 `subagentActivity` 会话投影，导出供 `explore` 与 `plan` 角色首轮注入仓库快照的 `@deepseek-ai/dsh-swarm-mode/git-context` 插件，并通过 `agent_swarm` 支持同构批量工作项（`items`）、异构多角色专家会诊（`roles`）及保留上下文的失败续跑（`resume_agent_ids`），在整批完成后统一返回 `<agent_swarm_result>` XML 汇总结果块。

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

在主智能体预设中将 `@deepseek-ai/dsh-swarm-mode` 与 `dsh-subagent` 及专业角色预设（`coder`、`explore`、`plan`）一同挂载，并在只读探索/规划预设中挂载 `@deepseek-ai/dsh-swarm-mode/git-context`：

```yaml
- id: swarm-mode
  name: '@deepseek-ai/dsh-swarm-mode'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `section` | 内置集群与信息汇总策略 | 进入集群模式后渲染在 `swarm:policy` 中的编排与整合指引。 |
| `defaultPreset` | `'coder'` | 未指定 `agent_preset` 且 `fork` 为 `false` 时的默认子代理预设。 |
| `allowedPresets` | `['coder', 'explore', 'plan']` | `agent_swarm` 可选的专业角色预设列表。 |
| `maxItems` | `128` | 单次 `agent_swarm` 调用允许的最大并行子代理数（`1..128`）。 |
| `spawnProvider` | `'spawn'` | `fork` 为 `false` 时使用的 `ctx.subagents` 提供方。 |
| `forkProvider` | `'fork'` | `fork` 为 `true` 时使用的 `ctx.subagents` 提供方。 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

`swarmProjectionDefinition` 从会话日志中的 `command/run` 与 `command/done`（`name === 'swarm'`）折叠出 `{ active, pending }`；`subagentActivityProjectionDefinition` 从各子代理会话折叠工具调用计数、细粒度活动状态（`thinking`、`search`、`read`、`write`、`run`、`browse`、`analyze`、`work`）与 1–2 句核心结论摘要，并随会话摘要实时推送至前端。`agent_swarm` 以 `delivery: 'caller'` 受控并发收集新建子代理结果或通过 `ctx.subagents.sendMessage` 续跑已有子代理，最终组装包含 `<summary>`、可选 `<resume_hint>` 与有序 `<subagent>` 节点的 `<agent_swarm_result>` XML 信封。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `SwarmModeController` 服务、`/swarm` 命令、系统提示段落与整批汇总版 `agent_swarm` 工具 |
| [`src/projection.ts`](src/projection.ts) | `swarm` 与 `subagentActivity` 投影、结论摘要提取及 `<agent_swarm_result>` XML 生成器 |
| [`src/git-context.ts`](src/git-context.ts) | 持久化首轮 `<git-context>` 仓库快照注入插件（`@deepseek-ai/dsh-swarm-mode/git-context`） |
| [`src/types.ts`](src/types.ts) | `SwarmProjection`、`SubagentActivityProjection`、`SwarmRoleSpec` 与 `SwarmBatchOutput` 类型声明 |
| [`src/client.ts`](src/client.ts) | 浏览器安全的类型重导出入口 |
| [`src/error.ts`](src/error.ts) | `SwarmModeError` 结构化错误类 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [子代理运行时](../subagent/README.zh.md) — 子代理激活、并发上限与续跑消息传递。
- [集群模式界面控件](../../client/ui-swarm/README.zh.md) — 输入框集群切换胶囊与带细粒度实时动态及结论摘要的多角色矩阵卡片。
- [工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-swarm-mode) — 生成的 `agent_swarm` 参数结构。

-----

<a id="model-experience"></a>
## 模型体验

### Swarm policy system prompt

#### 模型看到的内容

在会话首次执行 `/swarm` 前，`swarm:policy` 与 `swarm:status` 均不输出文本。首次进入后，`swarm:policy` 输出并行拆解、多角色 `roles` 专家协同、`resume_agent_ids` 故障续跑与配套信息汇总规范，`swarm:status` 说明集群模式当前处于激活或关闭状态。

##### Default Swarm policy

```markdown
You are in Swarm mode (`集群` / multi-role parallel assistant orchestration).
1. **Orient lightly first**: inspect key entrypoints or run a narrow search so scope boundaries are accurate; do not read every target file yourself before delegating.
2. **Fan out independent work via `agent_swarm` (up to 128 assistants)**:
   - **Homogeneous fan-out (`items` + `prompt_template`)**: when applying the same audit, exploration, or scoped change across 2+ modules, files, or competitors, pass `items`, `prompt_template` (with `{{item}}`), and `agent_preset` (`explore`, `plan`, or `coder`).
   - **Multi-role specialist panel (`roles`)**: when evaluating a complex design, trade-off, review, or multi-perspective investigation, pass `roles` (`[{ role, preset, prompt }, ...]`) to consult distinct specialists in parallel.
3. **Self-contained role contracts**: give each assistant explicit scope boundaries, non-overlapping file ownership whenever `coder` edits files, and require a 1-2 sentence executive takeaway followed by verified file paths, line ranges, or concrete facts.
4. **Recover instead of restarting**: `agent_swarm` collects the entire batch and returns one `<agent_swarm_result>` XML block. If any `<subagent>` reports `outcome="failed"` or `outcome="aborted"`, call `agent_swarm` with `resume_agent_ids` to continue from its preserved context.
5. **Companion Information Synthesis (`配套信息汇总`)**: never dump or narrate raw subagent outputs sequentially; reconcile all `<subagent>` findings into ONE cohesive synthesis with a centralized comparison table and inline evidence.
```

#### Token 影响

首次进入前为零；进入后保留策略文本，后续切换仅追加单句状态提示。

#### KV Cache 影响

未启用集群模式的会话不产生任何系统提示变动；模式切换通过追加状态消息保持前序缓存前缀稳定。

### Swarm batch tool schema and execution

#### 模型看到的内容

[`agent_swarm` 工具定义](../../../docs/tool-catalog.zh.md#deepseek-aidsh-swarm-mode)接收 `description`、同构 `items` + `prompt_template`、异构多角色 `roles`、`resume_agent_ids`、`agent_preset` / `subagent_type` 与 `fork`，在整批任务全部完成后一次性返回单个 `<agent_swarm_result>` XML 汇总信封。

#### Token 影响

以单次 `<agent_swarm_result>` 工具结果替代 N 次分散的异步子代理通知轮次，显著减少父会话中间轮次与上下文重复回放开销。

#### KV Cache 影响

`agent_swarm` 工具声明在模式切换前后保持不变，避免因工具列表变化导致请求前缀缓存失效。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **提示词驱动的拆解策略** — 集群模式通过提示词引导并行拆解；当用户或技能显式要求多角色会诊或批量并发时，未开启 `/swarm` 仍可直接调用 `agent_swarm`。
- **整批同步收敛** — `agent_swarm` 会等待当批所有任务全部收敛后统一返回 `<agent_swarm_result>`；若需后台异步边跑边做其他工作，可使用单点 `subagent` 工具。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
