---
name: binding
description: Connect Automations and Widgets bidirectionally with JSON Schema validation using the Binding tool (artifact-to-slot data push and widget-event-to-automation triggers).
---

# Blueprint Data & Event Bindings (`binding`)

`Binding` decouples visual `Widget` presentation from `Automation` data collection and computation.

## Two Binding Directions

1. **Data Push (`automation` -> `widget`)**:
   - `source: { kind: 'automation', id: automationId, port: 'result' }`
   - `target: { kind: 'widget', id: widgetId, port: 'slot:main' }`
   - Every successful automation run validates its artifact and writes `widget.latestData.main`, updating live open widgets in Chat and Canvas dashboards.
2. **Interactive Trigger (`widget` -> `automation`)**:
   - `source: { kind: 'widget', id: widgetId, port: 'event:submit' }`
   - `target: { kind: 'automation', id: automationId, port: 'input' }`
   - When the user clicks a control calling `window.DaimonWidget.emit('submit', payload)`, the host validates `payload` and triggers an automation run with `ctx['input'] = payload`.

## Schema Alignment Checklist

1. Define `resultSchema` on the `Automation` (`type: 'object'`, `properties`, `required`) and `slots.main.schema` on the `Widget`.
2. Ensure every property listed in `Widget.slots.main.schema.required` is produced by `Automation.resultSchema.properties` with a compatible JSON Schema type.
3. Create the edge with `Binding({ action: 'create', source, target })` and verify compatibility with `Binding({ action: 'validate', id })`.
