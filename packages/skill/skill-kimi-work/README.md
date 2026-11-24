---
description: "Bundled Kimi Work skills for progressive loading of Blueprint widget, dashboard, automation, binding, visual design, and deep-research workflows."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-kimi-work

English | [中文](README.zh.md)

## Summary

Registers seven built-in Kimi Work skills on `ctx.skills` — `blueprint`, `widget`, `widgetdesign`, `canvas`, `automation`, `binding`, and `deep-research` — so agents discover compact one-line summaries in the session skill catalog and load full instructions on demand through [`dsh-tool-skill`](../tool-skill/README.md).

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

Mount this provider alongside `dsh-skill`, `dsh-tool-skill`, and `@deepseek-ai/dsh-tool-blueprint` so agents can load Blueprint authoring instructions and execute the corresponding `Widget`, `Canvas`, `Binding`, `AutomationCreate`, `AutomationUpdate`, and `AutomationControl` tools.

```yaml
- name: '@deepseek-ai/dsh-skill-kimi-work'
```

| Field | Default | Meaning |
|---|---|---|
| `assetRoot` | Bundled `assets/` | Absolute path containing one `<skill>/SKILL.md` directory per bundled Kimi Work skill. |

Relative `assetRoot` values skip registration with a warning. Missing or malformed `SKILL.md` files are logged and omitted from discovery; if a previously discovered file disappears before `load()`, the provider omits it and invalidates `ctx.skills`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The provider registers under source `'kimi-work'` at priority `10`, matching bundled skill precedence so project or user filesystem skills with the same name can override any built-in workflow. `load(name)` returns `baseDir` pointing at `assets/<name>` so relative references such as `widget/references/runtime-api.md` and `widgetdesign/references/design-system.md` resolve cleanly.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Registers the `'kimi-work'` skill provider, validates `SKILL.md` frontmatter, and handles removal/disposal. |
| [`assets/`](assets/) | Bundled `SKILL.md` workflows and reference documents for Blueprint, Widget design, Canvas, Automation, Binding, and Deep Research. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Skill registry](../skill/README.md) — provider priority and catalog merging.
- [Skill tool](../tool-skill/README.md) — session skill catalog rendering and `skill` loader execution.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-skill`, which renders one summary line per bundled Kimi Work skill in the session catalog and returns the full `SKILL.md` body when `skill(<name>)` is called.

#### KV Cache effect

Unchanged skill summaries stay fixed in the session catalog; loading a skill appends its `SKILL.md` body to conversation history as an ordinary tool result without rewriting earlier messages. Omitting an unreadable skill invalidates the catalog for subsequent steps.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Missing or malformed bundled `SKILL.md` files are permanently omitted for the lifetime of the provider instance until plugin reload or process restart.
- Reference Markdown files under `assets/<skill>/references/` are read on demand through filesystem tools rather than inlined into initial `skill()` output.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
