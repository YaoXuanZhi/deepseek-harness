---
description: "Swarm collaboration mode (/swarm), role subagent live activity projection, repository git-context injection, and whole-batch agent_swarm XML synthesis."
kind: "package-reference"
---

# @deepseek-ai/dsh-swarm-mode

English | [中文](README.zh.md)

## Summary

`dsh-swarm-mode` provides Kimi Work-aligned role subagent orchestration (`集群` / Swarm mode) and companion information synthesis: enter with `/swarm` (or `/swarm <task>`) and leave with `/swarm off`. It registers the `swarm` and `subagentActivity` session projections, exports `@deepseek-ai/dsh-swarm-mode/git-context` for durable step-1 repository snapshots on `explore` and `plan` specialists, and exposes `agent_swarm` to run homogeneous `items`, heterogeneous multi-role specialist panels (`roles`), or preserved-context continuations (`resume_agent_ids`) and return one unified `<agent_swarm_result>` XML synthesis block.

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

Mount `@deepseek-ai/dsh-swarm-mode` inside a lead preset alongside `dsh-subagent` and the specialist presets (`coder`, `explore`, `plan`), and mount `@deepseek-ai/dsh-swarm-mode/git-context` inside read-only discovery/planning presets:

```yaml
- id: swarm-mode
  name: '@deepseek-ai/dsh-swarm-mode'
```

| Field | Default | Meaning |
|---|---|---|
| `section` | Built-in Swarm & synthesis policy | Guidance rendered in `swarm:policy` once Swarm mode is entered. |
| `defaultPreset` | `'coder'` | Default child preset when `agent_preset` is omitted and `fork` is false. |
| `allowedPresets` | `['coder', 'explore', 'plan']` | Specialist presets selectable by `agent_swarm`. |
| `maxItems` | `128` | Maximum parallel subagents accepted in one `agent_swarm` invocation (`1..128`). |
| `spawnProvider` | `'spawn'` | `ctx.subagents` provider used when `fork` is false. |
| `forkProvider` | `'fork'` | `ctx.subagents` provider used when `fork` is true. |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`swarmProjectionDefinition` folds logged `command/run` and `command/done` events for `name === 'swarm'` into `{ active, pending }`, while `subagentActivityProjectionDefinition` folds each subagent session's post-descriptor `tool/call` count, fine-grained `busyKind` (`thinking`, `search`, `read`, `write`, `run`, `browse`, `analyze`, `work`), and 1-2 sentence `summary` digest into summary-delivered session projections. `agent_swarm` launches `delivery: 'caller'` activations or resumes existing continuable subagents via `ctx.subagents.sendMessage`, collects every outcome in bounded concurrency, and formats `<agent_swarm_result>` XML with `<summary>`, optional `<resume_hint>`, and `<subagent>` blocks.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `SwarmModeController` service, `/swarm` command, prompt sections, and whole-batch `agent_swarm` tool |
| [`src/projection.ts`](src/projection.ts) | `swarm` and `subagentActivity` projections, summary digest extraction, and `<agent_swarm_result>` XML renderer |
| [`src/git-context.ts`](src/git-context.ts) | Durable step-1 `<git-context>` snapshot plugin (`@deepseek-ai/dsh-swarm-mode/git-context`) |
| [`src/types.ts`](src/types.ts) | `SwarmProjection`, `SubagentActivityProjection`, `SwarmRoleSpec`, and `SwarmBatchOutput` types |
| [`src/client.ts`](src/client.ts) | Browser-safe type re-export |
| [`src/error.ts`](src/error.ts) | `SwarmModeError` coded failure class |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Subagent runtime](../subagent/README.md) — child activation, concurrency limits, and continuation messaging.
- [Swarm UI controls](../../client/ui-swarm/README.md) — composer toggle chip and multi-role matrix card with live activity and conclusion digests.
- [Tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-swarm-mode) — generated `agent_swarm` schema.

-----

<a id="model-experience"></a>
## Model Experience

### Swarm policy system prompt

#### What the model sees

Before the first `/swarm` entry in a Session, neither `swarm:policy` nor `swarm:status` renders text. From the first entry onward, `swarm:policy` contributes parallel decomposition, multi-role `roles` consultation, `resume_agent_ids` recovery, and companion synthesis rules, while `swarm:status` reports whether Swarm mode is currently active or inactive.

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

#### Token effect

Zero prompt tokens before first entry; once entered, `swarm:policy` stays retained and mode toggles append a one-sentence `swarm:status` update.

#### KV Cache effect

Inactive sessions pay no section updates; toggling `/swarm` appends status updates without rewriting earlier messages.

### Swarm batch tool schema and execution

#### What the model sees

The [`agent_swarm` schema](../../../docs/tool-catalog.md#deepseek-aidsh-swarm-mode) accepts `description`, homogeneous `items` + `prompt_template`, heterogeneous `roles`, `resume_agent_ids`, `agent_preset` / `subagent_type`, and `fork`, returning a single `<agent_swarm_result>` XML envelope once all tasks in the batch settle.

#### Token effect

Replacing N separate asynchronous subagent completion turns with one `<agent_swarm_result>` tool result eliminates intermediate parent turns and redundant context replay.

#### KV Cache effect

The `agent_swarm` declaration remains static across turns so toggling `/swarm` never invalidates the tool-declaration cache prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Guidance-driven fan-out** — Swarm mode steers decomposition through prompt policy; `agent_swarm` remains callable outside Swarm mode when a user or skill explicitly requests multi-role or batch delegation.
- **Whole-batch settlement** — `agent_swarm` waits for every task in the batch to finish before returning `<agent_swarm_result>`; use standalone `subagent` when fire-and-continue background execution is preferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
