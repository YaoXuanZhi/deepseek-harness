/**
 * Cordis-free Electron Desktop Widget Pin Window wire types shared between
 * `apps/desktop` (`dsh-app://app` and `dsh-app://pin/<widgetId>`),
 * `@deepseek-ai/dsh-blueprint`, and `@deepseek-ai/dsh-client-ui-blueprint`.
 *
 * Kept dependency-free so `apps/desktop/src/ipc.ts` remains Cordis-free in both
 * Host and Client TypeScript programs.
 *
 * @module @deepseek-ai/dsh-blueprint/desktop-pins
 */

/** Serializable JSON value carried across Desktop Pin Window IPC messages. */
export type DesktopWidgetPinJsonValue =
  | string
  | number
  | boolean
  | null
  | DesktopWidgetPinJsonValue[]
  | { [key: string]: DesktopWidgetPinJsonValue }

/** Runtime status of a Widget surface. */
export type BlueprintWidgetStatus = 'idle' | 'running' | 'error' | 'degraded' | 'needs_input'

/** Localized header control labels supplied to a Desktop floating Widget Pin Window. */
export interface DesktopWidgetPinLabels {
  readonly alwaysOnTopOn: string
  readonly alwaysOnTopOff: string
  readonly focusWorkspace: string
  readonly close: string
}

/** Snapshot pushed to open or synchronize a Desktop floating Widget Pin Window. */
export interface DesktopWidgetPinPayload {
  readonly widgetId: string
  readonly title: string
  readonly assembledHtml: string
  readonly theme: 'light' | 'dark'
  readonly locale: string
  readonly slots: Readonly<Record<string, DesktopWidgetPinJsonValue>>
  readonly savedInput: Readonly<Record<string, DesktopWidgetPinJsonValue>>
  readonly status: BlueprintWidgetStatus
  readonly statusMessage?: string
  readonly width?: number
  readonly height?: number
  readonly labels: DesktopWidgetPinLabels
}

/** Upstream interaction forwarded from a Desktop floating Widget Pin Window to the owning app renderer. */
export type DesktopWidgetPinEvent =
  | { readonly kind: 'closed'; readonly widgetId: string }
  | {
    readonly kind: 'save-input'
    readonly widgetId: string
    readonly input: Readonly<Record<string, DesktopWidgetPinJsonValue>>
  }
  | {
    readonly kind: 'emit'
    readonly widgetId: string
    readonly event: string
    readonly data: DesktopWidgetPinJsonValue
  }
  | { readonly kind: 'open-canvas'; readonly widgetId: string; readonly canvasId: string | null }
  | {
    readonly kind: 'files-call'
    readonly widgetId: string
    readonly requestId: string
    readonly method: string
    readonly args: DesktopWidgetPinJsonValue
  }

/** Reply sent back to a Desktop floating Widget Pin Window for a `DaimonWidget.files` call. */
export interface DesktopWidgetPinCallReply {
  readonly widgetId: string
  readonly requestId: string
  readonly ok: boolean
  readonly result?: DesktopWidgetPinJsonValue
  readonly error?: { readonly code: string; readonly message: string }
}

/** Trusted preload bridge exposed on `window.dshDesktop.widgetPins` in Electron Desktop. */
export interface DesktopWidgetPinsBridge {
  /** Open or focus a floating always-on-top Pin Window for one Widget. */
  open(this: void, payload: DesktopWidgetPinPayload): Promise<{ readonly pinned: boolean; readonly alwaysOnTop: boolean }>
  /** Push updated theme, locale, slot data, or status into an open Pin Window. */
  sync(this: void, payload: DesktopWidgetPinPayload): Promise<boolean>
  /** Close a Widget's floating Pin Window when open. */
  close(this: void, widgetId: string): Promise<boolean>
  /** List Widget IDs currently open in Desktop Pin Windows. */
  list(this: void): Promise<readonly string[]>
  /** Deliver the settled result of a `DaimonWidget.files` call back to the Pin Window. */
  replyFilesCall(this: void, reply: DesktopWidgetPinCallReply): Promise<void>
  /** Subscribe to user interactions and close events from open Pin Windows. */
  subscribe(this: void, listener: (event: DesktopWidgetPinEvent) => void): () => void
}
