/**
 * Browser- and Host-safe types for the four-asset Blueprint system
 * (`Widget`, `Canvas`, `Automation`, `Binding`).
 *
 * @module @deepseek-ai/dsh-blueprint/types
 */

import type {} from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { BlueprintWidgetStatus } from './desktop-pins.ts'

export type {
  BlueprintWidgetStatus,
  DesktopWidgetPinCallReply,
  DesktopWidgetPinEvent,
  DesktopWidgetPinJsonValue,
  DesktopWidgetPinLabels,
  DesktopWidgetPinPayload,
  DesktopWidgetPinsBridge,
} from './desktop-pins.ts'

/** Branded identifier of one Blueprint Widget (`小组件`). */
export type BlueprintWidgetId = Branded<'BlueprintWidgetId'>
/** Branded identifier of one Blueprint Canvas (`看板`). */
export type BlueprintCanvasId = Branded<'BlueprintCanvasId'>
/** Branded identifier of one Canvas placement tile. */
export type BlueprintPlacementId = Branded<'BlueprintPlacementId'>
/** Branded identifier of one Blueprint Automation (`定时任务` / `小组件任务`). */
export type BlueprintAutomationId = Branded<'BlueprintAutomationId'>
/** Branded identifier of one Automation run record. */
export type BlueprintRunId = Branded<'BlueprintRunId'>
/** Branded identifier of one Blueprint Binding edge. */
export type BlueprintBindingId = Branded<'BlueprintBindingId'>
/** Branded identifier of one managed Blueprint file resource. */
export type BlueprintFileId = Branded<'BlueprintFileId'>

/** Origin category of a managed Blueprint file resource. */
export type BlueprintFileSource = 'user-upload' | 'widget-output' | 'automation-output' | 'imported'

/** Stable JSON file reference passed across `DaimonWidget.files`, Widget inputs, and Automation artifacts. */
export interface BlueprintFileResourceRef {
  readonly kind: 'file'
  readonly fileId: BlueprintFileId
  readonly name: string
  readonly mimeType?: string
  readonly sizeBytes: number
  readonly sha256?: string
  readonly source: BlueprintFileSource
  readonly createdAt: string
}

/** Base64 byte envelope returned by `DaimonWidget.files.readBytes(...)`. */
export interface BlueprintFileBytes {
  readonly encoding: 'base64'
  readonly data: string
  readonly sizeBytes: number
  readonly mimeType?: string
}

/** Outcome returned by `DaimonWidget.files.download(...)`. */
export type BlueprintFileDownloadResult =
  | { readonly cancelled: false; readonly fileRef: BlueprintFileResourceRef }
  | { readonly cancelled: true; readonly reasonCode: string }

/** Simplified JSON Schema subset validated by the Binding engine. */
export interface BlueprintJsonSchema {
  readonly type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean'
  readonly description?: string
  readonly properties?: Readonly<Record<string, BlueprintJsonSchema>>
  readonly required?: readonly string[]
  readonly items?: BlueprintJsonSchema
}

/** Named data slot or outbound event port declared on a Widget. */
export interface BlueprintPortDeclaration {
  readonly description?: string
  readonly schema?: BlueprintJsonSchema
}

/** Stored Widget manifest and assembled HTML preview. */
export interface BlueprintWidgetRecord {
  readonly id: BlueprintWidgetId
  readonly title: string
  readonly description?: string
  readonly slots: Readonly<Record<string, BlueprintPortDeclaration>>
  readonly events: Readonly<Record<string, BlueprintPortDeclaration>>
  readonly latestData: Readonly<Record<string, JsonValue>>
  readonly savedInput: Readonly<Record<string, JsonValue>>
  readonly status: BlueprintWidgetStatus
  readonly statusMessage?: string
  readonly lastRunAt?: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Complete Widget payload including assembled self-contained HTML for sandboxed rendering. */
export interface BlueprintWidgetDetail extends BlueprintWidgetRecord {
  readonly rawHtml: string
  readonly assembledHtml: string
}

/** Validation outcome for a Widget or Binding. */
export interface BlueprintValidationResult {
  readonly valid: boolean
  readonly diagnostics: readonly string[]
}

/** 12-column grid rectangle (`x` in `0..11`, `w` in `2..12`, `x + w <= 12`, `h` in `2..33`). */
export interface BlueprintGridRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** Free-layout rectangle in CSS pixels. */
export interface BlueprintFreeRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** One Widget tile placed on a Canvas dashboard. */
export interface BlueprintCanvasPlacement {
  readonly id: BlueprintPlacementId
  readonly widgetId: BlueprintWidgetId
  readonly titleOverride?: string
  readonly rect: BlueprintGridRect
  readonly freeRect?: BlueprintFreeRect
  readonly zIndex?: number
}

/** Stored viewport state for free or scrollable Canvas boards. */
export interface BlueprintCanvasViewState {
  readonly zoom: number
  readonly panX: number
  readonly panY: number
}

/** Stored Canvas (`看板`) dashboard record. */
export interface BlueprintCanvasRecord {
  readonly id: BlueprintCanvasId
  readonly title: string
  readonly description?: string
  readonly layoutMode: 'grid' | 'free'
  readonly placements: readonly BlueprintCanvasPlacement[]
  readonly viewState: BlueprintCanvasViewState
  readonly createdAt: string
  readonly updatedAt: string
}

/** Trigger specification of a Blueprint Automation. */
export type BlueprintAutomationTrigger =
  | { readonly kind: 'manual' }
  | { readonly kind: 'schedule'; readonly cron: string; readonly timeZone?: string }
  | { readonly kind: 'interval'; readonly everyMs: number }
  | { readonly kind: 'once'; readonly runAt: string }
  | { readonly kind: 'condition'; readonly expression: string; readonly checkEveryMs?: number }

/** Execution payload of a Blueprint Automation. */
export type BlueprintAutomationExecution =
  | {
    readonly type: 'code'
    readonly entryFile?: string
    readonly entryFunction?: string
    readonly code: string
  }
  | {
    readonly type: 'agent'
    readonly prompt: string
  }

/** Stored Automation (`定时任务` / `小组件任务`) manifest. */
export interface BlueprintAutomationRecord {
  readonly id: BlueprintAutomationId
  readonly title: string
  readonly description?: string
  readonly enabled: boolean
  readonly trigger: BlueprintAutomationTrigger
  readonly execution: BlueprintAutomationExecution
  readonly inputSchema?: BlueprintJsonSchema
  readonly resultSchema?: BlueprintJsonSchema
  readonly lastRunId?: BlueprintRunId
  readonly lastRunStatus?: 'running' | 'succeeded' | 'failed' | 'cancelled'
  readonly lastRunAt?: string
  readonly lastError?: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Execution log and output artifact of a single Automation run. */
export interface BlueprintAutomationRun {
  readonly id: BlueprintRunId
  readonly automationId: BlueprintAutomationId
  readonly status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  readonly triggeredBy: 'manual' | 'schedule' | 'widget_event'
  readonly input?: JsonValue
  readonly artifact?: JsonValue
  readonly logs: string
  readonly error?: string
  readonly startedAt: string
  readonly finishedAt?: string
}

/** Endpoint of a Binding edge. */
export interface BlueprintBindingEndpoint {
  readonly kind: 'automation' | 'widget'
  readonly id: string
  readonly port: string
}

/** Bidirectional Binding edge between an Automation and a Widget. */
export interface BlueprintBindingRecord {
  readonly id: BlueprintBindingId
  readonly source: BlueprintBindingEndpoint
  readonly target: BlueprintBindingEndpoint
  readonly enabled: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

/** Snapshot returned to Browser clients for Dashboards, Widgets, Automations, and Bindings. */
export interface BlueprintCatalogSnapshot {
  readonly revision: number
  readonly widgets: readonly BlueprintWidgetRecord[]
  readonly canvases: readonly BlueprintCanvasRecord[]
  readonly automations: readonly BlueprintAutomationRecord[]
  readonly bindings: readonly BlueprintBindingRecord[]
}

/** Request payload for creating a Widget. */
export interface CreateWidgetInput {
  readonly id?: string
  readonly title: string
  readonly description?: string
  readonly html: string
  readonly files?: Readonly<Record<string, string>>
  readonly slots?: Readonly<Record<string, BlueprintPortDeclaration>>
  readonly events?: Readonly<Record<string, BlueprintPortDeclaration>>
  readonly latestData?: Readonly<Record<string, JsonValue>>
}

/** Request payload for updating an existing Widget. */
export interface UpdateWidgetInput {
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly html?: string
  readonly files?: Readonly<Record<string, string>>
  readonly slots?: Readonly<Record<string, BlueprintPortDeclaration>>
  readonly events?: Readonly<Record<string, BlueprintPortDeclaration>>
  readonly latestData?: Readonly<Record<string, JsonValue>>
  readonly status?: BlueprintWidgetStatus
  readonly statusMessage?: string
}

/** Request payload for creating a Canvas dashboard. */
export interface CreateCanvasInput {
  readonly id?: string
  readonly title: string
  readonly description?: string
  readonly layoutMode?: 'grid' | 'free'
}

/** Request payload for updating Canvas metadata or layout mode. */
export interface UpdateCanvasInput {
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly layoutMode?: 'grid' | 'free'
}

/** Request payload for placing a Widget onto a Canvas. */
export interface PlaceWidgetInput {
  readonly canvasId: string
  readonly widgetId: string
  readonly titleOverride?: string
  readonly rect?: Partial<BlueprintGridRect>
  readonly freeRect?: Partial<BlueprintFreeRect>
}

/** Request payload for updating a Canvas placement. */
export interface UpdatePlacementInput {
  readonly canvasId: string
  readonly placementId: string
  readonly titleOverride?: string
  readonly rect?: Partial<BlueprintGridRect>
  readonly freeRect?: Partial<BlueprintFreeRect>
}

/** Request payload for creating an Automation (disabled by default unless `enabled: true`). */
export interface CreateAutomationInput {
  readonly id?: string
  readonly title: string
  readonly description?: string
  readonly enabled?: boolean
  readonly trigger?: BlueprintAutomationTrigger
  readonly execution: BlueprintAutomationExecution
  readonly inputSchema?: BlueprintJsonSchema
  readonly resultSchema?: BlueprintJsonSchema
}

/** Request payload for updating an Automation. */
export interface UpdateAutomationInput {
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly enabled?: boolean
  readonly trigger?: BlueprintAutomationTrigger
  readonly execution?: BlueprintAutomationExecution
  readonly inputSchema?: BlueprintJsonSchema
  readonly resultSchema?: BlueprintJsonSchema
}

/** Request payload for creating a Binding edge. */
export interface CreateBindingInput {
  readonly id?: string
  readonly source: BlueprintBindingEndpoint
  readonly target: BlueprintBindingEndpoint
  readonly enabled?: boolean
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Requested Blueprint Widget, Canvas, Placement, or Automation does not exist. */
    'blueprint/not-found': {}
    /** Blueprint Remote request failed schema, layout, or input validation. */
    'blueprint/invalid-argument': {}
    /** Blueprint Resource Store file operation failed with a stable Kimi `DaimonWidget.files` code. */
    'blueprint/file-error': { readonly reasonCode: string }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Emitted whenever any Blueprint Widget, Canvas, Automation, or Binding record changes.
     * @param revision - Monotonic catalog revision counter.
     * @mode emit
     */
    'blueprint/changed'(revision: number): void
  }
}
