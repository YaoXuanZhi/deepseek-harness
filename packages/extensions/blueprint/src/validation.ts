/**
 * Widget HTML validation, 12-column Canvas grid geometry validation,
 * JSON Schema compatibility checks for Bindings, and 5-field cron matching.
 *
 * @module @deepseek-ai/dsh-blueprint/validation
 */

import type {
  BlueprintAutomationRecord,
  BlueprintBindingRecord,
  BlueprintCanvasPlacement,
  BlueprintGridRect,
  BlueprintJsonSchema,
  BlueprintValidationResult,
  BlueprintWidgetRecord,
} from './types.ts'
import { BlueprintError } from './error.ts'

const SAFE_SLUG = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

/**
 * Validate or normalize a caller-supplied Blueprint entity identifier.
 * @param raw - Caller-provided identifier or undefined.
 * @param prefix - Fallback prefix when `raw` is omitted.
 * @returns Validated slug string.
 */
export function normalizeBlueprintId(raw: string | undefined, prefix: string): string {
  if (raw === undefined || raw.trim() === '') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }
  const trimmed = raw.trim()
  if (!SAFE_SLUG.test(trimmed)) {
    throw new BlueprintError(
      `Invalid Blueprint id "${trimmed}": use 1-64 ASCII letters, digits, hyphens, or underscores starting with an alphanumeric character`,
      'BLUEPRINT_INVALID_ID',
    )
  }
  return trimmed
}

/**
 * Validate a relative file path inside a Widget or Automation workspace.
 * @param relativePath - Relative path supplied by a caller.
 * @returns Normalized POSIX relative path.
 */
export function validateRelativeWorkspacePath(relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/').trim().replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
    throw new BlueprintError(
      `Invalid workspace file path "${relativePath}": path must stay inside the asset directory`,
      'BLUEPRINT_INVALID_PATH',
    )
  }
  return normalized
}

/**
 * Validate a Widget's HTML source and port declarations before display or placement.
 * @param record - Widget manifest.
 * @param rawHtml - Raw `index.html` content.
 * @returns Validation diagnostics (`valid === true` when `diagnostics.length === 0`).
 */
export function validateWidgetSource(record: BlueprintWidgetRecord, rawHtml: string): BlueprintValidationResult {
  const diagnostics: string[] = []
  if (rawHtml.trim().length === 0) {
    diagnostics.push('Widget HTML (`index.html`) must not be empty.')
  }
  const openScripts = (rawHtml.match(/<script\b[^>]*>/gi) ?? []).length
  const closeScripts = (rawHtml.match(/<\/script\s*>/gi) ?? []).length
  if (openScripts !== closeScripts) {
    diagnostics.push(`Unbalanced <script> tags: ${String(openScripts)} opening vs ${String(closeScripts)} closing.`)
  }
  const openStyles = (rawHtml.match(/<style\b[^>]*>/gi) ?? []).length
  const closeStyles = (rawHtml.match(/<\/style\s*>/gi) ?? []).length
  if (openStyles !== closeStyles) {
    diagnostics.push(`Unbalanced <style> tags: ${String(openStyles)} opening vs ${String(closeStyles)} closing.`)
  }
  if (!record.title.trim()) {
    diagnostics.push('Widget title must not be empty.')
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics,
  }
}

/**
 * Check whether two 12-column grid rectangles overlap.
 * @param a - First rectangle.
 * @param b - Second rectangle.
 * @returns True when `a` and `b` intersect.
 */
export function gridRectsOverlap(a: BlueprintGridRect, b: BlueprintGridRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * Validate or auto-place a 12-column Canvas grid rectangle (`x: 0..11`, `w: 2..12`, `h: 2..33`).
 * @param existing - Existing placements on the Canvas (excluding any placement being updated).
 * @param partial - Caller-requested partial rectangle.
 * @returns Validated non-overlapping 12-column grid rectangle.
 */
export function resolveCanvasGridRect(
  existing: readonly BlueprintCanvasPlacement[],
  partial?: Partial<BlueprintGridRect>,
): BlueprintGridRect {
  const w = partial?.w ?? 6
  const h = partial?.h ?? 8
  if (!Number.isInteger(w) || w < 2 || w > 12) {
    throw new BlueprintError(`Grid width \`w\` must be an integer between 2 and 12 (received ${String(w)})`, 'BLUEPRINT_INVALID_LAYOUT')
  }
  if (!Number.isInteger(h) || h < 2 || h > 33) {
    throw new BlueprintError(`Grid height \`h\` must be an integer between 2 and 33 (received ${String(h)})`, 'BLUEPRINT_INVALID_LAYOUT')
  }
  if (partial?.x !== undefined || partial?.y !== undefined) {
    const x = partial.x ?? 0
    const y = partial.y ?? 0
    if (!Number.isInteger(x) || x < 0 || x + w > 12) {
      throw new BlueprintError(
        `Grid column \`x\` (${String(x)}) with width \`w\` (${String(w)}) exceeds the 12-column Canvas bounds`,
        'BLUEPRINT_INVALID_LAYOUT',
      )
    }
    if (!Number.isInteger(y) || y < 0) {
      throw new BlueprintError(`Grid row \`y\` must be a non-negative integer (received ${String(y)})`, 'BLUEPRINT_INVALID_LAYOUT')
    }
    const candidate: BlueprintGridRect = { x, y, w, h }
    for (const item of existing) {
      if (gridRectsOverlap(candidate, item.rect)) {
        throw new BlueprintError(
          `Grid placement (${String(x)}, ${String(y)}, ${String(w)}x${String(h)}) overlaps existing widget "${item.widgetId}"`,
          'BLUEPRINT_INVALID_LAYOUT',
        )
      }
    }
    return candidate
  }

  // Auto-pack into the first available row/column slot on the 12-column grid
  for (let y = 0; y < 200; y += 1) {
    for (let x = 0; x <= 12 - w; x += 1) {
      const candidate: BlueprintGridRect = { x, y, w, h }
      if (!existing.some(item => gridRectsOverlap(candidate, item.rect))) {
        return candidate
      }
    }
  }
  const maxBottom = existing.reduce((acc, item) => Math.max(acc, item.rect.y + item.rect.h), 0)
  return { x: 0, y: maxBottom, w, h }
}

function schemaTypesCompatible(sourceType: string | undefined, targetType: string | undefined): boolean {
  if (!sourceType || !targetType) return true
  if (sourceType === targetType) return true
  if (sourceType === 'integer' && targetType === 'number') return true
  return false
}

/**
 * Validate JSON Schema compatibility between a Binding's source port and target port.
 * @param binding - Binding edge to check.
 * @param widget - Referenced Widget record (if present).
 * @param automation - Referenced Automation record (if present).
 * @returns Validation result with human- and model-actionable diagnostics.
 */
export function validateBindingCompatibility(
  binding: BlueprintBindingRecord,
  widget: BlueprintWidgetRecord | undefined,
  automation: BlueprintAutomationRecord | undefined,
): BlueprintValidationResult {
  const diagnostics: string[] = []
  if (!widget) diagnostics.push(`Referenced Widget is missing for binding "${binding.id}".`)
  if (!automation) diagnostics.push(`Referenced Automation is missing for binding "${binding.id}".`)
  if (!widget || !automation) return { valid: false, diagnostics }

  let sourceSchema: BlueprintJsonSchema | undefined
  let targetSchema: BlueprintJsonSchema | undefined

  if (binding.source.kind === 'automation' && binding.target.kind === 'widget') {
    if (binding.source.port !== 'result') {
      diagnostics.push(`Automation source port must be "result" (received "${binding.source.port}").`)
    }
    const slotName = binding.target.port.startsWith('slot:')
      ? binding.target.port.slice('slot:'.length)
      : binding.target.port
    sourceSchema = automation.resultSchema
    targetSchema = widget.slots[slotName]?.schema
  } else if (binding.source.kind === 'widget' && binding.target.kind === 'automation') {
    if (binding.target.port !== 'input') {
      diagnostics.push(`Automation target port must be "input" (received "${binding.target.port}").`)
    }
    const eventName = binding.source.port.startsWith('event:')
      ? binding.source.port.slice('event:'.length)
      : binding.source.port
    sourceSchema = widget.events[eventName]?.schema
    targetSchema = automation.inputSchema
  } else {
    diagnostics.push('Binding must connect an Automation and a Widget in either direction.')
    return { valid: false, diagnostics }
  }

  if (sourceSchema && targetSchema) {
    if (!schemaTypesCompatible(sourceSchema.type, targetSchema.type)) {
      diagnostics.push(
        `Root schema type mismatch: source produces "${String(sourceSchema.type)}" while target expects "${String(targetSchema.type)}".`,
      )
    }
    if (targetSchema.type === 'object' && targetSchema.required && targetSchema.required.length > 0) {
      const sourceProps = sourceSchema.properties ?? {}
      const targetProps = targetSchema.properties ?? {}
      for (const reqKey of targetSchema.required) {
        const srcProp = sourceProps[reqKey]
        if (!srcProp) {
          diagnostics.push(`Target requires property "${reqKey}", which is absent from source schema properties.`)
          continue
        }
        const tgtProp = targetProps[reqKey]
        if (tgtProp && !schemaTypesCompatible(srcProp.type, tgtProp.type)) {
          diagnostics.push(
            `Property "${reqKey}" type mismatch: source produces "${String(srcProp.type)}" while target expects "${String(tgtProp.type)}".`,
          )
        }
      }
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  }
}

/**
 * Validate a runtime JSON value against a simplified `BlueprintJsonSchema`.
 * @param value - Runtime JSON value.
 * @param schema - Optional schema to check against.
 * @returns List of validation error strings (empty when valid).
 */
export function validateRuntimePayload(value: unknown, schema: BlueprintJsonSchema | undefined): string[] {
  if (!schema || !schema.type) return []
  const errors: string[] = []
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return ['Expected an object payload.']
    }
    const record = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (!(key in record) || record[key] === undefined) {
        errors.push(`Missing required property "${key}".`)
      }
    }
  } else if (schema.type === 'array' && !Array.isArray(value)) {
    errors.push('Expected an array payload.')
  } else if (schema.type === 'string' && typeof value !== 'string') {
    errors.push('Expected a string payload.')
  } else if ((schema.type === 'number' || schema.type === 'integer') && typeof value !== 'number') {
    errors.push(`Expected a ${schema.type} payload.`)
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push('Expected a boolean payload.')
  }
  return errors
}

function cronFieldMatches(field: string, value: number, min: number, max: number): boolean {
  for (const part of field.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) return false
    const [rangePart, stepPart] = trimmed.split('/')
    const step = stepPart === undefined ? 1 : Number.parseInt(stepPart, 10)
    if (!Number.isInteger(step) || step <= 0) return false
    if (rangePart === '*') {
      if ((value - min) % step === 0) return true
      continue
    }
    if (rangePart?.includes('-')) {
      const [loRaw, hiRaw] = rangePart.split('-')
      const lo = Number.parseInt(loRaw ?? '', 10)
      const hi = Number.parseInt(hiRaw ?? '', 10)
      if (Number.isInteger(lo) && Number.isInteger(hi) && value >= lo && value <= hi && (value - lo) % step === 0) {
        return true
      }
      continue
    }
    const exact = Number.parseInt(rangePart ?? '', 10)
    if (Number.isInteger(exact) && exact >= min && exact <= max && exact === value) return true
  }
  return false
}

/**
 * Evaluate whether a 5-field cron expression (`min hour dom month dow`) matches a Date.
 * @param cron - Standard 5-field cron expression.
 * @param date - Date to test.
 * @returns True when all 5 fields match `date`.
 */
export function matchesCronMinute(cron: string, date: Date): boolean {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const [minute = '', hour = '', dom = '', month = '', dow = ''] = fields
  return (
    cronFieldMatches(minute, date.getMinutes(), 0, 59)
    && cronFieldMatches(hour, date.getHours(), 0, 23)
    && cronFieldMatches(dom, date.getDate(), 1, 31)
    && cronFieldMatches(month, date.getMonth() + 1, 1, 12)
    && cronFieldMatches(dow, date.getDay(), 0, 6)
  )
}
