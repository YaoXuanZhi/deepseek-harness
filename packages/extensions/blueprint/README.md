---
description: "Host Blueprint service owning interactive Widgets, 12-column Canvas dashboards, Automations, and schema-validated Bindings."
kind: "package-reference"
---

# @deepseek-ai/dsh-blueprint

English | [中文](README.zh.md)

## Summary

`dsh-blueprint` provides the durable Host runtime (`ctx.blueprint`) and Typert Remote namespace (`ctx.remote.blueprint`) for Kimi Work's four-asset Blueprint system: sandboxed HTML/CSS/JS **Widgets** (`小组件`), 12-column & free-layout **Canvas** dashboards (`看板`), disabled-by-default **Automations** (`定时任务` / `小组件任务`), and JSON Schema-validated **Bindings** (`数据绑定`).

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

Mount `@deepseek-ai/dsh-blueprint` on the Host plane so presets can expose `@deepseek-ai/dsh-tool-blueprint` and Browser clients can render live widgets and dashboards through `@deepseek-ai/dsh-client-ui-blueprint`.

```yaml
- id: blueprint
  name: '@deepseek-ai/dsh-blueprint'
```

| Field | Default | Meaning |
|---|---|---|
| `root` | `dshHomePath('blueprint')` | Absolute directory storing `state.json`, `widgets/<id>/`, `automations/<id>/`, and `resources/<fileId>/`. |
| `schedulerTickMs` | `15000` | Polling interval in milliseconds for enabled `schedule`, `interval`, and `once` Automations (`0` disables timer ticks). |
| `maxRunsPerAutomation` | `50` | Maximum run history records retained per Automation. |
| `codeTimeoutMs` | `30000` | Execution timeout in milliseconds for Python `code` Automations. |
| `pythonCommand` | `'python'` on Windows, `'python3'` elsewhere | Python interpreter command used to execute `def run(ctx)` Automations. |
| `maxUploadBytes` | `262144000` (250 MiB) | Maximum byte size accepted for streamed user file uploads at `POST /blueprint/resources/upload`. |
| `maxReadTextBytes` | `10485760` (10 MiB) | Maximum byte size accepted for `DaimonWidget.files.readText` on a `FileResourceRef`. |
| `maxReadBytes` | `26214400` (25 MiB) | Maximum byte size accepted for `DaimonWidget.files.readBytes` on a `FileResourceRef`. |
| `maxWriteBytes` | `52428800` (50 MiB) | Maximum byte size accepted for `DaimonWidget.files.write` outputs. |
| `resourceUrlTtlMs` | `900000` (15 min) | Lifetime in milliseconds for capability-gated preview and download URLs under `/blueprint/resources/blob/<fileId>`. |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`BlueprintService` extends `TypertRemoteService` under namespace `'blueprint'` and emits `'blueprint/changed'` after every atomic state persistence. When `webServer` is present, it serves sandboxed Widget assets under `/blueprint/widgets` (`auth: 'required'`) with Kimi Perspective Design System CSS (`--kimi-*` / `--kp-*`) and `window.DaimonWidget` (including `DaimonWidget.files`) injected into `<head>`, accepts streamed large-file uploads at `POST /blueprint/resources/upload` (`auth: 'required'`), and serves expiring capability-gated blobs at `GET /blueprint/resources/blob/<fileId>`. Python `code` Automations also receive `ctx["resourcesDir"]` so large CSV, Excel, or binary `FileResourceRef` payloads can be processed directly from disk.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `BlueprintService` CRUD, HTTP sandboxed asset route, `@Remote` RPC methods, and Python Automation runner |
| [`src/runtime-assets.ts`](src/runtime-assets.ts) | Kimi Perspective CSS variables, `.kimi-*` host component classes, `<kimi-icon>` custom element, and `window.DaimonWidget` iframe runtime |
| [`src/kimi-icons.ts`](src/kimi-icons.ts) | Curated 105-icon Kimi Perspective `24x24` `currentColor` SVG dictionary backing `<kimi-icon>` |
| [`src/validation.ts`](src/validation.ts) | HTML validation, 12-column grid non-overlap solver, JSON Schema binding validator, and 5-field cron matcher |
| [`src/types.ts`](src/types.ts) | Shared branded IDs and four-asset wire records |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-tool-blueprint](../tool-blueprint/README.md) — Model-facing `Widget`, `Canvas`, `Binding`, and `Automation*` tools.
- [ui-blueprint](../../client/ui-blueprint/README.md) — Inline Widget iframes, Task Cards, and Dashboard (`看板`) views.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-blueprint`, which exposes the model-facing Blueprint tools and dashboard context over `ctx.blueprint`.

#### KV Cache effect

The Host service registers no system prompt or tool schema of its own; background Automation runs update Widget slot data on disk without altering conversation history prefixes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Python interpreter requirement for `code` Automations** — `execution.type === 'code'` requires a working `pythonCommand` on the Host; missing interpreters fail the run cleanly and surface the diagnostic on bound Widgets.
- **Process-local scheduler ticks** — scheduled Automations evaluate while the Host process is running; missed intervals while the Host is stopped are not backfilled automatically.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
