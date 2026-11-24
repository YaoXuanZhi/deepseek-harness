---
name: blueprint
description: Orchestrate the four-asset Blueprint system (Widget, Canvas, Automation, Binding) to turn conversations into interactive visual tools, persistent dashboards, and data-driven workflows.
---

# Blueprint Four-Asset Orchestration

Blueprint turns transient chat output into persistent, interactive Workspace assets across four composable primitives:

| Asset | User-Facing Term | Purpose | Model Tool |
|---|---|---|---|
| `Widget` | 小组件 / widget | Self-contained HTML/CSS/JS interactive visual card rendered inline in chat or pinned onto a dashboard | `Widget` |
| `Canvas` | 看板 / dashboard | Persistent 12-column grid or free-layout board hosting multiple live Widgets | `Canvas` |
| `Automation` | 定时任务 / 小组件任务 | Scheduled, interval, condition, or manual background task (`code` Python `run(ctx)` or `agent` prompt) — created **disabled by default** | `AutomationCreate`, `AutomationUpdate`, `AutomationControl` |
| `Binding` | 数据绑定 / binding | Schema-validated edge routing `Automation.result -> Widget.slots.main` or `Widget.events.submit -> Automation.input` | `Binding` |

## Choosing the Minimal Asset Topology

1. **Inline visual explanation, calculator, comparison, or chart**:
   - Load `widget` + `widgetdesign`, create one `Widget`, call `Widget({ action: 'validate' })`, then `Widget({ action: 'show' })`.
2. **Multi-card workspace or persistent monitoring board (`看板`)**:
   - Create and validate each `Widget`, create or update a `Canvas`, place widgets on the 12-column grid without overlap, and embed a `daimon-canvas` Markdown fence in your reply so the user can open the dashboard in one click.
3. **Live-refreshing metric, tracker, or form-driven workflow**:
   - Create the `Widget` (declaring `slots.main.schema` and/or `events.submit.schema`), create the `Automation` (`enabled: false` by default unless the user explicitly asks to enable immediately), wire them via `Binding({ action: 'create' })`, validate the binding, and show the task card + widget so the user can click **Run now** or **Enable**.

## Mandatory Quality Gate Before Delivery

- Every `Widget` MUST pass `Widget({ action: 'validate', id })` before `show` or `Canvas.place_widget`.
- Every `Binding` MUST pass `Binding({ action: 'validate', id })` so upstream output schemas satisfy downstream required fields.
- Never mention internal skill names (`blueprint`, `widgetdesign`) or raw schema plumbing in user-facing prose; use natural product terms (`小组件` / `widget`, `看板` / `dashboard`, `定时任务` / `小组件任务`).
