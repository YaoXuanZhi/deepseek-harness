---
name: canvas
description: Create, inspect, arrange, and update persistent multi-widget Dashboards (看板) on the 12-column 1092px grid or free layout using the Canvas tool and daimon-canvas preview cards.
---

# Dashboard (`Canvas` / `看板`) Composition

A `Canvas` (`看板` / `dashboard`) arranges validated `Widget`s onto a persistent workspace board accessible from the left sidebar (`看板`) and right split panel. Canvas owns placement geometry (`x, y, w, h`) and viewport state; Widget definitions, data, and Automations remain owned by their respective assets.

## 1. 12-Column `1092px` Grid Geometry

The grid has **12 columns** (`80px` column width, `32px` row height, `12px` gap -> `w * 80 + (w - 1) * 12` wide by `h * 32 + (h - 1) * 12` high; full 12-column board width = `1092px`):

| Placement Tier | Grid Span (`w x h`) | Rendered Design Pixels | Typical Content |
|---|---|---|---|
| Minimum | `2 x 2` | `172 x 76 px` | Single compact badge / micro-stat |
| KPI / Summary Tile | `4 x 4` or `6 x 4` | `356 x 164 px` / `540 x 164 px` | Top-row headline KPIs (3×`4x4` or 2×`6x4`) |
| Default Card | `5 x 8` or `6 x 8` | `448 x 340 px` / `540 x 340 px` | Trend chart, breakdown list, interactive calculator |
| Primary + Side Pair | `7 x 9` + `5 x 9` | `632 x 384 px` + `448 x 384 px` | Main architecture/chart on left (`x: 0`), filter/detail on right (`x: 7`) |
| Full-Width Section | `12 x 8` .. `12 x 14` | `1092 x 340..604 px` | Comparison matrix, timeline, or solo-widget full-board view |

- **Zero overlap rule**: Never place two grid items whose `(x..x+w, y..y+h)` rectangles intersect (`0 <= x`, `2 <= w <= 12`, `x + w <= 12`, `2 <= h <= 33`).
- **Top-strip pointer clearance**: Canvas tiles reserve top-edge drag/hover chrome (`~36px`); read `widgetdesign/references/layout-and-sizing.md` when designing or adapting a widget specifically for Canvas so interactive buttons/chips sit cleanly below the header row.

## 2. Standard Workflow

1. **Inspect existing boards first**: Call `Canvas({ action: 'list' })` to reuse or update an existing topic dashboard when appropriate, or create a new one with `Canvas({ action: 'create', title, description, layout_mode: 'grid' })`.
2. **Validate every Widget**: Each widget MUST pass `Widget({ action: 'validate', id: widgetId })` before placement.
3. **Place & verify**:
   ```json
   {
     "action": "place_widget",
     "id": "canvas_id",
     "widget_id": "widget_id",
     "x": 0,
     "y": 0,
     "w": 6,
     "h": 8
   }
   ```
   After placing or updating tiles (`update_placement` / `remove_placement`), call `Canvas({ action: 'read', id: canvasId })` to confirm non-overlapping coordinates and widget count.
4. **Emit clickable Conversation Preview**: Whenever you create, populate, or reference a Canvas, include a `daimon-canvas` fenced block in your reply using the real `canvasId` so the user can open the dashboard in one click:

````markdown
```daimon-canvas
{"canvasId":"<real-canvas-id>","title":"<看板标题>"}
```
````
