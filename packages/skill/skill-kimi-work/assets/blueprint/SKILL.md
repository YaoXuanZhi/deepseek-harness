---
name: blueprint
description: Orchestrate the four-asset Blueprint system (Widget, Canvas, Automation, Binding) and route requests to the right minimal asset chain with full verification.
---

# Blueprint Four-Asset Orchestration (`blueprint`)

Blueprint turns transient chat replies into durable, interactive Workspace assets across four composable primitives:

| Asset | Product Term (ZH / EN) | Ownership | Model Tools |
|---|---|---|---|
| `Widget` | 小组件 / widget | Responsive `index.html`, visual presentation, interactive state, `slots.main`, `events.submit` | `Widget` |
| `Canvas` | 看板 / dashboard | 12-column (`1092px`) or free-layout placement surface (`x, y, w, h`), tile layout, viewport state | `Canvas` |
| `Automation` | 定时任务 / 小组件任务 | Manual, one-shot, cron schedule, interval, or condition execution (`code` Python `def run(ctx)` or `agent` prompt) — **disabled by default** | `AutomationCreate`, `AutomationUpdate`, `AutomationControl` |
| `Binding` | 数据绑定 / binding | Schema-validated durable edge (`automation.result -> widget.slot:main` and `widget.event:submit -> automation.input`) | `Binding` |

## 1. Domain Skill Routing

Always use the **shortest asset chain** that satisfies the user's goal, and load the specific domain skill before authoring:

- **Inline visual card, architecture map, chart, comparison, or interactive calculator**:
  Load `widgetdesign` (+ `references/design-system.md`) and `widget` -> `Widget({ action: 'create' })` -> `Widget({ action: 'validate' })` -> `Widget({ action: 'show' })`. Do **not** create an `Automation`, `Binding`, or `Canvas` unless needed.
- **Multi-widget persistent dashboard (`看板`)**:
  Load `widgetdesign` + `canvas` -> create & validate each `Widget` -> `Canvas({ action: 'list' })` or `Canvas({ action: 'create' })` -> `Canvas({ action: 'place_widget', id, widget_id, x, y, w, h })` -> `Canvas({ action: 'read', id })` -> emit a `daimon-canvas` Markdown fence in your reply.
- **Scheduled or repeatable background job (`定时任务`)**:
  Load `automation` -> `AutomationCreate` (`enabled: false` unless the user explicitly said "create and enable") -> `AutomationControl({ action: 'read', id })` to verify saved state.
- **Live data-bound or form-driven widget (`小组件任务`)**:
  Load `widgetdesign` + `widget` + `automation` + `binding` -> define matching JSON Schemas -> create disabled `Automation` and `Widget` -> `Widget({ action: 'validate' })` -> `Binding({ action: 'create' })` & `Binding({ action: 'validate' })` -> optional one-shot `AutomationControl({ action: 'run', id })` when safe to seed `latestData.main` (a single run does NOT enable the schedule) -> `Widget({ action: 'show' })` (and `Canvas.place_widget` when a dashboard was requested).

## 2. Hard Rules & Verification Gates

1. **Real IDs only**: Always use exact IDs returned by `create` / `list` / `read`; never invent `widgetId`, `canvasId`, `automationId`, or `bindingId`.
2. **Validate before display or placement**: Every `Widget` MUST pass `Widget({ action: 'validate', id })` before `show` or `Canvas.place_widget`. Every `Binding` MUST pass `Binding({ action: 'validate', id })`.
3. **Default disabled safety**: Keep newly created `Automation`s at `enabled: false` unless the user explicitly requested immediate schedule activation. Report clearly when a task is created in inactive state and tell the user they can click the task card or ask you to enable it.
4. **Product language**: Never expose internal skill names (`widgetdesign`, `blueprint`), raw JSON Schema plumbing, or `slots.main` jargon in user-facing prose unless the user asks for technical internals.
