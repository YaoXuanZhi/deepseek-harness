---
name: canvas
description: Compose, arrange, and update persistent multi-widget Dashboards (看板) on a 12-column grid or free canvas using the Canvas tool and daimon-canvas preview cards.
---

# Dashboard (`Canvas`) Composition

A `Canvas` (`看板` / `dashboard`) arranges multiple validated `Widget`s into a persistent workspace board accessible from the left sidebar (`看板`) and right panel.

## 12-Column Grid Geometry

- **Columns**: `12` columns (`x` in `0..11`, `w` in `2..12`, `x + w <= 12`).
- **Row unit**: `32px` per row unit with `12px` grid gap (`h` in `2..33`, default tile `w: 5, h: 8` or `w: 6, h: 8`).
- **Recommended Archetypes**:
  - **KPI Top Row**: Three `w: 4, h: 4` summary cards at `y: 0` (`x: 0`, `x: 4`, `x: 8`), or two `w: 6, h: 4` cards.
  - **Primary Comparison / Chart Row**: `w: 7, h: 9` main chart (`x: 0, y: 4`) paired with `w: 5, h: 9` breakdown/control widget (`x: 7, y: 4`).
  - **Full-Width Table / Timeline**: `w: 12, h: 8` at the bottom row.
- **Zero Overlap Rule**: Never place two grid items whose `(x..x+w, y..y+h)` rectangles intersect.

## Workflow

1. Check existing dashboards with `Canvas({ action: 'list' })` to update an existing board when continuing the same topic, or create a new one with `Canvas({ action: 'create', title, description, layoutMode: 'grid' })`.
2. Ensure every widget has passed `Widget({ action: 'validate', id })`.
3. Place each widget via `Canvas({ action: 'place_widget', canvasId, widgetId, rect: { x, y, w, h } })`.
4. Surface the dashboard in your final response using a `daimon-canvas` fenced block so the user gets a clickable dashboard card:

````markdown
```daimon-canvas
{"canvasId":"<canvas-id>","title":"<看板标题>"}
```
````
