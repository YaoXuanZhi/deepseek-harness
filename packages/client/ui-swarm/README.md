---
description: "Composer Swarm mode toggle chip and multi-role parallel assistant matrix card with fine-grained live activity, tool counts, and conclusion digests."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-swarm

English | [中文](README.zh.md)

## Summary

`ui-swarm` renders Kimi Work's `集群` (`Swarm`) and multi-role subagent surfaces in the Web and Desktop GUI: a toggle chip in the composer tool row (`conversation.input.left`), a Swarm-active composer placeholder, and the Parallel Role Assistant Matrix Card (`tool.call.toolview` and `conversation.chat.turnTail`) displaying specialist role badges, fine-grained live activity (`Thinking`, `Searching`, `Reading`, `Writing`, `Running command`, `Checking sources`, `Analyzing`), tool call counts, inline 1-2 sentence conclusion digests, and one-click Right Sidebar transcript inspection.

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

Mount `@deepseek-ai/dsh-client-ui-swarm` in the browser plugin roster alongside `ui-conversation`, `ui-tool`, `ui-subagent`, and the Host preset's `@deepseek-ai/dsh-swarm-mode`.

### Surfaces

- **Composer `集群` (`Swarm`) chip**: Renders in `conversation.input.left` whenever the active Session exposes the `swarm` projection. Clicking toggles `/swarm` and `/swarm off` through `ctx.remote.commands.execute`.
- **Parallel Role Assistant Matrix Card**: Renders both for `agent_swarm` (`items`, `roles`, and `resume_agent_ids`) and in `conversation.chat.turnTail` whenever a Turn runs `agent_swarm` or 2+ parallel `subagent` / `subagent_fork` delegations, showing live `{done}/{total}` progress, fine-grained activity, `{tools} tools`, inline conclusion summaries, and click-to-inspect in `ctx.sidebarRight`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`SwarmModeControl` reads the `swarm` session projection via `useProjection('swarm')` (`pending ? !active : active`). `SwarmToolView` and `SwarmTurnTail` join `agent_swarm` or grouped `subagent` child records with the parent session's `subagentCatalog`, each child session's summary-delivered `subagentActivity` projection (`busyKind`, `toolCallCount`, `summary`), and `useSessionStatus`, opening child conversations through `dsh-resource://subagentchat/session/...`.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Slot registrations for `conversation.input.left`, `conversation.input.placeholder`, `tool.call.toolview`, and `conversation.chat.turnTail` |
| [`src/client/SwarmModeControl.tsx`](src/client/SwarmModeControl.tsx) | Composer Swarm toggle chip |
| [`src/client/SwarmToolView.tsx`](src/client/SwarmToolView.tsx) | Multi-role Parallel Assistant Matrix Card with live activity, tool counts, and summary digests |
| [`src/client/turn-swarm.ts`](src/client/turn-swarm.ts) | Turn-scoped accumulator for `agent_swarm` batches and 2+ parallel `subagent` delegations |
| [`src/client/locales.ts`](src/client/locales.ts) | Complete 8-language UI dictionary |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-swarm-mode](../../subagent/swarm-mode/README.md) — Host `/swarm` command, `subagentActivity` projection, `<git-context>`, and `agent_swarm` synthesis tool.
- [ui-subagent](../ui-subagent/README.md) — Right-sidebar `subagentchat` resource viewer.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the `/swarm` and `/swarm off` commands the composer chip dispatches: `dsh-swarm-mode` owns the model-visible `swarm:policy` and `swarm:status` prompt sections and the `agent_swarm` tool schema.

#### KV Cache effect

Toggling Swarm mode appends `swarm:status` on the Host from the next model step; browser rendering of the matrix card adds no model input.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Requires `ui-subagent` for Right Sidebar transcript view** — clicking a child tile opens `dsh-resource://subagentchat/session/...`, which requires `ui-subagent` in the browser composition.
- **Preset-scoped visibility** — sessions using a preset without `dsh-swarm-mode` expose no `swarm` projection and hide the composer toggle chip.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
