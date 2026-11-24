/**
 * Floating Widget Pin Window controller (`桌面置顶`).
 *
 * - In **Electron Desktop** (`window.dshDesktop.widgetPins`), opens a native
 *   frameless always-on-top `BrowserWindow` with a 32px Kimi Perspective drag
 *   header strip and live bidirectional `DaimonWidget` + `DaimonWidget.files`
 *   synchronization.
 * - In **Web browsers** (`dsh web`), opens an OS-level floating Picture-in-Picture
 *   window via `documentPictureInPicture.requestWindow` when available, falling
 *   back to a synchronized standalone popup window.
 *
 * @module @deepseek-ai/dsh-client-ui-blueprint/client/widget-pin-host
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  BlueprintWidgetDetail,
  BlueprintWidgetStatus,
  DesktopWidgetPinLabels,
  DesktopWidgetPinPayload,
  DesktopWidgetPinsBridge,
} from '@deepseek-ai/dsh-blueprint/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { BlueprintClientState } from './catalog-source.ts'
import type { BlueprintFilesDispatcher } from './widget-files-host.ts'

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
}

interface WebPinnedEntry {
  readonly win: Window
  readonly iframe: HTMLIFrameElement
  readonly headerBar: HTMLElement
  readonly titleSpan: HTMLElement
  cleanup: () => void
}

/** Options supplied when constructing the Widget Pin Window controller. */
export interface WidgetPinControllerDeps {
  readonly getState: () => BlueprintClientState
  readonly getTheme: () => 'light' | 'dark'
  readonly getLocale: () => string
  readonly getLabels: () => DesktopWidgetPinLabels
  readonly ensureWidget: (widgetId: string) => Promise<BlueprintWidgetDetail | void | undefined>
  readonly onSaveInput: (widgetId: string, input: Readonly<Record<string, JsonValue>>) => void
  readonly onEmitEvent: (widgetId: string, event: string, data: JsonValue) => void
  readonly onOpenCanvas: (canvasId: string | undefined) => void
  readonly filesDispatcher: BlueprintFilesDispatcher
}

/** Public handle returned by `createWidgetPinController`. */
export interface WidgetPinController {
  readonly pinnedIds: SnapshotStore<readonly string[]>
  readonly togglePin: (widgetId: string, fallbackTitle: string, fallbackHtml?: string) => Promise<void>
  readonly syncAll: () => void
  readonly dispose: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readDesktopWidgetPins(): DesktopWidgetPinsBridge | undefined {
  return (window as Window & { dshDesktop?: { widgetPins?: DesktopWidgetPinsBridge } }).dshDesktop?.widgetPins
}

/**
 * Create the cross-surface Widget Pin Window controller.
 * @param deps - State readers, action callbacks, and `DaimonWidget.files` dispatcher.
 * @returns Pin Window controller owning active pinned IDs and teardown.
 */
export function createWidgetPinController(deps: WidgetPinControllerDeps): WidgetPinController {
  const pinnedSet = new Set<string>()
  const pinnedIds = createSnapshotStore<readonly string[]>([])
  const webEntries = new Map<string, WebPinnedEntry>()
  const fallbackCache = new Map<string, { title: string; html: string }>()
  const desktopPins = readDesktopWidgetPins()

  const publishIds = (): void => {
    pinnedIds.set([...pinnedSet])
  }

  const buildPayload = (widgetId: string): DesktopWidgetPinPayload | undefined => {
    const bp = deps.getState()
    const detail = bp.widgetDetails[widgetId]
    const record = bp.catalog.widgets.find(w => w.id === widgetId)
    const fallback = fallbackCache.get(widgetId)
    const assembledHtml = detail?.assembledHtml ?? fallback?.html ?? ''
    if (!assembledHtml) return undefined
    const title = detail?.title ?? record?.title ?? fallback?.title ?? widgetId
    const status: BlueprintWidgetStatus = detail?.status ?? record?.status ?? 'idle'
    const statusMessage = detail?.statusMessage ?? record?.statusMessage
    return {
      widgetId,
      title,
      assembledHtml,
      theme: deps.getTheme(),
      locale: deps.getLocale(),
      slots: detail?.latestData ?? record?.latestData ?? {},
      savedInput: detail?.savedInput ?? record?.savedInput ?? {},
      status,
      ...(statusMessage === undefined ? {} : { statusMessage }),
      width: 480,
      height: 440,
      labels: deps.getLabels(),
    }
  }

  const stopDesktopSub = desktopPins?.subscribe((ev) => {
    switch (ev.kind) {
      case 'closed':
        if (pinnedSet.delete(ev.widgetId)) publishIds()
        return
      case 'save-input':
        deps.onSaveInput(ev.widgetId, ev.input)
        return
      case 'emit':
        deps.onEmitEvent(ev.widgetId, ev.event, ev.data)
        return
      case 'open-canvas':
        deps.onOpenCanvas(ev.canvasId ?? undefined)
        return
      case 'files-call':
        void deps.filesDispatcher.dispatch(ev.widgetId, ev.method, ev.args).then(async (outcome) => {
          if (outcome.ok) {
            await desktopPins.replyFilesCall({
              widgetId: ev.widgetId,
              requestId: ev.requestId,
              ok: true,
              result: outcome.result,
            })
          } else {
            await desktopPins.replyFilesCall({
              widgetId: ev.widgetId,
              requestId: ev.requestId,
              ok: false,
              error: outcome.error,
            })
          }
        })
        return
    }
  })

  const applyWebTheme = (entry: WebPinnedEntry, payload: DesktopWidgetPinPayload): void => {
    const dark = payload.theme === 'dark'
    entry.win.document.documentElement.style.background = dark ? '#181817' : '#FBFAF9'
    entry.win.document.body.style.background = dark ? '#1F1F1F' : '#FFFFFF'
    entry.headerBar.style.background = dark ? '#181817' : '#FBFAF9'
    entry.headerBar.style.color = dark ? '#E8E8E6' : '#181817'
    entry.headerBar.style.borderBottom = dark
      ? '0.5px solid rgba(255,255,255,0.10)'
      : '0.5px solid rgba(0,0,0,0.09)'
    entry.titleSpan.textContent = payload.title
  }

  const postToWebEntry = (entry: WebPinnedEntry, type: 'init' | 'sync', payload: DesktopWidgetPinPayload): void => {
    entry.iframe.contentWindow?.postMessage({
      channel: 'daimon-widget-host',
      widgetId: payload.widgetId,
      type,
      payload: {
        theme: payload.theme,
        locale: payload.locale,
        slots: payload.slots,
        savedInput: payload.savedInput,
        status: payload.status,
        statusMessage: payload.statusMessage ?? null,
      },
    }, '*')
  }

  const openWebPinWindow = async (payload: DesktopWidgetPinPayload): Promise<void> => {
    const existing = webEntries.get(payload.widgetId)
    if (existing && !existing.win.closed) {
      existing.win.focus()
      return
    }

    const dpip = (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi }).documentPictureInPicture
    let targetWin: Window | null = null
    if (dpip && typeof dpip.requestWindow === 'function') {
      try {
        targetWin = await dpip.requestWindow({ width: payload.width ?? 480, height: payload.height ?? 440 })
      } catch (_pipErr) {
        targetWin = null
      }
    }
    if (targetWin === null) {
      targetWin = window.open(
        'about:blank',
        `dsh-widget-pin-${payload.widgetId}`,
        `popup=yes,width=${String(payload.width ?? 480)},height=${String(payload.height ?? 440)}`,
      )
    }
    if (!targetWin) return

    const doc = targetWin.document
    doc.title = payload.title
    doc.body.innerHTML = ''
    doc.body.style.margin = '0'
    doc.body.style.display = 'flex'
    doc.body.style.flexDirection = 'column'
    doc.body.style.height = '100vh'
    doc.body.style.overflow = 'hidden'
    doc.body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'

    const headerBar = doc.createElement('div')
    headerBar.setAttribute('data-widget-pin-header', payload.widgetId)
    headerBar.style.height = '32px'
    headerBar.style.minHeight = '32px'
    headerBar.style.display = 'flex'
    headerBar.style.alignItems = 'center'
    headerBar.style.justifyContent = 'space-between'
    headerBar.style.padding = '0 10px'
    headerBar.style.fontSize = '12px'
    headerBar.style.fontWeight = '500'

    const titleSpan = doc.createElement('span')
    titleSpan.style.overflow = 'hidden'
    titleSpan.style.textOverflow = 'ellipsis'
    titleSpan.style.whiteSpace = 'nowrap'
    titleSpan.textContent = payload.title

    const btnGroup = doc.createElement('div')
    btnGroup.style.display = 'inline-flex'
    btnGroup.style.alignItems = 'center'
    btnGroup.style.gap = '6px'

    const focusBtn = doc.createElement('button')
    focusBtn.type = 'button'
    focusBtn.textContent = payload.labels.focusWorkspace
    focusBtn.style.border = '0.5px solid rgba(128,128,128,0.28)'
    focusBtn.style.background = 'transparent'
    focusBtn.style.color = 'inherit'
    focusBtn.style.borderRadius = '6px'
    focusBtn.style.height = '22px'
    focusBtn.style.padding = '0 8px'
    focusBtn.style.fontSize = '11px'
    focusBtn.style.cursor = 'pointer'
    focusBtn.onclick = () => { window.focus() }

    const closeBtn = doc.createElement('button')
    closeBtn.type = 'button'
    closeBtn.setAttribute('aria-label', payload.labels.close)
    closeBtn.textContent = '×'
    closeBtn.style.border = 'none'
    closeBtn.style.background = 'transparent'
    closeBtn.style.color = 'inherit'
    closeBtn.style.fontSize = '16px'
    closeBtn.style.lineHeight = '1'
    closeBtn.style.width = '22px'
    closeBtn.style.height = '22px'
    closeBtn.style.cursor = 'pointer'

    btnGroup.append(focusBtn, closeBtn)
    headerBar.append(titleSpan, btnGroup)

    const iframe = doc.createElement('iframe')
    iframe.title = payload.title
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.srcdoc = payload.assembledHtml
    iframe.style.border = 'none'
    iframe.style.width = '100%'
    iframe.style.flex = '1'

    doc.body.append(headerBar, iframe)

    const entry: WebPinnedEntry = {
      win: targetWin,
      iframe,
      headerBar,
      titleSpan,
      cleanup: () => {},
    }
    applyWebTheme(entry, payload)

    const onMessage = (ev: MessageEvent): void => {
      if (ev.source !== iframe.contentWindow) return
      const msg: unknown = ev.data
      if (!isRecord(msg) || msg.channel !== 'daimon-widget') return
      const p = isRecord(msg.payload) ? msg.payload : {}
      const latest = buildPayload(payload.widgetId) ?? payload

      if (msg.type === 'ready') {
        postToWebEntry(entry, 'init', latest)
      } else if (msg.type === 'saveInput' && isRecord(p.input)) {
        deps.onSaveInput(payload.widgetId, p.input as Readonly<Record<string, JsonValue>>)
      } else if (msg.type === 'emit') {
        const evName = typeof p.event === 'string' ? p.event : 'submit'
        deps.onEmitEvent(payload.widgetId, evName, (p.data ?? null) as JsonValue)
      } else if (msg.type === 'openCanvas') {
        window.focus()
        deps.onOpenCanvas(typeof p.canvasId === 'string' ? p.canvasId : undefined)
      } else if (msg.type === 'files-call' && typeof p.requestId === 'string' && typeof p.method === 'string') {
        const reqId = p.requestId
        void deps.filesDispatcher.dispatch(payload.widgetId, p.method, p.args).then((outcome) => {
          iframe.contentWindow?.postMessage({
            channel: 'daimon-widget-host',
            widgetId: payload.widgetId,
            type: 'files-result',
            payload: outcome.ok
              ? { requestId: reqId, ok: true, result: outcome.result }
              : { requestId: reqId, ok: false, error: outcome.error },
          }, '*')
        })
      }
    }

    const handleClosed = (): void => {
      targetWin.removeEventListener('message', onMessage)
      targetWin.removeEventListener('pagehide', handleClosed)
      webEntries.delete(payload.widgetId)
      if (pinnedSet.delete(payload.widgetId)) publishIds()
    }

    closeBtn.onclick = () => {
      targetWin.close()
      handleClosed()
    }
    targetWin.addEventListener('message', onMessage)
    targetWin.addEventListener('pagehide', handleClosed)
    entry.cleanup = () => {
      if (!targetWin.closed) targetWin.close()
      handleClosed()
    }

    webEntries.set(payload.widgetId, entry)
    pinnedSet.add(payload.widgetId)
    publishIds()
  }

  return {
    pinnedIds,
    async togglePin(widgetId: string, fallbackTitle: string, fallbackHtml?: string): Promise<void> {
      if (fallbackHtml) {
        fallbackCache.set(widgetId, { title: fallbackTitle, html: fallbackHtml })
      }
      if (pinnedSet.has(widgetId)) {
        if (desktopPins) {
          await desktopPins.close(widgetId)
        }
        const webEntry = webEntries.get(widgetId)
        if (webEntry) webEntry.cleanup()
        if (pinnedSet.delete(widgetId)) publishIds()
        return
      }

      if (deps.getState().widgetDetails[widgetId] === undefined) {
        await deps.ensureWidget(widgetId)
      }
      const payload = buildPayload(widgetId)
      if (!payload) return

      if (desktopPins) {
        const opened = await desktopPins.open(payload)
        if (opened.pinned) {
          pinnedSet.add(widgetId)
          publishIds()
        }
        return
      }

      await openWebPinWindow(payload)
    },
    syncAll(): void {
      for (const widgetId of pinnedSet) {
        const payload = buildPayload(widgetId)
        if (!payload) continue
        if (desktopPins) {
          void desktopPins.sync(payload)
        }
        const webEntry = webEntries.get(widgetId)
        if (webEntry && !webEntry.win.closed) {
          applyWebTheme(webEntry, payload)
          postToWebEntry(webEntry, 'sync', payload)
        }
      }
    },
    dispose(): void {
      stopDesktopSub?.()
      for (const entry of webEntries.values()) {
        entry.cleanup()
      }
      webEntries.clear()
      pinnedSet.clear()
    },
  }
}
