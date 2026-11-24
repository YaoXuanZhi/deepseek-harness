/**
 * Native Electron floating always-on-top Widget Pin Windows (`dsh-app://pin/<widgetId>`).
 *
 * Each pinned Widget opens in an isolated frameless `BrowserWindow` with a 32px
 * Kimi Perspective draggable header bar (`-webkit-app-region: drag`), an
 * always-on-top toggle (`floating` window level), a workspace focus button, and
 * a sandboxed `<iframe sandbox="allow-scripts">` synchronized with the owning
 * `dsh-app://app` renderer.
 */

import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type {
  DesktopWidgetPinCallReply,
  DesktopWidgetPinEvent,
  DesktopWidgetPinPayload,
} from '@deepseek-ai/dsh-blueprint/desktop-pins'
import { DESKTOP_IPC, SCHEME } from './ipc.ts'

type PinSavedInput = DesktopWidgetPinPayload['savedInput']
type PinEmitData = Extract<DesktopWidgetPinEvent, { readonly kind: 'emit' }>['data']

interface PinnedWindowEntry {
  readonly widgetId: string
  readonly window: BrowserWindow
  payload: DesktopWidgetPinPayload
  alwaysOnTop: boolean
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWidgetStatus(value: unknown): value is DesktopWidgetPinPayload['status'] {
  return value === 'idle'
    || value === 'running'
    || value === 'needs_input'
    || value === 'degraded'
    || value === 'error'
}

function validatePinPayload(raw: unknown): DesktopWidgetPinPayload {
  if (!isPlainRecord(raw)
    || typeof raw.widgetId !== 'string' || raw.widgetId.trim() === ''
    || typeof raw.title !== 'string'
    || typeof raw.assembledHtml !== 'string'
    || (raw.theme !== 'light' && raw.theme !== 'dark')
    || typeof raw.locale !== 'string'
    || !isPlainRecord(raw.slots)
    || !isPlainRecord(raw.savedInput)
    || !isWidgetStatus(raw.status)
    || !isPlainRecord(raw.labels)
    || typeof raw.labels.alwaysOnTopOn !== 'string'
    || typeof raw.labels.alwaysOnTopOff !== 'string'
    || typeof raw.labels.focusWorkspace !== 'string'
    || typeof raw.labels.close !== 'string') {
    throw new Error('desktop widget pin: invalid payload')
  }
  return {
    widgetId: raw.widgetId,
    title: raw.title,
    assembledHtml: raw.assembledHtml,
    theme: raw.theme,
    locale: raw.locale,
    slots: raw.slots as DesktopWidgetPinPayload['slots'],
    savedInput: raw.savedInput as PinSavedInput,
    status: raw.status,
    ...(typeof raw.statusMessage === 'string' ? { statusMessage: raw.statusMessage } : {}),
    ...(typeof raw.width === 'number' ? { width: raw.width } : {}),
    ...(typeof raw.height === 'number' ? { height: raw.height } : {}),
    labels: {
      alwaysOnTopOn: raw.labels.alwaysOnTopOn,
      alwaysOnTopOff: raw.labels.alwaysOnTopOff,
      focusWorkspace: raw.labels.focusWorkspace,
      close: raw.labels.close,
    },
  }
}

const PIN_SHELL_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src 'self' data: blob:;">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
    background: #FFFFFF;
    color: #181817;
  }
  html[data-theme="dark"], html[data-theme="dark"] body {
    background: #1F1F1F;
    color: #E8E8E6;
  }
  .bar {
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 12px;
    background: #FBFAF9;
    border-bottom: 0.5px solid rgba(0, 0, 0, 0.09);
    -webkit-app-region: drag;
    user-select: none;
  }
  html[data-theme="dark"] .bar {
    background: #181817;
    border-bottom-color: rgba(255, 255, 255, 0.10);
  }
  .title {
    font-size: 12px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 8px;
  }
  .controls {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    -webkit-app-region: no-drag;
  }
  .btn {
    height: 22px;
    min-width: 22px;
    padding: 0 6px;
    border-radius: 6px;
    border: 0.5px solid transparent;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .btn:hover { background: rgba(128, 128, 128, 0.14); }
  .btn[aria-pressed="true"] {
    background: #181817;
    color: #FFFFFF;
  }
  html[data-theme="dark"] .btn[aria-pressed="true"] {
    background: #E8E8E6;
    color: #181817;
  }
  iframe {
    border: none;
    width: 100%;
    height: calc(100vh - 32px);
    display: block;
    background: transparent;
  }
</style>
</head>
<body>
  <div class="bar">
    <span id="title" class="title"></span>
    <div class="controls">
      <button id="pinBtn" type="button" class="btn" aria-pressed="true">📌</button>
      <button id="focusBtn" type="button" class="btn">↗</button>
      <button id="closeBtn" type="button" class="btn">×</button>
    </div>
  </div>
  <iframe id="widgetFrame" sandbox="allow-scripts"></iframe>
  <script>
    (function () {
      var bridge = window.dshWidgetPinHost;
      if (!bridge) return;
      var currentPayload = null;
      var topPinned = true;
      var titleEl = document.getElementById('title');
      var pinBtn = document.getElementById('pinBtn');
      var focusBtn = document.getElementById('focusBtn');
      var closeBtn = document.getElementById('closeBtn');
      var frame = document.getElementById('widgetFrame');
      var loadedHtml = '';

      function renderChrome() {
        if (!currentPayload) return;
        document.documentElement.setAttribute('data-theme', currentPayload.theme);
        document.title = currentPayload.title;
        titleEl.textContent = currentPayload.title;
        pinBtn.setAttribute('aria-pressed', topPinned ? 'true' : 'false');
        var topLabel = topPinned ? currentPayload.labels.alwaysOnTopOff : currentPayload.labels.alwaysOnTopOn;
        pinBtn.title = topLabel;
        pinBtn.setAttribute('aria-label', topLabel);
        focusBtn.title = currentPayload.labels.focusWorkspace;
        focusBtn.setAttribute('aria-label', currentPayload.labels.focusWorkspace);
        closeBtn.title = currentPayload.labels.close;
        closeBtn.setAttribute('aria-label', currentPayload.labels.close);
        if (currentPayload.assembledHtml !== loadedHtml) {
          loadedHtml = currentPayload.assembledHtml;
          frame.srcdoc = loadedHtml;
        } else if (frame.contentWindow) {
          frame.contentWindow.postMessage({
            channel: 'daimon-widget-host',
            widgetId: currentPayload.widgetId,
            type: 'sync',
            payload: {
              theme: currentPayload.theme,
              locale: currentPayload.locale,
              slots: currentPayload.slots,
              savedInput: currentPayload.savedInput,
              status: currentPayload.status,
              statusMessage: currentPayload.statusMessage || null
            }
          }, '*');
        }
      }

      window.addEventListener('message', function (ev) {
        if (!currentPayload || ev.source !== frame.contentWindow) return;
        var msg = ev.data;
        if (!msg || msg.channel !== 'daimon-widget') return;
        var p = msg.payload || {};
        if (msg.type === 'ready' && frame.contentWindow) {
          frame.contentWindow.postMessage({
            channel: 'daimon-widget-host',
            widgetId: currentPayload.widgetId,
            type: 'init',
            payload: {
              theme: currentPayload.theme,
              locale: currentPayload.locale,
              slots: currentPayload.slots,
              savedInput: currentPayload.savedInput,
              status: currentPayload.status,
              statusMessage: currentPayload.statusMessage || null
            }
          }, '*');
        } else if (msg.type === 'saveInput' || msg.type === 'emit' || msg.type === 'openCanvas' || msg.type === 'files-call') {
          bridge.sendChildAction({ type: msg.type, payload: p });
        }
      });

      pinBtn.addEventListener('click', function () {
        bridge.setAlwaysOnTop(!topPinned).then(function (next) {
          topPinned = Boolean(next);
          renderChrome();
        });
      });
      focusBtn.addEventListener('click', function () { bridge.focusWorkspace(); });
      closeBtn.addEventListener('click', function () { bridge.closePin(); });

      bridge.onState(function (nextPayload) {
        currentPayload = nextPayload;
        renderChrome();
      });
      bridge.onFilesResult(function (reply) {
        if (!frame.contentWindow || !currentPayload) return;
        frame.contentWindow.postMessage({
          channel: 'daimon-widget-host',
          widgetId: currentPayload.widgetId,
          type: 'files-result',
          payload: reply
        }, '*');
      });
      bridge.bootstrap().then(function (init) {
        if (!init) return;
        currentPayload = init.payload;
        topPinned = Boolean(init.alwaysOnTop);
        renderChrome();
      });
    })();
  </script>
</body>
</html>
`

/**
 * Controller managing floating always-on-top Widget Pin Windows in Electron Desktop.
 */
export class DesktopWidgetPinManager {
  private readonly entries = new Map<string, PinnedWindowEntry>()
  private readonly preloadPath = fileURLToPath(new URL('./preload-widget-pin.cjs', import.meta.url))
  private disposed = false

  constructor(
    private readonly assertMainOwner: (event: IpcMainInvokeEvent) => BrowserWindow,
    private readonly getMainWindow: () => BrowserWindow | undefined,
    private readonly focusWorkspace: () => void,
  ) {}

  /**
   * Serve the static sandboxed shell HTML for `dsh-app://pin/<widgetId>`.
   * @param request - Protocol request under `dsh-app://pin/`.
   * @returns HTML shell response.
   */
  serveDocument(request: Request): Response {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405 })
    }
    return new Response(request.method === 'HEAD' ? null : PIN_SHELL_HTML, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  /**
   * Register IPC handlers bridging the primary workspace window and floating Pin Windows.
   */
  installIpc(): void {
    ipcMain.handle(DESKTOP_IPC.widgetPinOpen, async (event, rawPayload: unknown) => {
      this.assertMainOwner(event)
      if (this.disposed) return { pinned: false, alwaysOnTop: false }
      const payload = validatePinPayload(rawPayload)
      const existing = this.entries.get(payload.widgetId)
      if (existing && !existing.window.isDestroyed()) {
        existing.payload = payload
        existing.window.webContents.send(DESKTOP_IPC.widgetPinStatePush, payload)
        existing.window.show()
        existing.window.focus()
        return { pinned: true, alwaysOnTop: existing.alwaysOnTop }
      }

      const width = Math.min(960, Math.max(280, Math.round(payload.width ?? 460)))
      const height = Math.min(860, Math.max(200, Math.round(payload.height ?? 420)))
      const win = new BrowserWindow({
        width,
        height,
        minWidth: 260,
        minHeight: 180,
        frame: false,
        show: false,
        alwaysOnTop: true,
        resizable: true,
        minimizable: true,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: false,
        title: payload.title,
        backgroundColor: payload.theme === 'dark' ? '#181817' : '#FBFAF9',
        webPreferences: {
          preload: this.preloadPath,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      })
      win.setAlwaysOnTop(true, 'floating')
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.webContents.on('will-navigate', (navEv) => { navEv.preventDefault() })

      const entry: PinnedWindowEntry = {
        widgetId: payload.widgetId,
        window: win,
        payload,
        alwaysOnTop: true,
      }
      this.entries.set(payload.widgetId, entry)

      win.once('closed', () => {
        if (this.entries.get(payload.widgetId) === entry) {
          this.entries.delete(payload.widgetId)
        }
        this.sendToMain({ kind: 'closed', widgetId: payload.widgetId })
      })

      const pinUrl = `${SCHEME}://pin/${encodeURIComponent(payload.widgetId)}`
      try {
        await win.loadURL(pinUrl)
      } catch (err) {
        this.entries.delete(payload.widgetId)
        if (!win.isDestroyed()) win.destroy()
        throw err
      }

      if (!win.isDestroyed()) {
        win.show()
      }
      return { pinned: true, alwaysOnTop: true }
    })

    ipcMain.handle(DESKTOP_IPC.widgetPinSync, (event, rawPayload: unknown): boolean => {
      this.assertMainOwner(event)
      const payload = validatePinPayload(rawPayload)
      const entry = this.entries.get(payload.widgetId)
      if (!entry || entry.window.isDestroyed()) return false
      entry.payload = payload
      entry.window.setTitle(payload.title)
      entry.window.webContents.send(DESKTOP_IPC.widgetPinStatePush, payload)
      return true
    })

    ipcMain.handle(DESKTOP_IPC.widgetPinClose, (event, widgetId: unknown): boolean => {
      this.assertMainOwner(event)
      if (typeof widgetId !== 'string') return false
      const entry = this.entries.get(widgetId)
      if (!entry) return false
      this.entries.delete(widgetId)
      if (!entry.window.isDestroyed()) entry.window.close()
      return true
    })

    ipcMain.handle(DESKTOP_IPC.widgetPinList, (event): readonly string[] => {
      this.assertMainOwner(event)
      return [...this.entries.keys()]
    })

    ipcMain.handle(DESKTOP_IPC.widgetPinFilesReply, (event, rawReply: unknown): void => {
      this.assertMainOwner(event)
      if (!isPlainRecord(rawReply) || typeof rawReply.widgetId !== 'string' || typeof rawReply.requestId !== 'string') {
        return
      }
      const entry = this.entries.get(rawReply.widgetId)
      if (!entry || entry.window.isDestroyed()) return
      const errObj = isPlainRecord(rawReply.error) ? rawReply.error : undefined
      const reply: DesktopWidgetPinCallReply = {
        widgetId: rawReply.widgetId,
        requestId: rawReply.requestId,
        ok: rawReply.ok === true,
        ...(rawReply.result !== undefined ? { result: rawReply.result as PinEmitData } : {}),
        ...(errObj && typeof errObj.code === 'string' && typeof errObj.message === 'string'
          ? { error: { code: errObj.code, message: errObj.message } }
          : {}),
      }
      entry.window.webContents.send(DESKTOP_IPC.widgetPinFilesResult, reply)
    })

    ipcMain.handle(DESKTOP_IPC.widgetPinBootstrap, (event) => {
      const entry = this.findSenderPinEntry(event)
      if (!entry) return null
      return { payload: entry.payload, alwaysOnTop: entry.alwaysOnTop }
    })

    ipcMain.handle(DESKTOP_IPC.widgetPinSetTop, (event, next: unknown): boolean => {
      const entry = this.findSenderPinEntry(event)
      if (!entry || entry.window.isDestroyed()) return false
      const desired = Boolean(next)
      entry.alwaysOnTop = desired
      if (desired) entry.window.setAlwaysOnTop(true, 'floating')
      else entry.window.setAlwaysOnTop(false)
      return entry.alwaysOnTop
    })

    ipcMain.handle(DESKTOP_IPC.widgetPinFocusMain, (event): void => {
      if (!this.findSenderPinEntry(event)) return
      this.focusWorkspace()
    })

    ipcMain.handle(DESKTOP_IPC.widgetPinRequestClose, (event): void => {
      const entry = this.findSenderPinEntry(event)
      if (!entry) return
      this.entries.delete(entry.widgetId)
      if (!entry.window.isDestroyed()) entry.window.close()
    })

    ipcMain.on(DESKTOP_IPC.widgetPinChildAction, (event: IpcMainEvent, rawAction: unknown) => {
      const entry = this.findSenderPinEntry(event)
      if (!entry || !isPlainRecord(rawAction) || typeof rawAction.type !== 'string') return
      const p = isPlainRecord(rawAction.payload) ? rawAction.payload : {}
      if (rawAction.type === 'saveInput' && isPlainRecord(p.input)) {
        this.sendToMain({
          kind: 'save-input',
          widgetId: entry.widgetId,
          input: p.input as PinSavedInput,
        })
      } else if (rawAction.type === 'emit') {
        this.sendToMain({
          kind: 'emit',
          widgetId: entry.widgetId,
          event: typeof p.event === 'string' ? p.event : 'submit',
          data: (p.data ?? null) as PinEmitData,
        })
      } else if (rawAction.type === 'openCanvas') {
        this.focusWorkspace()
        this.sendToMain({
          kind: 'open-canvas',
          widgetId: entry.widgetId,
          canvasId: typeof p.canvasId === 'string' ? p.canvasId : null,
        })
      } else if (rawAction.type === 'files-call' && typeof p.requestId === 'string' && typeof p.method === 'string') {
        this.sendToMain({
          kind: 'files-call',
          widgetId: entry.widgetId,
          requestId: p.requestId,
          method: p.method,
          args: (p.args ?? {}) as PinEmitData,
        })
      }
    })
  }

  /**
   * Destroy all open Widget Pin Windows during application quit or update restart.
   */
  dispose(): void {
    this.disposed = true
    for (const entry of this.entries.values()) {
      if (!entry.window.isDestroyed()) {
        entry.window.destroy()
      }
    }
    this.entries.clear()
  }

  private findSenderPinEntry(event: IpcMainInvokeEvent | IpcMainEvent): PinnedWindowEntry | undefined {
    const frame = event.senderFrame
    if (!frame || !frame.url.startsWith(`${SCHEME}://pin/`)) return undefined
    for (const entry of this.entries.values()) {
      if (!entry.window.isDestroyed()
        && event.sender === entry.window.webContents
        && frame === entry.window.webContents.mainFrame) {
        return entry
      }
    }
    return undefined
  }

  private sendToMain(ev: DesktopWidgetPinEvent): void {
    const main = this.getMainWindow()
    if (main !== undefined && !main.isDestroyed()) {
      main.webContents.send(DESKTOP_IPC.widgetPinUpstream, ev)
    }
  }
}
