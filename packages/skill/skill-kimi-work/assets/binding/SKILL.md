---
name: binding
description: Connect Automations and Widgets bidirectionally with JSON Schema validation using the Binding tool (automation result to widget main slot, and widget submit event to automation input).
---

# Blueprint Data & Event Bindings (`binding`)

`Binding` owns the durable, schema-validated edge between an `Automation` and a `Widget`:

1. **Artifact Delivery (`automation` -> `widget`)**:
   - `source_kind: 'automation'`, `source_id: automationId`, `source_port: 'result'`
   - `target_kind: 'widget'`, `target_id: widgetId`, `target_port: 'slot:main'`
   - Every succeeded automation run validates its output against `result_schema_json` and delivers it into `Widget.latestData.main`, live-updating mounted Widget frames in Chat and Canvas.
2. **Interactive Submit Trigger (`widget` -> `automation`)**:
   - `source_kind: 'widget'`, `source_id: widgetId`, `source_port: 'event:submit'`
   - `target_kind: 'automation'`, `target_id: automationId`, `target_port: 'input'`
   - When iframe code calls `window.DaimonWidget.emit('submit', payload)`, the host validates `payload` and triggers the bound Automation with `ctx['input'] = payload`.

## Pre-Creation & Revalidation Checklist

1. **Define compatible object schemas on both endpoints**:
   - Every property listed in `Widget` `slots.main.schema.required` MUST exist in `Automation` `resultSchema.properties` with a compatible JSON Schema type.
   - Every property required by `Automation` `inputSchema` MUST be supplied by `Widget` `events.submit.schema` (or made optional with a fallback in `run(ctx)` so manual verification runs succeed without user form input).
2. **Validate Widget HTML first**: Run `Widget({ action: 'validate', id: widgetId })` before attaching a Binding.
3. **Create & verify**:
   ```json
   {
     "action": "create",
     "source_kind": "automation",
     "source_id": "auto_id",
     "source_port": "result",
     "target_kind": "widget",
     "target_id": "widget_id",
     "target_port": "slot:main"
   }
   ```
   Then confirm `Binding({ action: 'validate', id: bindingId })` returns `valid: true`.
4. **Revalidate after schema or HTML edits**: Whenever `AutomationUpdate` or `Widget.update` changes schemas or `index.html`, re-run `Widget({ action: 'validate' })` and `Binding({ action: 'validate' })`, repairing the owning endpoint if any mismatch is reported.
