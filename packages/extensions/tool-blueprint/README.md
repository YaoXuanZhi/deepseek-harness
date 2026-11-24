---
description: "Model-facing Blueprint tools (Widget, Canvas, Binding, AutomationCreate, AutomationUpdate, AutomationControl) and dashboard discovery context."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-blueprint

English | [中文](README.zh.md)

## Summary

Exposes Kimi Work's six Blueprint tools — `Widget`, `Canvas`, `Binding`, `AutomationCreate`, `AutomationUpdate`, and `AutomationControl` — on `ctx.tools` together with dynamic runtime context listing existing dashboards (`Canvas`) so agents create interactive inline widgets, multi-widget dashboards, and schema-validated automations.

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

Mount `@deepseek-ai/dsh-tool-blueprint` inside an agent preset alongside Host `@deepseek-ai/dsh-blueprint` and `@deepseek-ai/dsh-skill-kimi-work`:

```yaml
- id: tool-blueprint
  name: '@deepseek-ai/dsh-tool-blueprint'
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each tool delegates persistence, HTML/schema validation, and execution to `ctx.blueprint` while attaching compact `presentationMeta` records (`widget`, `canvas`, `automation`, `binding`) so `@deepseek-ai/dsh-client-ui-blueprint` renders live sandboxed iframes, Dashboard preview cards, and interactive Task Cards directly from persisted tool metadata.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Six tool definitions (`Widget`, `Canvas`, `Binding`, `AutomationCreate`, `AutomationUpdate`, `AutomationControl`) and `blueprint:canvases` runtime context |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-blueprint](../blueprint/README.md) — Host asset store, validator, and automation runner.
- [ui-blueprint](../../client/ui-blueprint/README.md) — Browser rendering of Widget frames, Task Cards, and Dashboards.
- [Tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-blueprint) — Generated Blueprint tool schemas.

-----

<a id="model-experience"></a>
## Model Experience

### Blueprint tool schemas and results

#### What the model sees

The [`Widget`, `Canvas`, `Binding`, `AutomationCreate`, `AutomationUpdate`, and `AutomationControl` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-blueprint) accept structured asset actions and return concise confirmation or validation diagnostics while storing rich browser presentation metadata outside model-visible text.

#### Token effect

Fixed declaration cost for the six tool schemas in presets that mount this plugin, plus short single-line summaries per tool call unless `Widget` `read` or `read_file` is requested explicitly.

#### KV Cache effect

Tool declarations remain static across steps; tool calls and results append normally to conversation history.

### Existing dashboard runtime context

#### What the model sees

When one or more Canvas dashboards exist in `ctx.blueprint`, the optional `blueprint:canvases` runtime context lists each dashboard's `id`, `title`, widget count, and layout mode; when none exist, it emits nothing.

#### Token effect

Zero tokens when no dashboards exist; one short summary line per existing dashboard otherwise.

#### KV Cache effect

Runtime context attaches at the dynamic request tail without mutating the static system-prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **JSON-encoded nested schemas** — `slots_json`, `events_json`, `input_schema_json`, and `result_schema_json` take JSON strings so flat tool parameter schemas stay compatible across every LLM provider adapter.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
