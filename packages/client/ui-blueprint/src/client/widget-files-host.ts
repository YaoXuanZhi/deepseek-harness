/**
 * Parent-frame host dispatcher for `window.DaimonWidget.files` calls originating
 * from inline Widget iframes, Web floating Pin Windows, or Electron Desktop Pin Windows.
 *
 * Uses streaming `POST /blueprint/resources/upload` for picked and large binary
 * files (supporting up to 250 MiB without base64 JSON-RPC inflation) and typed
 * `ctx.remote.blueprint.*` calls for metadata-checked reads, workspace writes,
 * and expiring preview/download URLs.
 *
 * @module @deepseek-ai/dsh-client-ui-blueprint/client/widget-files-host
 */

import type { ClientRemote, RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import type { BlueprintFileDownloadResult, BlueprintFileResourceRef } from '@deepseek-ai/dsh-blueprint/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Structured rejection returned to `DaimonWidget.files` callers inside the Widget iframe. */
export interface WidgetFilesHostError {
  readonly code: string
  readonly message: string
}

/** Settled envelope sent back to the Widget iframe via `daimon-widget-host` `files-result`. */
export type WidgetFilesCallOutcome =
  | { readonly ok: true; readonly result: JsonValue }
  | { readonly ok: false; readonly error: WidgetFilesHostError }

interface DesktopSaveBridge {
  save?: (request: {
    url: string
    name?: string
    mediaType?: string
    mode: 'download' | 'saveAs'
  }) => Promise<{ readonly status: 'cancelled' | 'requested' | 'saved'; readonly path?: string }>
}

class WidgetFilesDispatchError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'WidgetFilesDispatchError'
    this.code = code
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractRemoteReason(error: RemoteFailure): WidgetFilesHostError {
  const reasonCode = error.code === 'blueprint/file-error'
    ? error.details.reasonCode
    : 'host_error'
  return {
    code: reasonCode,
    message: error.message,
  }
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

async function uploadBlobToResourceStore(
  blob: Blob,
  name: string,
  mimeType: string | undefined,
  source: 'user-upload' | 'widget-output',
  fallbackRemote: ClientRemote['blueprint'],
): Promise<BlueprintFileResourceRef> {
  const params = new URLSearchParams({ name, source })
  if (mimeType) params.set('mimeType', mimeType)
  if (typeof fetch === 'function' && window.location.protocol.startsWith('http')) {
    const res = await fetch(`/blueprint/resources/upload?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: blob,
      credentials: 'same-origin',
    })
    const body = await res.json() as { fileRef?: BlueprintFileResourceRef; code?: string; message?: string }
    if (!res.ok || !body.fileRef) {
      throw new WidgetFilesDispatchError(
        body.code ?? 'upload_failed',
        body.message ?? `Upload failed with status ${String(res.status)}`,
      )
    }
    return body.fileRef
  }

  // Fallback for `dsh-app://` or test environments where relative POST delegates through RPC
  const buffer = await blob.arrayBuffer()
  const outcome = await fallbackRemote.writeManagedFile({
    name,
    ...(mimeType ? { mimeType } : {}),
    encoding: 'base64',
    data: bytesToBase64(new Uint8Array(buffer)),
    source,
  })
  if (!outcome.ok) {
    const reason = extractRemoteReason(outcome.error)
    throw new WidgetFilesDispatchError(reason.code, reason.message)
  }
  return outcome.value
}

async function pickBrowserFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept.trim() !== '') input.accept = accept
    input.multiple = multiple
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.opacity = '0'
    document.body.appendChild(input)

    let settled = false
    const finish = (files: File[]): void => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
      resolve(files)
    }

    const onWindowFocus = (): void => {
      setTimeout(() => {
        if (!settled) finish(input.files ? Array.from(input.files) : [])
      }, 350)
    }

    input.addEventListener('change', () => {
      finish(input.files ? Array.from(input.files) : [])
    }, { once: true })
    input.addEventListener('cancel', () => {
      finish([])
    }, { once: true })
    window.addEventListener('focus', onWindowFocus, { once: true })
    input.click()
  })
}

/** Dispatcher executing `DaimonWidget.files` calls for a given `widgetId`. */
export interface BlueprintFilesDispatcher {
  /**
   * Execute one `DaimonWidget.files` method call and return a serializable outcome envelope.
   * @param widgetId - Owning Widget identifier.
   * @param method - Method name (`pick`, `readText`, `readBytes`, `write`, `writeText`, `url`, `download`).
   * @param rawArgs - Untrusted JSON argument payload from the Widget iframe.
   * @returns Settled `WidgetFilesCallOutcome`.
   */
  dispatch: (widgetId: string, method: string, rawArgs: unknown) => Promise<WidgetFilesCallOutcome>
}

/**
 * Create a `BlueprintFilesDispatcher` backed by `ctx.remote.blueprint` and optional Desktop native save actions.
 * @param blueprintRemote - Typed `ctx.remote.blueprint` client.
 * @returns Dispatcher instance shared across inline frames and Pin Windows.
 */
export function createBlueprintFilesDispatcher(
  blueprintRemote: ClientRemote['blueprint'],
): BlueprintFilesDispatcher {
  const resolveAbsoluteUrl = (relativeOrAbs: string): string => {
    try {
      return new URL(relativeOrAbs, window.location.origin).href
    } catch (_err) {
      return relativeOrAbs
    }
  }

  return {
    async dispatch(widgetId: string, method: string, rawArgs: unknown): Promise<WidgetFilesCallOutcome> {
      const args = isPlainRecord(rawArgs) ? rawArgs : {}
      try {
        switch (method) {
          case 'pick': {
            const accept = typeof args.accept === 'string' ? args.accept : ''
            const multiple = args.multiple === true
            const picked = await pickBrowserFiles(accept, multiple)
            if (picked.length === 0) return { ok: true, result: [] }
            const refs: BlueprintFileResourceRef[] = []
            for (const file of picked) {
              const ref = await uploadBlobToResourceStore(
                file,
                file.name || 'picked.bin',
                file.type || undefined,
                'user-upload',
                blueprintRemote,
              )
              refs.push(ref)
            }
            return { ok: true, result: toJsonValue(refs) }
          }

          case 'readText': {
            const outcome = await blueprintRemote.readFileText({
              widgetId,
              ...(typeof args.fileId === 'string' ? { fileId: args.fileId } : {}),
              ...(typeof args.workspacePath === 'string' ? { workspacePath: args.workspacePath } : {}),
              ...(typeof args.maxBytes === 'number' ? { maxBytes: args.maxBytes } : {}),
            })
            if (!outcome.ok) return { ok: false, error: extractRemoteReason(outcome.error) }
            return { ok: true, result: outcome.value.text }
          }

          case 'readBytes': {
            const outcome = await blueprintRemote.readFileBytes({
              widgetId,
              ...(typeof args.fileId === 'string' ? { fileId: args.fileId } : {}),
              ...(typeof args.workspacePath === 'string' ? { workspacePath: args.workspacePath } : {}),
              ...(typeof args.maxBytes === 'number' ? { maxBytes: args.maxBytes } : {}),
            })
            if (!outcome.ok) return { ok: false, error: extractRemoteReason(outcome.error) }
            return { ok: true, result: toJsonValue(outcome.value) }
          }

          case 'write': {
            const name = typeof args.name === 'string' ? args.name.trim() : ''
            const mimeType = typeof args.mimeType === 'string' && args.mimeType.trim() !== ''
              ? args.mimeType.trim()
              : undefined
            const encoding = args.encoding === 'base64' ? 'base64' : 'utf8'
            const data = typeof args.data === 'string' ? args.data : ''
            if (!name) {
              return { ok: false, error: { code: 'invalid_argument', message: 'files.write requires a non-empty name' } }
            }
            // Stream large binary payloads (> 512 KiB) over HTTP POST when running in a standard HTTP page
            if (encoding === 'base64' && data.length > 512 * 1024 && window.location.protocol.startsWith('http')) {
              const bytes = base64ToBytes(data)
              const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType ?? 'application/octet-stream' })
              const ref = await uploadBlobToResourceStore(blob, name, mimeType, 'widget-output', blueprintRemote)
              return { ok: true, result: toJsonValue(ref) }
            }
            const outcome = await blueprintRemote.writeManagedFile({
              name,
              ...(mimeType ? { mimeType } : {}),
              encoding,
              data,
              source: 'widget-output',
            })
            if (!outcome.ok) return { ok: false, error: extractRemoteReason(outcome.error) }
            return { ok: true, result: toJsonValue(outcome.value) }
          }

          case 'writeText': {
            const path = typeof args.path === 'string' ? args.path : ''
            const contents = typeof args.contents === 'string' ? args.contents : ''
            const outcome = await blueprintRemote.writeWidgetWorkspaceText({
              widgetId,
              path,
              contents,
            })
            if (!outcome.ok) return { ok: false, error: extractRemoteReason(outcome.error) }
            return {
              ok: true,
              result: {
                path: outcome.value.path,
                url: resolveAbsoluteUrl(outcome.value.url),
                bytesWritten: outcome.value.bytesWritten,
              },
            }
          }

          case 'url': {
            const targetParams = {
              widgetId,
              ...(typeof args.fileId === 'string' ? { fileId: args.fileId } : {}),
              ...(typeof args.workspacePath === 'string' ? { workspacePath: args.workspacePath } : {}),
            }
            const outcome = await blueprintRemote.createFileResourceUrl({
              ...targetParams,
              purpose: 'preview',
            })
            if (!outcome.ok) return { ok: false, error: extractRemoteReason(outcome.error) }
            const bytesOutcome = await blueprintRemote.readFileBytes(targetParams)
            if (!bytesOutcome.ok) return { ok: false, error: extractRemoteReason(bytesOutcome.error) }
            const mime = bytesOutcome.value.mimeType ?? 'application/octet-stream'
            return { ok: true, result: `data:${mime};base64,${bytesOutcome.value.data}` }
          }

          case 'download': {
            const rawRef = args.fileRef
            if (!isPlainRecord(rawRef) || rawRef.kind !== 'file' || typeof rawRef.fileId !== 'string' || typeof rawRef.name !== 'string') {
              return { ok: false, error: { code: 'invalid_file_ref', message: 'Invalid FileResourceRef' } }
            }
            const suggested = typeof args.suggestedFilename === 'string' && args.suggestedFilename.trim() !== ''
              ? args.suggestedFilename.trim()
              : rawRef.name
            const urlOutcome = await blueprintRemote.createFileResourceUrl({
              fileId: rawRef.fileId,
              purpose: 'download',
            })
            if (!urlOutcome.ok) return { ok: false, error: extractRemoteReason(urlOutcome.error) }

            let targetHref: string
            let revokeLater: (() => void) | undefined
            if (window.location.protocol.startsWith('http')) {
              const downloadUrl = new URL(urlOutcome.value.url, window.location.origin)
              downloadUrl.searchParams.set('filename', suggested)
              targetHref = downloadUrl.href
            } else {
              const bytesOutcome = await blueprintRemote.readFileBytes({ fileId: rawRef.fileId })
              if (!bytesOutcome.ok) return { ok: false, error: extractRemoteReason(bytesOutcome.error) }
              const bytes = base64ToBytes(bytesOutcome.value.data)
              const blob = new Blob(
                [bytes.buffer as ArrayBuffer],
                { type: bytesOutcome.value.mimeType ?? 'application/octet-stream' },
              )
              const objectUrl = URL.createObjectURL(blob)
              targetHref = objectUrl
              revokeLater = () => { setTimeout(() => { URL.revokeObjectURL(objectUrl) }, 60_000) }
            }

            const desktopSave = (window as Window & { dshDesktop?: { fileActions?: DesktopSaveBridge } }).dshDesktop?.fileActions?.save
            if (typeof desktopSave === 'function') {
              const saved = await desktopSave({
                url: targetHref,
                name: suggested,
                ...(typeof rawRef.mimeType === 'string' ? { mediaType: rawRef.mimeType } : {}),
                mode: 'saveAs',
              })
              revokeLater?.()
              if (saved.status === 'cancelled') {
                const cancelled: BlueprintFileDownloadResult = { cancelled: true, reasonCode: 'download_cancelled' }
                return { ok: true, result: toJsonValue(cancelled) }
              }
              return { ok: true, result: toJsonValue({ cancelled: false, fileRef: rawRef }) }
            }

            const anchor = document.createElement('a')
            anchor.href = targetHref
            anchor.download = suggested
            anchor.style.display = 'none'
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            revokeLater?.()
            return { ok: true, result: toJsonValue({ cancelled: false, fileRef: rawRef }) }
          }

          default:
            return { ok: false, error: { code: 'unsupported_method', message: `Unknown DaimonWidget.files method "${method}"` } }
        }
      } catch (err) {
        if (err instanceof WidgetFilesDispatchError) {
          return { ok: false, error: { code: err.code, message: err.message } }
        }
        return {
          ok: false,
          error: {
            code: 'host_error',
            message: err instanceof Error ? err.message : String(err),
          },
        }
      }
    },
  }
}
