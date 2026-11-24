---
name: automation
description: Author, update, inspect, and trigger Blueprint Automations (定时任务 and 小组件任务) using AutomationCreate, AutomationUpdate, and AutomationControl.
---

# Blueprint Automation Authoring

Blueprint Automations power recurring or event-triggered background work:

- **Widget task (`小组件任务`)**: Bound to one or more `Widget`s via `Binding` to fetch/compute structured JSON artifacts (`type: 'code'` Python `def run(ctx)` or `type: 'agent'`).
- **Scheduled conversation task (`定时任务`)**: Runs on a `schedule` (5-field cron + timezone), `interval` (`everyMs`), `once` (`runAt`), `condition`, or `manual` trigger.

## Safety & Default Disabled Policy

- **Disabled by default**: Always create automations with `enabled: false` (the default) unless the user explicitly instructs you to turn the schedule on immediately. The conversation renders an interactive Task Card where the user can inspect the schedule, click **Run now (`立即运行`)**, or toggle **Enable (`开启`)**.

## Authoring `type: 'code'` Python Tasks

When `execution.type === 'code'`, write a clean Python module inside the automation workspace (default `main.py`, entry `run`):

```python
def run(ctx: dict) -> dict:
    """Return a JSON-serializable dict matching resultSchema."""
    inputs = ctx.get("input") or {}
    return {
        "updatedAt": ctx.get("triggeredAt"),
        "items": [],
        "query": inputs.get("query", "default"),
    }
```

- Declare `resultSchema` (JSON Schema) whenever a `Binding` routes the automation's artifact into a `Widget` slot (`slots.main`).
- Declare `inputSchema` whenever a `Widget` triggers the automation via `DaimonWidget.emit('submit', payload)`.
- After creating or updating an automation, you may run a one-off verification via `AutomationControl({ action: 'run', id })` when safe and non-destructive so bound widgets receive real initial data (`latestData.main`).
