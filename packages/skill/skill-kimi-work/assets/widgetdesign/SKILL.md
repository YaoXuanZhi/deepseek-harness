---
name: widgetdesign
description: Kimi Perspective widget design system. Read this BEFORE authoring or updating any Widget HTML/CSS. Covers display surface choice, runtime contract, and conversation sizing; read references/design-system.md for visual rules, typography, chart colors, and host classes.
---

# Kimi Widget Design System (`widgetdesign`)

Design compact, high-signal visual or interactive answers following the system prompt's **Default visual policy**. Choose the layout, chart form, information density, and interactions that best serve the content within the Kimi Perspective design system. Static visuals are sufficient when interaction adds no analytical value.

Follow the system prompt's product terminology in visible UI text and accessibility labels (`小组件` / `widget`, `看板` / `dashboard`, `定时任务`, `小组件任务`).

## 1. Choose the Display Surface

Default to inline conversation display unless the user explicitly targets another surface. An architecture overview, multi-metric summary, side-by-side comparison, or multi-panel explorer can still be a single conversation widget.

- **Conversation only**: use the layout guidance in **Size in conversation** below. Do not read `references/layout-and-sizing.md` or the `canvas` skill for layout; grid spans, drag strips, and placement tiers do not apply.
- **Explicitly targeting a Canvas (`看板`), pinned window, or fullscreen**: read `references/layout-and-sizing.md` inside this skill's `resourceBase` directory for the 12-column (`1092px`) grid dimensions, top-strip pointer clearance, and `data-daimon-size-tier` rules, then design for a chosen span.
- **Moving an existing conversation widget onto a Canvas**: read `references/layout-and-sizing.md` and the `canvas` skill, inspect the existing HTML via `Widget({ action: 'read', id })`, and adjust only what the target placement needs while preserving content-driven height.

## 2. Mandatory Visual & Icon References

1. **Before writing any Widget HTML/CSS**, read `references/design-system.md` (under this skill's `resourceBase.path`) unless the user already fixed exact custom styling:
   - **Black/white/gray primary rule**: UI chrome, primary text, active tabs, selected chips, focus rings, and primary buttons use `--kimi-color-text-primary` and neutral grays — **never** accent blue (`--kimi-color-accent` is reserved strictly for data series and semantic markers).
   - **Preserve host surface**: keep `html`, `body`, and outer containers `background: transparent` so the host card/panel supplies light (`#FFFFFF` / `#FBFAF9`) and dark (`#1F1F1F` / `#181817`) surfaces seamlessly.
   - **Typography**: `font-family: var(--kimi-font-sans)` (`16px` base body, weights **400 and 500 only** — avoid `600`/`700`, sentence case always, `tabular-nums` via `.kimi-number` for metrics, `--kimi-font-mono` reserved strictly for code/identifiers/paths, never for hero numbers).
   - **Reusable host classes**: prefer `.kimi-page-title`, `.kimi-section-title`, `.kimi-text-secondary`, `.kimi-meta`, `.kimi-number`, `.kimi-code`, `.kimi-row`, `.kimi-stack`, `.kimi-grid`, `.kimi-panel`, `.kimi-button` (`--primary` / `--secondary` / `--ghost` / `--danger`), `.kimi-icon-button`, `.kimi-chip`, `.kimi-segmented`, `.kimi-row-actions`, `.kimi-field`, `.kimi-label`, `.kimi-input`, `.kimi-select`, `.kimi-textarea`, `.kimi-range`, `.kimi-switch`, `.kimi-status` (`--positive` / `--warning` / `--danger` / `--accent`), `.kimi-table`, and `.kimi-svg-*`.
   - **Geometry**: snap all spacing to `--kimi-space-1`..`--kimi-space-7` (`4/8/12/16/20/24/32px`), radii to `--kimi-radius-*`, with concentric nested corners (`inner = outer - padding`).
2. **If using icons**, read `references/icon-system.md` and grep `references/icons/manifest.json` (105 curated icons) to emit `<kimi-icon name="ExactManifestName"></kimi-icon>` (`<= 24px`, `currentColor`, never emoji as UI icons).

## 3. Runtime & Authoring Contract

Every Widget runs in a sandboxed iframe with the Kimi Perspective CSS, `<kimi-icon>` custom element, and `window.DaimonWidget` pre-loaded:

- Use clean HTML5, inline SVG/Canvas 2D, CSS, and vanilla JavaScript. Do not load external CDNs, remote fonts, or external stylesheets.
- Structure HTML in **streaming-friendly order**: `<style>` first, immediately meaningful HTML/SVG + inlined initial data second, `<script>` last.
- Put content inside one root wrapper with `padding-block-start: var(--kimi-space-4); padding-inline: var(--kimi-space-4); padding-block-end: var(--kimi-space-4); width: 100%;`.
- **Visual + prose division of labor**: after `Widget({ action: 'show', id })`, add in surrounding prose ONLY executive conclusions, root-cause analysis, prioritized risks, or next actions that the visual itself does not already show. Never repeat or narrate the widget's rows and numbers in prose.

## 4. Size in Conversation

- Let the outer wrapper fill `width: 100%` in normal document flow so the host measures natural content height accurately.
- Never set `height: 100%` or `100vh` on `html`, `body`, or the root wrapper, and avoid empty spacer blocks.
- Keep inline compositions compact and scannable within `720px` natural height (the desktop inline height cap before internal scrolling). When a dataset or breakdown is deep, use `.kimi-segmented` tabs, filter chips, or expandable detail drawers inside the widget rather than stacking a towering page.
