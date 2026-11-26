---
name: automation
description: Author, update, inspect, and run Blueprint Automations (定时任务 and 小组件任务) using AutomationCreate, AutomationUpdate, and AutomationControl with disabled-by-default safety.
---

# Blueprint Automation Authoring (`automation`)

Blueprint Automations own executable recurring, scheduled, condition-polled, or interactive background work:

- **Widget task (`小组件任务`)**: Computes a structured JSON artifact (`execution_type: 'code'` Python `def run(ctx)` or `execution_type: 'agent'`) and delivers it to a bound `Widget` (`slots.main`), or runs when triggered by `DaimonWidget.emit('submit', payload)`.
- **Scheduled conversation task (`定时任务`)**: Prompt-driven `agent` or `code` task triggered by `schedule` (5-field cron + `time_zone`), `interval` (`every_ms`), `once` (`run_at`), `condition` (`condition_expression`), or `manual`.

## 1. Exact Three-Tool Contract

- `AutomationCreate`: Creates a new Automation (do **not** pass an `action` field).
- `AutomationUpdate`: Updates `title`, `description`, `enabled`, trigger fields, `code` / `prompt`, or `input_schema_json` / `result_schema_json` on an existing `id` (do **not** pass `action`). Always keep `description` accurate after behavioral edits.
- `AutomationControl`: Handles all lifecycle and inspection actions via explicit `action`: `'list' | 'read' | 'enable' | 'disable' | 'run' | 'cancel' | 'list_runs' | 'read_run' | 'preview_delete' | 'delete'`.

## 2. Default-Disabled & Scheduling Discipline

1. **Disabled by default (`enabled: false`)**: Always create automations with `enabled: false` unless the user explicitly asks to activate immediately (e.g., "create and enable"). Verify saved state via `AutomationControl({ action: 'read', id })`. When disabled, inform the user in their language that the task is created and inactive, and they can click **开启 / 立即运行** on the task card or ask you to enable it.
2. **Avoid duplicate tasks**: Call `AutomationControl({ action: 'list' })` before creating a new automation when an existing task on the same topic might already exist.
3. **Cadence & off-peak cron hygiene**:
   - When the user does not specify a recurring interval, default to `>= 1 hour` (`every_ms: 3600000`) rather than aggressive polling.
   - For recurring cron schedules without a user-mandated exact minute, prefer off-peak minutes (`7..23` or `37..53`, e.g., `"12 9 * * 1-5"`) instead of `:00` or `:30`; always honor exact times when requested (`"0 9 * * *"`).

## 3. Choosing Python (`code`) vs `agent`

- **Prefer `execution_type: 'code'`** (Python `def run(ctx: dict) -> dict`) for deterministic API/web fetching, parsing, math, threshold checks, and structured JSON generation for Widgets:
  ```python
  def run(ctx: dict) -> dict:
      inputs = ctx.get("input") or {}
      return {
          "updatedAt": ctx.get("triggeredAt"),
          "summary": "OK",
          "items": [],
          "query": inputs.get("query", "default"),
      }
  ```
- **Use `execution_type: 'agent'`** when open-ended synthesis, multi-step reasoning, or natural-language report drafting is required. State the target output language explicitly inside `prompt` so unattended runs match the user's language.
- **Verification run**: When safe and non-destructive, run once via `AutomationControl({ action: 'run', id })` and check `read_run` so bound Widgets receive verified initial `latestData.main` (a single manual run leaves `enabled: false` untouched).
