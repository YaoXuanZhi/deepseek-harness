/**
 * Sandboxed preload for floating Blueprint Widget Pin Windows (`dsh-app://pin/<widgetId>`).
 *
 * Exposes a narrow main-frame-only host bridge for bootstrap state, theme/slot
 * synchronization, always-on-top toggling, and upstream `DaimonWidget` actions.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopWidgetPinCallReply, DesktopWidgetPinPayload } from '@deepseek-ai/dsh-blueprint/desktop-pins'
import { DESKTOP_IPC, SCHEME } from './ipc.ts'

if (location.protocol === `${SCHEME}:` && location.hostname === 'pin' && process.isMainFrame) {
  contextBridge.exposeInMainWorld('dshWidgetPinHost', {
    bootstrap: () => ipcRenderer.invoke(DESKTOP_IPC.widgetPinBootstrap) as Promise<{
      payload: DesktopWidgetPinPayload
      alwaysOnTop: boolean
    } | null>,
    setAlwaysOnTop: (next: boolean) => ipcRenderer.invoke(DESKTOP_IPC.widgetPinSetTop, next) as Promise<boolean>,
    focusWorkspace: () => ipcRenderer.invoke(DESKTOP_IPC.widgetPinFocusMain) as Promise<void>,
    closePin: () => ipcRenderer.invoke(DESKTOP_IPC.widgetPinRequestClose) as Promise<void>,
    sendChildAction: (action: unknown) => {
      ipcRenderer.send(DESKTOP_IPC.widgetPinChildAction, action)
    },
    onState: (listener: (payload: DesktopWidgetPinPayload) => void) => {
      const handle = (_event: Electron.IpcRendererEvent, payload: DesktopWidgetPinPayload): void => {
        listener(payload)
      }
      ipcRenderer.on(DESKTOP_IPC.widgetPinStatePush, handle)
      return () => { ipcRenderer.off(DESKTOP_IPC.widgetPinStatePush, handle) }
    },
    onFilesResult: (listener: (reply: DesktopWidgetPinCallReply) => void) => {
      const handle = (_event: Electron.IpcRendererEvent, reply: DesktopWidgetPinCallReply): void => {
        listener(reply)
      }
      ipcRenderer.on(DESKTOP_IPC.widgetPinFilesResult, handle)
      return () => { ipcRenderer.off(DESKTOP_IPC.widgetPinFilesResult, handle) }
    },
  })
}
