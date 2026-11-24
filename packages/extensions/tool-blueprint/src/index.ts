/**
 * Model-facing Blueprint tools (`Widget`, `Canvas`, `Binding`,
 * `AutomationCreate`, `AutomationUpdate`, `AutomationControl`) and dynamic
 * dashboard discovery context over `ctx.blueprint`.
 *
 * @module @deepseek-ai/dsh-tool-blueprint
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  BlueprintAutomationExecution,
  BlueprintAutomationRecord,
  BlueprintAutomationTrigger,
  BlueprintJsonSchema,
  BlueprintPortDeclaration,
} from '@deepseek-ai/dsh-blueprint/types'
import type {} from '@deepseek-ai/dsh-blueprint'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import { isJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'

/** Cordis plugin name. */
export const name = 'dsh-tool-blueprint'
/** Required Cordis services. */
export const inject = ['tools', 'blueprint', 'systemPrompt']

function describeTrigger(trigger: BlueprintAutomationTrigger): string {
  switch (trigger.kind) {
    case 'manual':
      return 'manual'
    case 'schedule':
      return trigger.timeZone ? `cron ${trigger.cron} (${trigger.timeZone})` : `cron ${trigger.cron}`
    case 'interval':
      return `every ${String(Math.round(trigger.everyMs / 1000))}s`
    case 'once':
      return `once at ${trigger.runAt}`
    case 'condition':
      return `condition: ${trigger.expression}`
  }
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function parseOptionalJsonObject(raw: string | undefined, fieldName: string): Readonly<Record<string, JsonValue>> | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new ToolArgsError([`\`${fieldName}\` must be valid JSON: ${(err as Error).message}`])
  }
  if (!isJsonValue(parsed) || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ToolArgsError([`\`${fieldName}\` must be a JSON object`])
  }
  return parsed as Readonly<Record<string, JsonValue>>
}

function parseOptionalJsonSchema(raw: string | undefined, fieldName: string): BlueprintJsonSchema | undefined {
  const obj = parseOptionalJsonObject(raw, fieldName)
  return obj
}

function automationMeta(action: string, record: BlueprintAutomationRecord): Record<string, JsonValue> {
  return {
    kind: 'automation',
    action,
    automationId: record.id,
    title: record.title,
    enabled: record.enabled,
    triggerSummary: describeTrigger(record.trigger),
    executionType: record.execution.type,
    ...(record.lastRunStatus === undefined ? {} : { lastRunStatus: record.lastRunStatus }),
  }
}

/**
 * Register the six Kimi Work Blueprint tools and existing-dashboard runtime context.
 * @param ctx - Cordis plugin context with `tools`, `blueprint`, and `systemPrompt`.
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.context({
    name: 'blueprint:canvases',
    interpolate: false,
    order: 450,
    text: () => {
      const canvases = ctx.blueprint.listCanvases()
      if (canvases.length === 0) return ''
      const lines = canvases.map(c => `- ${c.id}: "${c.title}" (${String(c.placements.length)} widgets, ${c.layoutMode})`)
      return `Existing Blueprint dashboards (\`Canvas\`):\n${lines.join('\n')}`
    },
  })

  // 1. Widget Tool
  ctx.tools.register(defineTool({
    name: 'Widget',
    description:
      'Create, update, validate, inspect, and display interactive HTML/CSS/JS Widgets (`小组件`). '
      + 'Always call `validate` before `show` or placing a widget onto a `Canvas`. '
      + 'The host automatically injects Kimi Perspective `--kp-*` tokens and `window.DaimonWidget` into every widget.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['create', 'read', 'list', 'update', 'validate', 'show', 'delete', 'read_file', 'write_file'],
        description: 'Operation to perform on a Blueprint Widget.',
      },
      id: {
        type: 'string',
        description: 'Widget id (1-64 alphanumeric/hyphen/underscore chars). Required for read, update, validate, show, delete, read_file, and write_file.',
      },
      title: {
        type: 'string',
        description: 'Human-readable widget title (required for `create`).',
      },
      description: {
        type: 'string',
        description: 'Optional concise description of what the widget visualizes or computes.',
      },
      html: {
        type: 'string',
        description: 'Complete `index.html` markup for `create` or `update`. Use `--kp-*` CSS tokens and `window.DaimonWidget`.',
      },
      slots_json: {
        type: 'string',
        description: 'Optional JSON object declaring data slots and schemas, e.g. `{"main":{"schema":{"type":"object","required":["items"],"properties":{"items":{"type":"array"}}}}}`.',
      },
      events_json: {
        type: 'string',
        description: 'Optional JSON object declaring outbound events, e.g. `{"submit":{"schema":{"type":"object","required":["query"],"properties":{"query":{"type":"string"}}}}}`.',
      },
      latest_data_json: {
        type: 'string',
        description: 'Optional JSON object seeding initial slot payloads, e.g. `{"main":{"items":[]}}`.',
      },
      file_path: {
        type: 'string',
        description: 'Relative file path inside the widget workspace for `read_file` or `write_file`.',
      },
      file_content: {
        type: 'string',
        description: 'UTF-8 text written by `write_file`.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          action: { type: 'string', required: true },
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
      presentationMeta: (_args, value) => (value.meta ?? { kind: 'widget', action: value.action }) as Record<string, JsonValue>,
    },
    execute: async (args): Promise<{ action: string; summary: string } & Record<string, JsonValue>> => {
      switch (args.action) {
        case 'list': {
          const items = ctx.blueprint.listWidgets()
          return {
            action: 'list',
            widgets: toJson(items),
            summary: items.length === 0
              ? 'No widgets exist yet.'
              : `Found ${String(items.length)} widget(s): ${items.map(w => `${w.id} ("${w.title}")`).join(', ')}`,
            meta: { kind: 'widget', action: 'list', count: items.length },
          }
        }
        case 'create': {
          if (!args.title?.trim()) throw new ToolArgsError(['`title` is required for Widget `create`'])
          if (args.html === undefined) throw new ToolArgsError(['`html` is required for Widget `create`'])
          const slots = parseOptionalJsonObject(args.slots_json, 'slots_json') as Readonly<Record<string, BlueprintPortDeclaration>> | undefined
          const events = parseOptionalJsonObject(args.events_json, 'events_json') as Readonly<Record<string, BlueprintPortDeclaration>> | undefined
          const latestData = parseOptionalJsonObject(args.latest_data_json, 'latest_data_json')
          const created = await ctx.blueprint.createWidget({
            ...(args.id === undefined ? {} : { id: args.id }),
            title: args.title,
            ...(args.description === undefined ? {} : { description: args.description }),
            html: args.html,
            ...(slots === undefined ? {} : { slots }),
            ...(events === undefined ? {} : { events }),
            ...(latestData === undefined ? {} : { latestData }),
          })
          return {
            action: 'create',
            widgetId: created.id,
            title: created.title,
            summary: `Created widget "${created.title}" (id: ${created.id}). Run Widget validate next before showing or placing it.`,
            meta: {
              kind: 'widget',
              action: 'create',
              widgetId: created.id,
              title: created.title,
              status: created.status,
            },
          }
        }
        case 'update': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Widget `update`'])
          const slots = parseOptionalJsonObject(args.slots_json, 'slots_json') as Readonly<Record<string, BlueprintPortDeclaration>> | undefined
          const events = parseOptionalJsonObject(args.events_json, 'events_json') as Readonly<Record<string, BlueprintPortDeclaration>> | undefined
          const latestData = parseOptionalJsonObject(args.latest_data_json, 'latest_data_json')
          const updated = await ctx.blueprint.updateWidget({
            id: args.id,
            ...(args.title === undefined ? {} : { title: args.title }),
            ...(args.description === undefined ? {} : { description: args.description }),
            ...(args.html === undefined ? {} : { html: args.html }),
            ...(slots === undefined ? {} : { slots }),
            ...(events === undefined ? {} : { events }),
            ...(latestData === undefined ? {} : { latestData }),
          })
          return {
            action: 'update',
            widgetId: updated.id,
            summary: `Updated widget "${updated.title}" (id: ${updated.id}).`,
            meta: {
              kind: 'widget',
              action: 'update',
              widgetId: updated.id,
              title: updated.title,
              status: updated.status,
            },
          }
        }
        case 'validate': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Widget `validate`'])
          const res = await ctx.blueprint.validateWidget(args.id)
          const detail = res.valid ? await ctx.blueprint.getWidget(args.id) : undefined
          return {
            action: 'validate',
            widgetId: args.id,
            valid: res.valid,
            diagnostics: [...res.diagnostics],
            summary: res.valid
              ? `Widget "${args.id}" passed validation.`
              : `Widget "${args.id}" failed validation: ${res.diagnostics.join(' ')}`,
            meta: {
              kind: 'widget',
              action: 'validate',
              widgetId: args.id,
              valid: res.valid,
              ...(detail === undefined
                ? {}
                : {
                  title: detail.title,
                  status: detail.status,
                  assembledHtml: detail.assembledHtml,
                }),
            },
          }
        }
        case 'read':
        case 'show': {
          if (!args.id?.trim()) throw new ToolArgsError([`\`id\` is required for Widget \`${args.action}\``])
          const detail = await ctx.blueprint.getWidget(args.id)
          if (args.action === 'show') {
            const check = await ctx.blueprint.validateWidget(args.id)
            if (!check.valid) {
              throw new ToolArgsError([`Cannot show invalid widget "${args.id}": ${check.diagnostics.join(' ')}`])
            }
          }
          return {
            action: args.action,
            widgetId: detail.id,
            title: detail.title,
            ...(args.action === 'read' ? { html: detail.rawHtml, latestData: toJson(detail.latestData) } : {}),
            summary: args.action === 'show'
              ? `Displayed interactive widget "${detail.title}" (id: ${detail.id}) inline in the conversation.`
              : `Read widget "${detail.title}" (id: ${detail.id}, ${String(detail.rawHtml.length)} chars).`,
            meta: {
              kind: 'widget',
              action: args.action,
              widgetId: detail.id,
              title: detail.title,
              status: detail.status,
              ...(args.action === 'show' ? { assembledHtml: detail.assembledHtml } : {}),
            },
          }
        }
        case 'read_file': {
          if (!args.id?.trim() || !args.file_path?.trim()) {
            throw new ToolArgsError(['`id` and `file_path` are required for Widget `read_file`'])
          }
          const content = await ctx.blueprint.readWidgetFile(args.id, args.file_path)
          return {
            action: 'read_file',
            content,
            summary: `Read ${args.file_path} from widget "${args.id}" (${String(content.length)} chars).`,
            meta: { kind: 'widget', action: 'read_file', widgetId: args.id },
          }
        }
        case 'write_file': {
          if (!args.id?.trim() || !args.file_path?.trim() || args.file_content === undefined) {
            throw new ToolArgsError(['`id`, `file_path`, and `file_content` are required for Widget `write_file`'])
          }
          await ctx.blueprint.writeWidgetFile(args.id, args.file_path, args.file_content)
          return {
            action: 'write_file',
            summary: `Wrote ${args.file_path} in widget "${args.id}".`,
            meta: { kind: 'widget', action: 'write_file', widgetId: args.id },
          }
        }
        case 'delete': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Widget `delete`'])
          await ctx.blueprint.deleteWidget(args.id)
          return {
            action: 'delete',
            summary: `Deleted widget "${args.id}".`,
            meta: { kind: 'widget', action: 'delete', widgetId: args.id },
          }
        }
        default:
          throw new ToolArgsError([`Unsupported Widget action: ${String(args.action)}`])
      }
    },
  }))

  // 2. Canvas (`看板`) Tool
  ctx.tools.register(defineTool({
    name: 'Canvas',
    description:
      'Create, list, inspect, arrange, and update persistent multi-widget Dashboards (`看板`) on a 12-column grid (`x: 0..11, w: 2..12, h: 2..33`) or free layout.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'create', 'read', 'update', 'place_widget', 'update_placement', 'remove_placement', 'set_view_state', 'delete'],
        description: 'Dashboard operation to execute.',
      },
      id: {
        type: 'string',
        description: 'Canvas id (for `create`, `read`, `update`, `place_widget`, `update_placement`, `remove_placement`, `set_view_state`, `delete`).',
      },
      title: {
        type: 'string',
        description: 'Dashboard title (required for `create`).',
      },
      description: {
        type: 'string',
        description: 'Optional dashboard subtitle or purpose.',
      },
      layout_mode: {
        type: 'string',
        enum: ['grid', 'free'],
        description: 'Layout mode (`grid` 12-column default, or `free`).',
      },
      widget_id: {
        type: 'string',
        description: 'Widget id to place on the Canvas (`place_widget`).',
      },
      placement_id: {
        type: 'string',
        description: 'Placement id or widget id to resize/reposition/remove (`update_placement`, `remove_placement`).',
      },
      x: { type: 'number', description: 'Grid column `0..11` (or pixel `x` in free mode).' },
      y: { type: 'number', description: 'Grid row `>= 0` (or pixel `y` in free mode).' },
      w: { type: 'number', description: 'Grid column span `2..12` (`x + w <= 12`).' },
      h: { type: 'number', description: 'Grid row span `2..33` (`32px` per row unit).' },
      zoom: { type: 'number', description: 'Viewport zoom (`0.25..2.5`) for `set_view_state`.' },
      pan_x: { type: 'number', description: 'Viewport pan X for `set_view_state`.' },
      pan_y: { type: 'number', description: 'Viewport pan Y for `set_view_state`.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          action: { type: 'string', required: true },
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
      presentationMeta: (_args, value) => (value.meta ?? { kind: 'canvas', action: value.action }) as Record<string, JsonValue>,
    },
    execute: async (args): Promise<{ action: string; summary: string } & Record<string, JsonValue>> => {
      switch (args.action) {
        case 'list': {
          const list = ctx.blueprint.listCanvases()
          return {
            action: 'list',
            canvases: toJson(list),
            summary: list.length === 0
              ? 'No dashboards exist yet.'
              : `Found ${String(list.length)} dashboard(s): ${list.map(c => `${c.id} ("${c.title}", ${String(c.placements.length)} widgets)`).join(', ')}`,
            meta: { kind: 'canvas', action: 'list', count: list.length },
          }
        }
        case 'create': {
          if (!args.title?.trim()) throw new ToolArgsError(['`title` is required for Canvas `create`'])
          const canvas = await ctx.blueprint.createCanvas({
            ...(args.id === undefined ? {} : { id: args.id }),
            title: args.title,
            ...(args.description === undefined ? {} : { description: args.description }),
            ...(args.layout_mode === 'grid' || args.layout_mode === 'free' ? { layoutMode: args.layout_mode } : {}),
          })
          return {
            action: 'create',
            canvas: toJson(canvas),
            summary: `Created dashboard "${canvas.title}" (id: ${canvas.id}, mode: ${canvas.layoutMode}).`,
            meta: {
              kind: 'canvas',
              action: 'create',
              canvasId: canvas.id,
              title: canvas.title,
              widgetCount: canvas.placements.length,
            },
          }
        }
        case 'read': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Canvas `read`'])
          const canvas = ctx.blueprint.getCanvas(args.id)
          return {
            action: 'read',
            canvas: toJson(canvas),
            summary: `Dashboard "${canvas.title}" (${canvas.id}) has ${String(canvas.placements.length)} widget(s).`,
            meta: {
              kind: 'canvas',
              action: 'read',
              canvasId: canvas.id,
              title: canvas.title,
              widgetCount: canvas.placements.length,
            },
          }
        }
        case 'update': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Canvas `update`'])
          const canvas = await ctx.blueprint.updateCanvas({
            id: args.id,
            ...(args.title === undefined ? {} : { title: args.title }),
            ...(args.description === undefined ? {} : { description: args.description }),
            ...(args.layout_mode === 'grid' || args.layout_mode === 'free' ? { layoutMode: args.layout_mode } : {}),
          })
          return {
            action: 'update',
            canvas: toJson(canvas),
            summary: `Updated dashboard "${canvas.title}" (${canvas.id}).`,
            meta: {
              kind: 'canvas',
              action: 'update',
              canvasId: canvas.id,
              title: canvas.title,
              widgetCount: canvas.placements.length,
            },
          }
        }
        case 'place_widget': {
          if (!args.id?.trim() || !args.widget_id?.trim()) {
            throw new ToolArgsError(['`id` (canvas id) and `widget_id` are required for Canvas `place_widget`'])
          }
          const validation = await ctx.blueprint.validateWidget(args.widget_id)
          if (!validation.valid) {
            throw new ToolArgsError([`Cannot place invalid widget "${args.widget_id}": ${validation.diagnostics.join(' ')}`])
          }
          const hasRect = args.x !== undefined || args.y !== undefined || args.w !== undefined || args.h !== undefined
          const canvas = await ctx.blueprint.placeWidget({
            canvasId: args.id,
            widgetId: args.widget_id,
            ...(args.title === undefined ? {} : { titleOverride: args.title }),
            ...(hasRect
              ? {
                rect: {
                  ...(args.x === undefined ? {} : { x: args.x }),
                  ...(args.y === undefined ? {} : { y: args.y }),
                  ...(args.w === undefined ? {} : { w: args.w }),
                  ...(args.h === undefined ? {} : { h: args.h }),
                },
              }
              : {}),
          })
          return {
            action: 'place_widget',
            canvas: toJson(canvas),
            summary: `Placed widget "${args.widget_id}" onto dashboard "${canvas.title}" (${String(canvas.placements.length)} total widgets).`,
            meta: {
              kind: 'canvas',
              action: 'place_widget',
              canvasId: canvas.id,
              title: canvas.title,
              widgetCount: canvas.placements.length,
            },
          }
        }
        case 'update_placement': {
          if (!args.id?.trim() || !args.placement_id?.trim()) {
            throw new ToolArgsError(['`id` and `placement_id` are required for Canvas `update_placement`'])
          }
          const canvas = await ctx.blueprint.updatePlacement({
            canvasId: args.id,
            placementId: args.placement_id,
            ...(args.title === undefined ? {} : { titleOverride: args.title }),
            rect: {
              ...(args.x === undefined ? {} : { x: args.x }),
              ...(args.y === undefined ? {} : { y: args.y }),
              ...(args.w === undefined ? {} : { w: args.w }),
              ...(args.h === undefined ? {} : { h: args.h }),
            },
          })
          return {
            action: 'update_placement',
            canvas: toJson(canvas),
            summary: `Updated tile "${args.placement_id}" on dashboard "${canvas.title}".`,
            meta: {
              kind: 'canvas',
              action: 'update_placement',
              canvasId: canvas.id,
              title: canvas.title,
              widgetCount: canvas.placements.length,
            },
          }
        }
        case 'remove_placement': {
          if (!args.id?.trim() || !args.placement_id?.trim()) {
            throw new ToolArgsError(['`id` and `placement_id` are required for Canvas `remove_placement`'])
          }
          const canvas = await ctx.blueprint.removePlacement({
            canvasId: args.id,
            placementId: args.placement_id,
          })
          return {
            action: 'remove_placement',
            canvas: toJson(canvas),
            summary: `Removed "${args.placement_id}" from dashboard "${canvas.title}".`,
            meta: {
              kind: 'canvas',
              action: 'remove_placement',
              canvasId: canvas.id,
              title: canvas.title,
              widgetCount: canvas.placements.length,
            },
          }
        }
        case 'set_view_state': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Canvas `set_view_state`'])
          const canvas = await ctx.blueprint.setCanvasViewState({
            canvasId: args.id,
            viewState: {
              zoom: args.zoom ?? 1,
              panX: args.pan_x ?? 0,
              panY: args.pan_y ?? 0,
            },
          })
          return {
            action: 'set_view_state',
            canvas: toJson(canvas),
            summary: `Updated viewport state for dashboard "${canvas.title}".`,
            meta: { kind: 'canvas', action: 'set_view_state', canvasId: canvas.id, title: canvas.title, widgetCount: canvas.placements.length },
          }
        }
        case 'delete': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Canvas `delete`'])
          await ctx.blueprint.deleteCanvas(args.id)
          return {
            action: 'delete',
            summary: `Deleted dashboard "${args.id}".`,
            meta: { kind: 'canvas', action: 'delete', canvasId: args.id },
          }
        }
        default:
          throw new ToolArgsError([`Unsupported Canvas action: ${String(args.action)}`])
      }
    },
  }))

  // 3. Binding Tool
  ctx.tools.register(defineTool({
    name: 'Binding',
    description:
      'Create, validate, list, read, and delete schema-checked data/event Bindings between Automations and Widgets '
      + '(`automation.result -> widget.slot:main` or `widget.event:submit -> automation.input`).',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['create', 'read', 'list', 'validate', 'delete'],
        description: 'Binding operation to execute.',
      },
      id: {
        type: 'string',
        description: 'Binding id (optional for `create`, required for `read`, `validate`, `delete`).',
      },
      source_kind: {
        type: 'string',
        enum: ['automation', 'widget'],
        description: 'Source asset kind (`create`).',
      },
      source_id: {
        type: 'string',
        description: 'Source asset id (`create`).',
      },
      source_port: {
        type: 'string',
        description: 'Source port name (`"result"` for automation, `"event:submit"` for widget).',
      },
      target_kind: {
        type: 'string',
        enum: ['automation', 'widget'],
        description: 'Target asset kind (`create`).',
      },
      target_id: {
        type: 'string',
        description: 'Target asset id (`create`).',
      },
      target_port: {
        type: 'string',
        description: 'Target port name (`"slot:main"` for widget, `"input"` for automation).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          action: { type: 'string', required: true },
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
      presentationMeta: (_args, value) => (value.meta ?? { kind: 'binding', action: value.action }) as Record<string, JsonValue>,
    },
    execute: async (args): Promise<{ action: string; summary: string } & Record<string, JsonValue>> => {
      switch (args.action) {
        case 'list': {
          const bindings = ctx.blueprint.listBindings()
          return {
            action: 'list',
            bindings: toJson(bindings),
            summary: bindings.length === 0
              ? 'No bindings exist yet.'
              : `Found ${String(bindings.length)} binding(s): ${bindings.map(b => `${b.id} (${b.source.kind}:${b.source.id} -> ${b.target.kind}:${b.target.id})`).join(', ')}`,
            meta: { kind: 'binding', action: 'list', count: bindings.length },
          }
        }
        case 'read': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Binding `read`'])
          const binding = ctx.blueprint.getBinding(args.id)
          return {
            action: 'read',
            binding: toJson(binding),
            summary: `Binding "${binding.id}": ${binding.source.kind}:${binding.source.id}.${binding.source.port} -> ${binding.target.kind}:${binding.target.id}.${binding.target.port}.`,
            meta: { kind: 'binding', action: 'read', bindingId: binding.id },
          }
        }
        case 'create': {
          if (!args.source_kind || !args.source_id?.trim() || !args.source_port?.trim()
            || !args.target_kind || !args.target_id?.trim() || !args.target_port?.trim()) {
            throw new ToolArgsError(['`source_kind`, `source_id`, `source_port`, `target_kind`, `target_id`, and `target_port` are required for Binding `create`'])
          }
          const { binding, validation } = await ctx.blueprint.createBinding({
            ...(args.id === undefined ? {} : { id: args.id }),
            source: {
              kind: args.source_kind,
              id: args.source_id,
              port: args.source_port,
            },
            target: {
              kind: args.target_kind,
              id: args.target_id,
              port: args.target_port,
            },
          })
          return {
            action: 'create',
            binding: toJson(binding),
            validation: toJson(validation),
            summary: `Created schema-validated binding "${binding.id}" (${binding.source.kind}:${binding.source.id} -> ${binding.target.kind}:${binding.target.id}).`,
            meta: {
              kind: 'binding',
              action: 'create',
              bindingId: binding.id,
              sourceLabel: `${binding.source.kind}:${binding.source.id}`,
              targetLabel: `${binding.target.kind}:${binding.target.id}`,
            },
          }
        }
        case 'validate': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Binding `validate`'])
          const res = ctx.blueprint.validateBinding(args.id)
          return {
            action: 'validate',
            valid: res.valid,
            diagnostics: [...res.diagnostics],
            summary: res.valid
              ? `Binding "${args.id}" is schema-valid.`
              : `Binding "${args.id}" failed validation: ${res.diagnostics.join(' ')}`,
            meta: { kind: 'binding', action: 'validate', bindingId: args.id, valid: res.valid },
          }
        }
        case 'delete': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for Binding `delete`'])
          await ctx.blueprint.deleteBinding(args.id)
          return {
            action: 'delete',
            summary: `Deleted binding "${args.id}".`,
            meta: { kind: 'binding', action: 'delete', bindingId: args.id },
          }
        }
        default:
          throw new ToolArgsError([`Unsupported Binding action: ${String(args.action)}`])
      }
    },
  }))

  // 4. AutomationCreate Tool
  ctx.tools.register(defineTool({
    name: 'AutomationCreate',
    description:
      'Create a Blueprint Automation (`定时任务` or `小组件任务`). Automations are created **disabled by default** (`enabled: false`) '
      + 'so the user can review the Task Card and click Enable or Run now unless they explicitly asked to enable immediately.',
    parameters: {
      id: { type: 'string', description: 'Optional stable automation id.' },
      title: { type: 'string', required: true, description: 'Concise task title in the user\'s language.' },
      description: { type: 'string', description: 'Optional explanation of what the task computes or monitors.' },
      enabled: { type: 'boolean', description: 'Defaults to `false`. Set `true` only when the user explicitly requests immediate schedule activation.' },
      trigger_kind: {
        type: 'string',
        enum: ['manual', 'schedule', 'interval', 'once', 'condition'],
        description: 'Trigger mode (default `manual`).',
      },
      cron: { type: 'string', description: '5-field cron expression when `trigger_kind === "schedule"`, e.g. `"0 9 * * 1-5"`.' },
      time_zone: { type: 'string', description: 'Optional IANA timezone for `schedule`.' },
      every_ms: { type: 'number', description: 'Interval in milliseconds (`>= 5000`) when `trigger_kind === "interval"`.' },
      run_at: { type: 'string', description: 'ISO-8601 timestamp when `trigger_kind === "once"`.' },
      condition_expression: { type: 'string', description: 'Condition expression when `trigger_kind === "condition"`.' },
      execution_type: {
        type: 'string',
        required: true,
        enum: ['code', 'agent'],
        description: '`code` for Python `def run(ctx)` returning JSON, or `agent` for prompt-driven task.',
      },
      code: { type: 'string', description: 'Python module source defining `def run(ctx): ...` when `execution_type === "code"`.' },
      prompt: { type: 'string', description: 'Agent task prompt when `execution_type === "agent"`.' },
      input_schema_json: { type: 'string', description: 'Optional JSON Schema string for `input` port.' },
      result_schema_json: { type: 'string', description: 'Optional JSON Schema string for `result` artifact port.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
      presentationMeta: (_args, value) => value.meta as Record<string, JsonValue>,
    },
    execute: async (args): Promise<{ summary: string } & Record<string, JsonValue>> => {
      const triggerKind = args.trigger_kind ?? 'manual'
      let trigger: BlueprintAutomationTrigger
      if (triggerKind === 'schedule') {
        if (!args.cron?.trim()) throw new ToolArgsError(['`cron` is required when `trigger_kind` is "schedule"'])
        trigger = { kind: 'schedule', cron: args.cron.trim(), ...(args.time_zone ? { timeZone: args.time_zone } : {}) }
      } else if (triggerKind === 'interval') {
        if (typeof args.every_ms !== 'number' || args.every_ms < 5_000) {
          throw new ToolArgsError(['`every_ms` (>= 5000) is required when `trigger_kind` is "interval"'])
        }
        trigger = { kind: 'interval', everyMs: args.every_ms }
      } else if (triggerKind === 'once') {
        if (!args.run_at?.trim()) throw new ToolArgsError(['`run_at` is required when `trigger_kind` is "once"'])
        trigger = { kind: 'once', runAt: args.run_at.trim() }
      } else if (triggerKind === 'condition') {
        if (!args.condition_expression?.trim()) {
          throw new ToolArgsError(['`condition_expression` is required when `trigger_kind` is "condition"'])
        }
        trigger = { kind: 'condition', expression: args.condition_expression.trim() }
      } else {
        trigger = { kind: 'manual' }
      }

      let execution: BlueprintAutomationExecution
      if (args.execution_type === 'code') {
        if (!args.code?.trim()) throw new ToolArgsError(['`code` is required when `execution_type` is "code"'])
        execution = { type: 'code', entryFile: 'main.py', entryFunction: 'run', code: args.code }
      } else {
        if (!args.prompt?.trim()) throw new ToolArgsError(['`prompt` is required when `execution_type` is "agent"'])
        execution = { type: 'agent', prompt: args.prompt }
      }

      const inputSchema = parseOptionalJsonSchema(args.input_schema_json, 'input_schema_json')
      const resultSchema = parseOptionalJsonSchema(args.result_schema_json, 'result_schema_json')

      const record = await ctx.blueprint.createAutomation({
        ...(args.id === undefined ? {} : { id: args.id }),
        title: args.title,
        ...(args.description === undefined ? {} : { description: args.description }),
        enabled: args.enabled === true,
        trigger,
        execution,
        ...(inputSchema === undefined ? {} : { inputSchema }),
        ...(resultSchema === undefined ? {} : { resultSchema }),
      })

      return {
        automation: toJson(record),
        summary: `Created automation "${record.title}" (id: ${record.id}, enabled: ${String(record.enabled)}, trigger: ${describeTrigger(record.trigger)}).`,
        meta: automationMeta('create', record),
      }
    },
  }))

  // 5. AutomationUpdate Tool
  ctx.tools.register(defineTool({
    name: 'AutomationUpdate',
    description: 'Update an existing Blueprint Automation\'s title, trigger, Python code or prompt, or JSON Schemas.',
    parameters: {
      id: { type: 'string', required: true, description: 'Automation id to update.' },
      title: { type: 'string', description: 'Updated title.' },
      description: { type: 'string', description: 'Updated description.' },
      enabled: { type: 'boolean', description: 'Optional enabled state.' },
      trigger_kind: { type: 'string', enum: ['manual', 'schedule', 'interval', 'once', 'condition'], description: 'Updated trigger kind.' },
      cron: { type: 'string', description: 'Updated 5-field cron expression.' },
      every_ms: { type: 'number', description: 'Updated interval in milliseconds.' },
      run_at: { type: 'string', description: 'Updated ISO-8601 timestamp.' },
      code: { type: 'string', description: 'Updated Python `def run(ctx)` source.' },
      prompt: { type: 'string', description: 'Updated agent prompt.' },
      input_schema_json: { type: 'string', description: 'Updated input JSON Schema.' },
      result_schema_json: { type: 'string', description: 'Updated result JSON Schema.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
      presentationMeta: (_args, value) => value.meta as Record<string, JsonValue>,
    },
    execute: async (args): Promise<{ summary: string } & Record<string, JsonValue>> => {
      let trigger: BlueprintAutomationTrigger | undefined
      if (args.trigger_kind === 'manual') trigger = { kind: 'manual' }
      else if (args.trigger_kind === 'schedule' && args.cron) trigger = { kind: 'schedule', cron: args.cron }
      else if (args.trigger_kind === 'interval' && typeof args.every_ms === 'number') trigger = { kind: 'interval', everyMs: args.every_ms }
      else if (args.trigger_kind === 'once' && args.run_at) trigger = { kind: 'once', runAt: args.run_at }

      let execution: BlueprintAutomationExecution | undefined
      if (args.code !== undefined) execution = { type: 'code', entryFile: 'main.py', entryFunction: 'run', code: args.code }
      else if (args.prompt !== undefined) execution = { type: 'agent', prompt: args.prompt }

      const inputSchema = parseOptionalJsonSchema(args.input_schema_json, 'input_schema_json')
      const resultSchema = parseOptionalJsonSchema(args.result_schema_json, 'result_schema_json')

      const updated = await ctx.blueprint.updateAutomation({
        id: args.id,
        ...(args.title === undefined ? {} : { title: args.title }),
        ...(args.description === undefined ? {} : { description: args.description }),
        ...(args.enabled === undefined ? {} : { enabled: args.enabled }),
        ...(trigger === undefined ? {} : { trigger }),
        ...(execution === undefined ? {} : { execution }),
        ...(inputSchema === undefined ? {} : { inputSchema }),
        ...(resultSchema === undefined ? {} : { resultSchema }),
      })
      return {
        automation: toJson(updated),
        summary: `Updated automation "${updated.title}" (id: ${updated.id}).`,
        meta: automationMeta('update', updated),
      }
    },
  }))

  // 6. AutomationControl Tool
  ctx.tools.register(defineTool({
    name: 'AutomationControl',
    description:
      'Inspect, run, enable, disable, cancel, or delete Blueprint Automations (`read`, `list`, `enable`, `disable`, `run`, `cancel`, `list_runs`, `read_run`, `preview_delete`, `delete`).',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['read', 'list', 'enable', 'disable', 'run', 'cancel', 'list_runs', 'read_run', 'preview_delete', 'delete'],
        description: 'Control action to run.',
      },
      id: {
        type: 'string',
        description: 'Automation id (or Run id for `read_run` and `cancel`).',
      },
      input_json: {
        type: 'string',
        description: 'Optional JSON input payload passed to `ctx["input"]` when `action === "run"`.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          action: { type: 'string', required: true },
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
      presentationMeta: (_args, value) => (value.meta ?? { kind: 'automation', action: value.action }) as Record<string, JsonValue>,
    },
    execute: async (args): Promise<{ action: string; summary: string } & Record<string, JsonValue>> => {
      switch (args.action) {
        case 'list': {
          const list = ctx.blueprint.listAutomations()
          return {
            action: 'list',
            automations: toJson(list),
            summary: list.length === 0
              ? 'No automations exist yet.'
              : `Found ${String(list.length)} automation(s): ${list.map(a => `${a.id} ("${a.title}", enabled=${String(a.enabled)})`).join(', ')}`,
            meta: { kind: 'automation', action: 'list', count: list.length },
          }
        }
        case 'read': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for AutomationControl `read`'])
          const record = ctx.blueprint.getAutomation(args.id)
          return {
            action: 'read',
            automation: toJson(record),
            summary: `Automation "${record.title}" (${record.id}): enabled=${String(record.enabled)}, trigger=${describeTrigger(record.trigger)}.`,
            meta: automationMeta('read', record),
          }
        }
        case 'enable':
        case 'disable': {
          if (!args.id?.trim()) throw new ToolArgsError([`\`id\` is required for AutomationControl \`${args.action}\``])
          const record = await ctx.blueprint.setAutomationEnabled({
            id: args.id,
            enabled: args.action === 'enable',
          })
          return {
            action: args.action,
            automation: toJson(record),
            summary: `${args.action === 'enable' ? 'Enabled' : 'Disabled'} automation "${record.title}" (${record.id}).`,
            meta: automationMeta(args.action, record),
          }
        }
        case 'run': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for AutomationControl `run`'])
          let inputPayload: JsonValue | undefined
          if (args.input_json !== undefined && args.input_json.trim() !== '') {
            let parsed: unknown
            try {
              parsed = JSON.parse(args.input_json)
            } catch {
              throw new ToolArgsError(['`input_json` must be valid JSON'])
            }
            if (!isJsonValue(parsed)) throw new ToolArgsError(['`input_json` must be valid JSON'])
            inputPayload = parsed as JsonValue
          }
          const run = await ctx.blueprint.runAutomation({
            id: args.id,
            ...(inputPayload === undefined ? {} : { input: inputPayload }),
            triggeredBy: 'manual',
          })
          const record = ctx.blueprint.getAutomation(args.id)
          return {
            action: 'run',
            run: toJson(run),
            summary: run.status === 'succeeded'
              ? `Automation "${record.title}" run ${run.id} succeeded and updated bound widgets.`
              : `Automation "${record.title}" run ${run.id} ended with ${run.status}: ${run.error ?? ''}`,
            meta: automationMeta('run', record),
          }
        }
        case 'cancel': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` (run id) is required for AutomationControl `cancel`'])
          const cancelled = ctx.blueprint.cancelRun(args.id)
          return {
            action: 'cancel',
            run: toJson(cancelled),
            summary: `Cancelled run "${cancelled.id}".`,
            meta: { kind: 'automation', action: 'cancel', runId: cancelled.id },
          }
        }
        case 'list_runs': {
          const runs = await ctx.blueprint.listRuns(args.id)
          return {
            action: 'list_runs',
            runs: toJson(runs),
            summary: `Found ${String(runs.length)} run(s).`,
            meta: { kind: 'automation', action: 'list_runs', count: runs.length },
          }
        }
        case 'read_run': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` (run id) is required for AutomationControl `read_run`'])
          const run = ctx.blueprint.getRun(args.id)
          return {
            action: 'read_run',
            run: toJson(run),
            summary: `Run ${run.id} (${run.status}): ${run.error ?? 'completed'}.`,
            meta: { kind: 'automation', action: 'read_run', runId: run.id, status: run.status },
          }
        }
        case 'preview_delete': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for AutomationControl `preview_delete`'])
          const impact = ctx.blueprint.previewDeleteAutomation(args.id)
          return {
            action: 'preview_delete',
            impact: toJson(impact),
            summary: `Deleting "${args.id}" detaches ${String(impact.bindingIds.length)} binding(s) across ${String(impact.widgetIds.length)} widget(s).`,
            meta: { kind: 'automation', action: 'preview_delete', automationId: args.id },
          }
        }
        case 'delete': {
          if (!args.id?.trim()) throw new ToolArgsError(['`id` is required for AutomationControl `delete`'])
          await ctx.blueprint.deleteAutomation(args.id)
          return {
            action: 'delete',
            summary: `Deleted automation "${args.id}".`,
            meta: { kind: 'automation', action: 'delete', automationId: args.id },
          }
        }
        default:
          throw new ToolArgsError([`Unsupported AutomationControl action: ${String(args.action)}`])
      }
    },
  }))
}
