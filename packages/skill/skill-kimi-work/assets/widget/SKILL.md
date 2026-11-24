---
name: widget
description: Create, update, validate, and display interactive HTML/CSS/JS Widgets inline in conversation or inside a Canvas dashboard using the Widget tool and window.DaimonWidget runtime API.
---

# Interactive Widget Authoring

Use the `Widget` tool whenever visual structure communicates better than prose: side-by-side comparisons, interactive calculators, charts, timelines, architecture diagrams, metric cards, or live stateful tools. Skip widgets for short factual answers, casual chat, or standalone file deliverables.

## Lifecycle Workflow

1. **Design first**: Load `widgetdesign` for Kimi Perspective tokens (`--kp-*`), light/dark parity, and typography hierarchy.
2. **Create**: Call `Widget({ action: 'create', id, title, html, slots?, events?, latestData? })` (or write multi-file assets under the widget workspace).
   - `index.html` must be self-contained HTML5 with responsive layout (`width: 100%`, zero horizontal overflow at `360px`–`960px`).
   - Never rely on external CDN scripts when vanilla SVG, Canvas 2D, CSS Grid, and `window.DaimonWidget` suffice.
3. **Validate**: Call `Widget({ action: 'validate', id })` and fix any HTML/script/slot diagnostics before rendering.
4. **Show**: Call `Widget({ action: 'show', id, title })` so the conversation renders the live interactive card inline with **Pin to dashboard (`放入看板`)** and **Open in right panel (`在侧边栏打开`)** controls.

## `window.DaimonWidget` Runtime Contract

The host automatically injects the Kimi Perspective stylesheet and `window.DaimonWidget` into every widget frame before user scripts run. Read `references/runtime-api.md` when wiring dynamic slots, persistent user inputs, or automation triggers:

- `DaimonWidget.getSlot('main')` / `DaimonWidget.onSlot('main', data => render(data))` — read initial and live-bound data.
- `DaimonWidget.getSavedInput()` / `DaimonWidget.saveInput(patch)` — persist interactive controls across reloads.
- `DaimonWidget.emit('submit', payload)` — trigger a bound `Automation` from widget UI controls.
- `DaimonWidget.getTheme()` / `DaimonWidget.onTheme(theme => ...)` — react to `'light' | 'dark'` switches (`document.documentElement.dataset.theme` is also updated automatically).
- `DaimonWidget.resize(height?)` — notify the host after dynamic DOM expansion.
