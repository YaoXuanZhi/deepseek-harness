---
name: widget
description: Create, update, validate, and display interactive HTML/CSS/JS Widgets inline in conversation or on a Canvas dashboard using the Widget tool and window.DaimonWidget runtime. Always load widgetdesign before creating any widget.
---

# Interactive Widget Authoring (`widget`)

Use the `Widget` tool whenever visual or interactive structure communicates clearer and faster than prose: codebase/system architecture maps, layer & dependency breakdowns, side-by-side trade-off matrices, KPI/metric explorers, charts, timelines, or interactive calculators. Skip widgets for brief factual answers, trivial edits, or tasks whose primary deliverable is a standalone workspace file.

## 1. Mandatory Authoring Sequence

1. **Load design authority first**: Call `skill({ name: 'widgetdesign' })` and read its `references/design-system.md` (plus `references/icon-system.md` when using `<kimi-icon>`) before writing HTML/CSS.
2. **Read `references/runtime-api.md` when stateful**: If the widget reads bound `Automation` data (`slots.main`), saves user inputs, emits `submit` events, or handles files, read `references/runtime-api.md` under this skill's `resourceBase.path`. Static/self-contained interactive explorers need no slots, events, or `Automation`.
3. **Create**: Call `Widget`:
   ```json
   {
     "action": "create",
     "id": "arch-overview",
     "title": "Project architecture overview",
     "description": "Interactive layer metrics, boundary checks, and risk filter.",
     "html": "<!DOCTYPE html>..."
   }
   ```
   - Declare `slots_json` / `events_json` / `latest_data_json` (JSON strings) only when wiring the widget to a `Binding` + `Automation`.
   - Always render realistic, verified data (or schema-valid sample data before the first automation run) immediately on load — never leave an empty blank frame.
4. **Validate (Hard Gate)**: Call `Widget({ action: 'validate', id })` and fix any diagnostics before displaying or placing the widget.
5. **Display on Requested Surface**:
   - **Inline in conversation**: Call `Widget({ action: 'show', id })`. The chat renders the live interactive card with `放入看板` (Pin to dashboard), `在侧边栏打开` (Open in right sidebar), and `放大查看` (Enlarge) controls.
   - **On a Canvas (`看板`)**: Load `canvas` and call `Canvas({ action: 'place_widget', id: canvasId, widget_id: id, x, y, w, h })`.

## 2. Creating a Widget Task (`小组件任务` = Widget + Automation + Binding)

When the user asks for a live-refreshing or form-triggered widget backed by an `Automation`:

1. **Confirm target dashboard when placing on Canvas**: Check existing dashboards via `Canvas({ action: 'list' })`. If the user asked for a dashboard widget task and multiple/no dashboards make the target ambiguous, clarify with `ask_user_question` instead of guessing silently. Conversation-only widgets and static previews need no dashboard prompt.
2. **Align JSON Schemas up front**: Ensure `AutomationCreate.result_schema_json` satisfies every required field in `Widget.slots_json` (`main.schema`), and `Widget.events_json` (`submit.schema`) matches `AutomationCreate.input_schema_json`.
3. **Keep new Automations disabled by default**: Create the automation with `enabled: false` unless the user explicitly requested immediate activation ("create and enable"). Connect via `Binding({ action: 'create', ... })` and `Binding({ action: 'validate', id })`.
4. **Explain activation clearly**: When a new widget task remains disabled (`enabled: false`), tell the user in their language that it has been created and is currently inactive, and they can click the task card to run/enable it or ask you to enable it.

## 3. Inspecting, Updating, and Runtime States

- Before modifying an existing widget, inspect it via `Widget({ action: 'read', id })` to preserve working interactions and slot contracts.
- After `Widget({ action: 'update', ... })` or `write_file`, always re-run `Widget({ action: 'validate', id })` (and `Binding({ action: 'validate', id })` if bound).
- For stateful widgets, render `idle`, `running`, `needs_input`, and `error` gracefully in-place without wiping prior valid content; disable duplicate submit clicks while `status === 'running'`.
