/**
 * Host Blueprint service (`ctx.blueprint`) owning durable Widgets (`小组件`),
 * 12-column & free-layout Canvas dashboards (`看板`), Automations (`定时任务` /
 * `小组件任务`), and schema-validated Bindings.
 *
 * Exposes typed `@Remote` methods under `ctx.remote.blueprint` and serves
 * sandboxed Widget assets under `/blueprint/widgets/<id>/` when `webServer` is
 * mounted.
 *
 * @module @deepseek-ai/dsh-blueprint
 */

import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve as resolvePath } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { brandString } from '@deepseek-ai/dsh-brand'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { isJsonValue, snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import z from '@deepseek-ai/schemastery'
import { BlueprintError } from './error.ts'
import { assembleWidgetHtml } from './runtime-assets.ts'
import type {
  BlueprintAutomationId,
  BlueprintAutomationRecord,
  BlueprintAutomationRun,
  BlueprintBindingId,
  BlueprintBindingRecord,
  BlueprintCanvasId,
  BlueprintCanvasPlacement,
  BlueprintCanvasRecord,
  BlueprintCanvasViewState,
  BlueprintCatalogSnapshot,
  BlueprintFileBytes,
  BlueprintFileId,
  BlueprintFileResourceRef,
  BlueprintFileSource,
  BlueprintPlacementId,
  BlueprintRunId,
  BlueprintValidationResult,
  BlueprintWidgetDetail,
  BlueprintWidgetId,
  BlueprintWidgetRecord,
  CreateAutomationInput,
  CreateBindingInput,
  CreateCanvasInput,
  CreateWidgetInput,
  PlaceWidgetInput,
  UpdateAutomationInput,
  UpdateCanvasInput,
  UpdatePlacementInput,
  UpdateWidgetInput,
} from './types.ts'
import {
  matchesCronMinute,
  normalizeBlueprintId,
  resolveCanvasGridRect,
  validateBindingCompatibility,
  validateRelativeWorkspacePath,
  validateRuntimePayload,
  validateWidgetSource,
} from './validation.ts'

export type * from './types.ts'
export { BlueprintError, type BlueprintErrorCode } from './error.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable Blueprint asset store, validator, and automation engine. */
    blueprint: BlueprintService
  }
}

/** Configuration accepted by `BlueprintService`. */
export interface BlueprintConfig {
  /** Absolute root directory storing Blueprint state and asset workspaces. */
  root?: string
  /** Scheduler polling interval in milliseconds (`0` disables background timer ticks). */
  schedulerTickMs?: number
  /** Maximum retained run records per Automation. */
  maxRunsPerAutomation?: number
  /** Timeout in milliseconds for a single Python `code` Automation execution. */
  codeTimeoutMs?: number
  /** Python executable command used for `type: 'code'` Automations. */
  pythonCommand?: string
  /** Maximum byte size accepted for a user-picked file upload (default 250 MiB). */
  maxUploadBytes?: number
  /** Maximum byte size accepted for `DaimonWidget.files.readText` on a `FileResourceRef` (default 10 MiB). */
  maxReadTextBytes?: number
  /** Maximum byte size accepted for `DaimonWidget.files.readBytes` on a `FileResourceRef` (default 25 MiB). */
  maxReadBytes?: number
  /** Maximum byte size accepted for `DaimonWidget.files.write` (default 50 MiB). */
  maxWriteBytes?: number
  /** Lifetime in milliseconds for ephemeral resource preview/download URLs (default 15 minutes). */
  resourceUrlTtlMs?: number
}

interface ResolvedBlueprintConfig {
  readonly root: string
  readonly schedulerTickMs: number
  readonly maxRunsPerAutomation: number
  readonly codeTimeoutMs: number
  readonly pythonCommand: string
  readonly maxUploadBytes: number
  readonly maxReadTextBytes: number
  readonly maxReadBytes: number
  readonly maxWriteBytes: number
  readonly resourceUrlTtlMs: number
}

interface PersistedBlueprintState {
  version: 1
  widgets: BlueprintWidgetRecord[]
  canvases: BlueprintCanvasRecord[]
  automations: BlueprintAutomationRecord[]
  bindings: BlueprintBindingRecord[]
  runs: BlueprintAutomationRun[]
  files?: BlueprintFileResourceRef[]
}

interface EphemeralResourceToken {
  readonly fileId: BlueprintFileId
  readonly purpose: 'preview' | 'download'
  readonly expiresAt: number
}

const PREVIEW_MIME_PREFIXES = ['text/'] as const
const PREVIEW_EXACT_MIMES = new Set<string>([
  'application/json',
  'application/xml',
  'text/xml',
  'image/svg+xml',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

const PYTHON_BOOTSTRAP = `
import importlib.util, json, os, sys

entry_path = sys.argv[1]
entry_fn = sys.argv[2]
ctx_raw = sys.argv[3]
out_path = sys.argv[4]

ctx_data = json.loads(ctx_raw)
spec = importlib.util.spec_from_file_location("blueprint_task", entry_path)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load automation module at {entry_path}")
mod = importlib.util.module_from_spec(spec)
sys.modules["blueprint_task"] = mod
spec.loader.exec_module(mod)
fn = getattr(mod, entry_fn, None)
if not callable(fn):
    raise RuntimeError(f"Entry function '{entry_fn}' is not callable in {entry_path}")
result = fn(ctx_data)
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(result, fh, ensure_ascii=False)
`.trim()

/**
 * Durable four-asset Blueprint service (`Widget`, `Canvas`, `Automation`, `Binding`).
 */
export class BlueprintService extends TypertRemoteService {
  static Config: z<BlueprintConfig> = z.object({
    root: z.string().default(dshHomePath('blueprint')).description('Absolute directory storing Blueprint manifests and workspaces.'),
    schedulerTickMs: z.natural().max(3_600_000).default(15_000).description('Scheduler polling cadence in milliseconds (0 disables background ticks).'),
    maxRunsPerAutomation: z.natural().min(1).max(500).default(50).description('Maximum run records retained per Automation.'),
    codeTimeoutMs: z.natural().min(1_000).max(600_000).default(30_000).description('Execution timeout in milliseconds for code Automations.'),
    pythonCommand: z.string().default(process.platform === 'win32' ? 'python' : 'python3').description('Python interpreter command for code Automations.'),
    maxUploadBytes: z.natural().min(1_024).default(250 * 1024 * 1024).description('Maximum byte size for picked user file uploads (default 250 MiB).'),
    maxReadTextBytes: z.natural().min(1_024).default(10 * 1024 * 1024).description('Maximum byte size for FileResourceRef readText calls (default 10 MiB).'),
    maxReadBytes: z.natural().min(1_024).default(25 * 1024 * 1024).description('Maximum byte size for FileResourceRef readBytes calls (default 25 MiB).'),
    maxWriteBytes: z.natural().min(1_024).default(50 * 1024 * 1024).description('Maximum byte size for DaimonWidget.files.write calls (default 50 MiB).'),
    resourceUrlTtlMs: z.natural().min(5_000).default(15 * 60 * 1_000).description('Expiry TTL in milliseconds for temporary file preview/download URLs.'),
  })

  /** Resolved Blueprint service configuration. */
  readonly config: ResolvedBlueprintConfig
  private readonly rootDir: string
  private readonly statePath: string
  private readonly widgets = new Map<BlueprintWidgetId, BlueprintWidgetRecord>()
  private readonly canvases = new Map<BlueprintCanvasId, BlueprintCanvasRecord>()
  private readonly automations = new Map<BlueprintAutomationId, BlueprintAutomationRecord>()
  private readonly bindings = new Map<BlueprintBindingId, BlueprintBindingRecord>()
  private readonly runs = new Map<BlueprintRunId, BlueprintAutomationRun>()
  private readonly files = new Map<BlueprintFileId, BlueprintFileResourceRef>()
  private readonly resourceTokens = new Map<string, EphemeralResourceToken>()
  private readonly activeControllers = new Map<BlueprintRunId, AbortController>()
  private readonly lastCronMinute = new Map<BlueprintAutomationId, string>()
  private revision = 1
  private writeChain: Promise<void> = Promise.resolve()
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(ctx: Context, config: BlueprintConfig = {}) {
    super(ctx, 'blueprint')
    const defaultRoot = dshHomePath('blueprint')
    this.config = {
      root: config.root ?? defaultRoot,
      schedulerTickMs: config.schedulerTickMs ?? 15_000,
      maxRunsPerAutomation: config.maxRunsPerAutomation ?? 50,
      codeTimeoutMs: config.codeTimeoutMs ?? 30_000,
      pythonCommand: config.pythonCommand ?? (process.platform === 'win32' ? 'python' : 'python3'),
      maxUploadBytes: config.maxUploadBytes ?? 250 * 1024 * 1024,
      maxReadTextBytes: config.maxReadTextBytes ?? 10 * 1024 * 1024,
      maxReadBytes: config.maxReadBytes ?? 25 * 1024 * 1024,
      maxWriteBytes: config.maxWriteBytes ?? 50 * 1024 * 1024,
      resourceUrlTtlMs: config.resourceUrlTtlMs ?? 15 * 60 * 1_000,
    }
    this.rootDir = isAbsolute(this.config.root) ? this.config.root : resolvePath(this.config.root)
    this.statePath = join(this.rootDir, 'state.json')
    this.loadFromDiskSync()
  }

  protected [Service.init](): void {
    const ctx = this.ctx
    if (this.config.schedulerTickMs > 0) {
      this.timer = setInterval(() => {
        void this.tickScheduler()
      }, this.config.schedulerTickMs)
      this.timer.unref()
      ctx.effect(() => () => {
        if (this.timer !== undefined) {
          clearInterval(this.timer)
          this.timer = undefined
        }
        for (const controller of this.activeControllers.values()) {
          controller.abort()
        }
        this.activeControllers.clear()
      })
    }

    ctx.inject(['webServer'], (webCtx) => {
      const disposeRoute = webCtx.webServer.register({
        kind: 'prefix',
        path: '/blueprint/widgets',
        auth: 'required',
        handler: async (req, res) => {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const suffix = url.pathname.slice('/blueprint/widgets'.length).replace(/^\/+/, '')
          const slashIdx = suffix.indexOf('/')
          const rawId = decodeURIComponent(slashIdx === -1 ? suffix : suffix.slice(0, slashIdx))
          const relFile = slashIdx === -1 ? 'index.html' : decodeURIComponent(suffix.slice(slashIdx + 1)) || 'index.html'
          const widget = this.widgets.get(brandString<BlueprintWidgetId>(rawId))
          if (!widget) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Widget not found')
            return
          }
          try {
            const safeRel = validateRelativeWorkspacePath(relFile)
            const widgetDir = this.widgetWorkspaceDir(widget.id)
            const targetFile = resolvePath(widgetDir, safeRel)
            if (!targetFile.startsWith(widgetDir)) {
              res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('Forbidden')
              return
            }
            if (safeRel === 'index.html') {
              const rawHtml = await this.readWidgetHtml(widget.id)
              const body = assembleWidgetHtml(widget, rawHtml)
              res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'Content-Security-Policy': "sandbox allow-scripts; default-src 'self' 'unsafe-inline' data: blob:;",
              })
              res.end(body)
              return
            }
            const bytes = await readFile(targetFile)
            const contentType = MIME_BY_EXT[extname(safeRel).toLowerCase()] ?? 'application/octet-stream'
            res.writeHead(200, {
              'Content-Type': contentType,
              'Cache-Control': 'no-store',
            })
            res.end(bytes)
          } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Asset not found')
          }
        },
      })
      webCtx.effect(() => disposeRoute)

      const disposeUploadRoute = webCtx.webServer.register({
        kind: 'exact',
        path: '/blueprint/resources/upload',
        auth: 'required',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ code: 'invalid_argument', message: 'Method not allowed' }))
            return
          }
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const rawName = url.searchParams.get('name') ?? 'upload.bin'
          const rawMime = url.searchParams.get('mimeType') ?? (typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : undefined)
          const rawSource = url.searchParams.get('source')
          const source: BlueprintFileSource = rawSource === 'widget-output'
            || rawSource === 'automation-output'
            || rawSource === 'imported'
            ? rawSource
            : 'user-upload'
          const limitBytes = source === 'widget-output' ? this.config.maxWriteBytes : this.config.maxUploadBytes
          const fileId = brandString<BlueprintFileId>(normalizeBlueprintId(undefined, 'file'))
          const dir = this.resourceFileDir(fileId)
          await mkdir(dir, { recursive: true })
          const tmpPath = join(dir, `.upload-${randomBytes(6).toString('hex')}.part`)
          const finalPath = join(dir, 'payload')
          const hash = createHash('sha256')
          let sizeBytes = 0

          try {
            const exceededLimit = await new Promise<boolean>((resolveStream, rejectStream) => {
              let overLimit = false
              const out = createWriteStream(tmpPath, { mode: 0o600 })
              out.on('error', rejectStream)
              req.on('error', rejectStream)
              req.on('data', (chunk: Buffer) => {
                if (overLimit) return
                sizeBytes += chunk.byteLength
                if (sizeBytes > limitBytes) {
                  overLimit = true
                  out.destroy()
                  resolveStream(true)
                  return
                }
                hash.update(chunk)
                out.write(chunk)
              })
              req.on('end', () => {
                if (overLimit) return
                out.end(() => { resolveStream(false) })
              })
            })
            if (exceededLimit) {
              await rm(dir, { recursive: true, force: true }).catch(() => {})
              res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ code: 'file_too_large', message: `File exceeds limit of ${String(limitBytes)} bytes` }))
              return
            }
            await rename(tmpPath, finalPath)
            const safeName = basename(rawName.trim()) || 'upload.bin'
            const cleanMime = rawMime?.split(';')[0]?.trim()
            const ref: BlueprintFileResourceRef = {
              kind: 'file',
              fileId,
              name: safeName,
              ...(cleanMime ? { mimeType: cleanMime } : {}),
              sizeBytes,
              sha256: hash.digest('hex'),
              source,
              createdAt: new Date().toISOString(),
            }
            this.files.set(fileId, ref)
            await this.persistAndNotify()
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ fileRef: ref }))
          } catch (err) {
            await rm(dir, { recursive: true, force: true }).catch(() => {})
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ code: 'upload_failed', message: err instanceof Error ? err.message : String(err) }))
          }
        },
      })
      webCtx.effect(() => disposeUploadRoute)

      const disposeBlobRoute = webCtx.webServer.register({
        kind: 'prefix',
        path: '/blueprint/resources/blob',
        auth: 'anonymous',
        handler: (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Method not allowed')
            return
          }
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const rawId = decodeURIComponent(url.pathname.slice('/blueprint/resources/blob'.length).replace(/^\/+/, ''))
          const token = url.searchParams.get('token') ?? ''
          this.pruneExpiredTokens()
          const grant = this.resourceTokens.get(token)
          if (!grant || grant.fileId !== rawId || grant.expiresAt <= Date.now()) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ code: 'resource_expired', message: 'Temporary resource URL is invalid or expired' }))
            return
          }
          const ref = this.files.get(grant.fileId)
          const payloadPath = join(this.resourceFileDir(grant.fileId), 'payload')
          if (!ref || !existsSync(payloadPath)) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ code: 'file_not_found', message: 'Managed file resource not found' }))
            return
          }
          const suggested = basename((url.searchParams.get('filename') ?? ref.name).trim()) || ref.name
          const contentType = ref.mimeType ?? (MIME_BY_EXT[extname(ref.name).toLowerCase()] ?? 'application/octet-stream')
          const disposition = grant.purpose === 'download' || url.searchParams.get('download') === '1'
            ? `attachment; filename*=UTF-8''${encodeURIComponent(suggested)}`
            : 'inline'
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': String(ref.sizeBytes),
            'Content-Disposition': disposition,
            'Cache-Control': 'private, no-store',
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff',
          })
          if (req.method === 'HEAD') {
            res.end()
            return
          }
          const stream = createReadStream(payloadPath)
          stream.on('error', () => {
            if (!res.headersSent) res.writeHead(500)
            res.end()
          })
          stream.pipe(res)
        },
      })
      webCtx.effect(() => disposeBlobRoute)
    })
  }

  private loadFromDiskSync(): void {
    mkdirSync(this.rootDir, { recursive: true })
    if (!existsSync(this.statePath)) return
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as Partial<PersistedBlueprintState>
      for (const w of parsed.widgets ?? []) this.widgets.set(w.id, w)
      for (const c of parsed.canvases ?? []) this.canvases.set(c.id, c)
      for (const a of parsed.automations ?? []) this.automations.set(a.id, a)
      for (const b of parsed.bindings ?? []) this.bindings.set(b.id, b)
      for (const r of parsed.runs ?? []) this.runs.set(r.id, r)
      for (const f of parsed.files ?? []) this.files.set(f.fileId, f)
    } catch (err) {
      this.ctx.logger.warn(`blueprint: failed to parse ${this.statePath}: ${String(err)}`)
    }
  }

  private persistAndNotify(): Promise<void> {
    this.revision += 1
    const rev = this.revision
    const snapshot: PersistedBlueprintState = {
      version: 1,
      widgets: [...this.widgets.values()],
      canvases: [...this.canvases.values()],
      automations: [...this.automations.values()],
      bindings: [...this.bindings.values()],
      runs: [...this.runs.values()],
      files: [...this.files.values()],
    }
    const payload = `${JSON.stringify(snapshot, null, 2)}\n`
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        await mkdir(this.rootDir, { recursive: true })
        await writeFileAtomic(this.statePath, payload, { mode: 0o600 })
      })
    this.ctx.emit('blueprint/changed', rev)
    return this.writeChain
  }

  private widgetWorkspaceDir(id: BlueprintWidgetId): string {
    return resolvePath(this.rootDir, 'widgets', id)
  }

  private automationWorkspaceDir(id: BlueprintAutomationId): string {
    return resolvePath(this.rootDir, 'automations', id)
  }

  private resourcesRootDir(): string {
    return resolvePath(this.rootDir, 'resources')
  }

  private resourceFileDir(id: BlueprintFileId): string {
    return resolvePath(this.resourcesRootDir(), id)
  }

  private pruneExpiredTokens(): void {
    const now = Date.now()
    for (const [token, grant] of this.resourceTokens) {
      if (grant.expiresAt <= now) this.resourceTokens.delete(token)
    }
  }

  private isPreviewAllowedMime(mimeType: string | undefined, fileName: string): boolean {
    const normalized = (mimeType ?? MIME_BY_EXT[extname(fileName).toLowerCase()] ?? '')
      .split(';')[0]
      ?.trim()
      .toLowerCase() ?? ''
    if (!normalized) return false
    if (PREVIEW_EXACT_MIMES.has(normalized)) return true
    return PREVIEW_MIME_PREFIXES.some(prefix => normalized.startsWith(prefix))
  }

  private validateWorkspacePrefixedPath(rawPath: string): string {
    const trimmed = rawPath.trim().replaceAll('\\', '/')
    if (!trimmed.startsWith('workspace/')) {
      throw new RemoteError('blueprint/file-error', 'Workspace path must start with "workspace/"', { reasonCode: 'permission_denied' })
    }
    const rest = trimmed.slice('workspace/'.length)
    try {
      const safeRest = validateRelativeWorkspacePath(rest)
      return `workspace/${safeRest}`
    } catch (err) {
      throw new RemoteError('blueprint/file-error', err instanceof Error ? err.message : String(err), { reasonCode: 'permission_denied' })
    }
  }

  private async readWidgetHtml(id: BlueprintWidgetId): Promise<string> {
    const file = join(this.widgetWorkspaceDir(id), 'index.html')
    try {
      return await readFile(file, 'utf8')
    } catch {
      return ''
    }
  }

  // ── Snapshot & Catalog ────────────────────────────────────────────────────

  /**
   * Read the current four-asset Blueprint catalog snapshot.
   * @returns Detached catalog of Widgets, Canvases, Automations, and Bindings.
   */
  @Remote('catalog')
  catalog(): Promise<BlueprintCatalogSnapshot> {
    return Promise.resolve({
      revision: this.revision,
      widgets: [...this.widgets.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      canvases: [...this.canvases.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      automations: [...this.automations.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      bindings: [...this.bindings.values()],
    })
  }

  // ── Widget Operations ─────────────────────────────────────────────────────

  /**
   * Create or replace a Widget and write its `index.html` and optional companion files.
   * @param input - Widget creation payload.
   * @returns Stored Widget detail including assembled sandboxed HTML.
   */
  async createWidget(input: CreateWidgetInput): Promise<BlueprintWidgetDetail> {
    const id = brandString<BlueprintWidgetId>(normalizeBlueprintId(input.id, 'widget'))
    const title = input.title.trim()
    if (!title) throw new BlueprintError('Widget title must not be empty', 'BLUEPRINT_VALIDATION_FAILED')
    const now = new Date().toISOString()
    const existing = this.widgets.get(id)
    const record: BlueprintWidgetRecord = {
      id,
      title,
      ...(input.description === undefined ? {} : { description: input.description }),
      slots: input.slots ?? existing?.slots ?? {},
      events: input.events ?? existing?.events ?? {},
      latestData: input.latestData ?? existing?.latestData ?? {},
      savedInput: existing?.savedInput ?? {},
      status: 'idle',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const dir = this.widgetWorkspaceDir(id)
    await mkdir(dir, { recursive: true })
    await writeFileAtomic(join(dir, 'index.html'), input.html, { mode: 0o600 })
    for (const [rel, content] of Object.entries(input.files ?? {})) {
      const safeRel = validateRelativeWorkspacePath(rel)
      const dest = resolvePath(dir, safeRel)
      await mkdir(resolvePath(dest, '..'), { recursive: true })
      await writeFileAtomic(dest, content, { mode: 0o600 })
    }
    this.widgets.set(id, record)
    await this.persistAndNotify()
    return {
      ...record,
      rawHtml: input.html,
      assembledHtml: assembleWidgetHtml(record, input.html),
    }
  }

  /**
   * Update an existing Widget's manifest, HTML, files, or slot data.
   * @param input - Partial Widget update payload.
   * @returns Updated Widget detail.
   */
  async updateWidget(input: UpdateWidgetInput): Promise<BlueprintWidgetDetail> {
    const id = brandString<BlueprintWidgetId>(input.id.trim())
    const current = this.widgets.get(id)
    if (!current) throw new BlueprintError(`Widget "${input.id}" not found`, 'BLUEPRINT_NOT_FOUND')
    const dir = this.widgetWorkspaceDir(id)
    await mkdir(dir, { recursive: true })
    if (input.html !== undefined) {
      await writeFileAtomic(join(dir, 'index.html'), input.html, { mode: 0o600 })
    }
    for (const [rel, content] of Object.entries(input.files ?? {})) {
      const safeRel = validateRelativeWorkspacePath(rel)
      const dest = resolvePath(dir, safeRel)
      await mkdir(resolvePath(dest, '..'), { recursive: true })
      await writeFileAtomic(dest, content, { mode: 0o600 })
    }
    const updated: BlueprintWidgetRecord = {
      ...current,
      title: input.title !== undefined ? input.title.trim() || current.title : current.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      slots: input.slots ?? current.slots,
      events: input.events ?? current.events,
      latestData: input.latestData !== undefined
        ? { ...current.latestData, ...input.latestData }
        : current.latestData,
      status: input.status ?? current.status,
      ...(input.statusMessage !== undefined ? { statusMessage: input.statusMessage } : {}),
      updatedAt: new Date().toISOString(),
    }
    this.widgets.set(id, updated)
    await this.persistAndNotify()
    const rawHtml = input.html ?? await this.readWidgetHtml(id)
    return {
      ...updated,
      rawHtml,
      assembledHtml: assembleWidgetHtml(updated, rawHtml),
    }
  }

  /**
   * Read one Widget including its assembled sandboxed HTML.
   * @param id - Widget identifier.
   * @returns Widget detail.
   */
  @Remote('getWidget')
  async getWidget(id: string): Promise<BlueprintWidgetDetail> {
    const record = this.widgets.get(brandString<BlueprintWidgetId>(id.trim()))
    if (!record) throw new RemoteError('blueprint/not-found', `Widget "${id}" not found`, {})
    const rawHtml = await this.readWidgetHtml(record.id)
    return {
      ...record,
      rawHtml,
      assembledHtml: assembleWidgetHtml(record, rawHtml),
    }
  }

  /**
   * List all stored Widgets without loading their HTML bodies.
   * @returns Stored Widget manifests ordered by most recent update.
   */
  listWidgets(): BlueprintWidgetRecord[] {
    return [...this.widgets.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /**
   * Validate a Widget's HTML structure and metadata.
   * @param id - Widget identifier.
   * @returns Validation diagnostics.
   */
  async validateWidget(id: string): Promise<BlueprintValidationResult> {
    const record = this.widgets.get(brandString<BlueprintWidgetId>(id.trim()))
    if (!record) throw new BlueprintError(`Widget "${id}" not found`, 'BLUEPRINT_NOT_FOUND')
    const rawHtml = await this.readWidgetHtml(record.id)
    return validateWidgetSource(record, rawHtml)
  }

  /**
   * Delete a Widget, remove its placements from Canvases, and remove attached Bindings.
   * @param id - Widget identifier.
   */
  async deleteWidget(id: string): Promise<void> {
    const wid = brandString<BlueprintWidgetId>(id.trim())
    if (!this.widgets.delete(wid)) {
      throw new BlueprintError(`Widget "${id}" not found`, 'BLUEPRINT_NOT_FOUND')
    }
    for (const [cid, canvas] of this.canvases) {
      const filtered = canvas.placements.filter(p => p.widgetId !== wid)
      if (filtered.length !== canvas.placements.length) {
        this.canvases.set(cid, { ...canvas, placements: filtered, updatedAt: new Date().toISOString() })
      }
    }
    for (const [bid, binding] of this.bindings) {
      if ((binding.source.kind === 'widget' && binding.source.id === wid)
        || (binding.target.kind === 'widget' && binding.target.id === wid)) {
        this.bindings.delete(bid)
      }
    }
    await rm(this.widgetWorkspaceDir(wid), { recursive: true, force: true })
    await this.persistAndNotify()
  }

  /**
   * Read a file inside a Widget's workspace directory.
   * @param id - Widget identifier.
   * @param relativePath - Relative path inside the widget workspace.
   * @returns UTF-8 file text.
   */
  async readWidgetFile(id: string, relativePath: string): Promise<string> {
    const wid = brandString<BlueprintWidgetId>(id.trim())
    if (!this.widgets.has(wid)) throw new BlueprintError(`Widget "${id}" not found`, 'BLUEPRINT_NOT_FOUND')
    const safeRel = validateRelativeWorkspacePath(relativePath)
    return readFile(resolvePath(this.widgetWorkspaceDir(wid), safeRel), 'utf8')
  }

  /**
   * Write a file inside a Widget's workspace directory.
   * @param id - Widget identifier.
   * @param relativePath - Relative path inside the widget workspace.
   * @param content - UTF-8 file text.
   */
  async writeWidgetFile(id: string, relativePath: string, content: string): Promise<void> {
    const wid = brandString<BlueprintWidgetId>(id.trim())
    const current = this.widgets.get(wid)
    if (!current) throw new BlueprintError(`Widget "${id}" not found`, 'BLUEPRINT_NOT_FOUND')
    const safeRel = validateRelativeWorkspacePath(relativePath)
    const dest = resolvePath(this.widgetWorkspaceDir(wid), safeRel)
    await mkdir(resolvePath(dest, '..'), { recursive: true })
    await writeFileAtomic(dest, content, { mode: 0o600 })
    this.widgets.set(wid, { ...current, updatedAt: new Date().toISOString() })
    await this.persistAndNotify()
  }

  /**
   * Persist interactive form/filter input saved by `window.DaimonWidget.saveInput(...)`.
   * @param request - Widget id and JSON input object.
   * @returns Updated Widget record.
   */
  @Remote('saveWidgetInput')
  async saveWidgetInput(
    request: { readonly widgetId: string; readonly input: Readonly<Record<string, JsonValue>> },
  ): Promise<BlueprintWidgetRecord> {
    const wid = brandString<BlueprintWidgetId>(request.widgetId.trim())
    const current = this.widgets.get(wid)
    if (!current) throw new RemoteError('blueprint/not-found', `Widget "${request.widgetId}" not found`, {})
    const rawInput: unknown = request.input
    if (!isJsonValue(rawInput) || typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
      throw new RemoteError('blueprint/invalid-argument', 'Widget savedInput must be a JSON object', {})
    }
    const next: BlueprintWidgetRecord = {
      ...current,
      savedInput: { ...current.savedInput, ...rawInput },
      updatedAt: new Date().toISOString(),
    }
    this.widgets.set(wid, next)
    await this.persistAndNotify()
    return next
  }

  /**
   * Handle an outbound event emitted by `window.DaimonWidget.emit(event, data)`
   * and trigger any enabled `widget -> automation` bindings.
   * @param request - Widget id, event name, and JSON payload.
   * @returns Triggered run records.
   */
  @Remote('emitWidgetEvent')
  async emitWidgetEvent(
    request: { readonly widgetId: string; readonly event: string; readonly data: JsonValue },
  ): Promise<readonly BlueprintAutomationRun[]> {
    const wid = brandString<BlueprintWidgetId>(request.widgetId.trim())
    const widget = this.widgets.get(wid)
    if (!widget) throw new RemoteError('blueprint/not-found', `Widget "${request.widgetId}" not found`, {})
    const portKey = `event:${request.event}`
    const matching = [...this.bindings.values()].filter(
      b => b.enabled
        && b.source.kind === 'widget'
        && b.source.id === wid
        && (b.source.port === portKey || b.source.port === request.event)
        && b.target.kind === 'automation',
    )
    const runs: BlueprintAutomationRun[] = []
    for (const binding of matching) {
      const run = await this.runAutomation({
        id: binding.target.id,
        input: request.data,
        triggeredBy: 'widget_event',
      })
      runs.push(run)
    }
    return runs
  }

  // ── Managed File Resource Bridge (`DaimonWidget.files`) ───────────────────

  /**
   * Read UTF-8 text from a managed `FileResourceRef` or a Widget's `workspace/<path>`.
   * Enforces the configured 10 MiB default read cap on `FileResourceRef` reads.
   * @param request - Target `fileId` or `workspacePath` (`workspace/...`) and optional `maxBytes`.
   * @returns Decoded UTF-8 text.
   */
  @Remote('readFileText')
  async readFileText(request: {
    readonly widgetId?: string
    readonly fileId?: string
    readonly workspacePath?: string
    readonly maxBytes?: number
  }): Promise<{ readonly text: string }> {
    if (request.workspacePath !== undefined) {
      if (!request.widgetId?.trim()) {
        throw new RemoteError('blueprint/file-error', 'widgetId is required for workspace path reads', { reasonCode: 'invalid_file_ref' })
      }
      const wid = brandString<BlueprintWidgetId>(request.widgetId.trim())
      if (!this.widgets.has(wid)) {
        throw new RemoteError('blueprint/file-error', `Widget "${request.widgetId}" not found`, { reasonCode: 'file_not_found' })
      }
      const safeRel = this.validateWorkspacePrefixedPath(request.workspacePath)
      const abs = resolvePath(this.widgetWorkspaceDir(wid), safeRel)
      try {
        const text = await readFile(abs, 'utf8')
        return { text }
      } catch (_err) {
        throw new RemoteError('blueprint/file-error', `Workspace file "${safeRel}" not found`, { reasonCode: 'file_not_found' })
      }
    }

    if (!request.fileId?.trim()) {
      throw new RemoteError('blueprint/file-error', 'Expected fileId or workspacePath', { reasonCode: 'invalid_file_ref' })
    }
    const fid = brandString<BlueprintFileId>(request.fileId.trim())
    const ref = this.files.get(fid)
    const payloadPath = join(this.resourceFileDir(fid), 'payload')
    if (!ref || !existsSync(payloadPath)) {
      throw new RemoteError('blueprint/file-error', `File "${request.fileId}" not found`, { reasonCode: 'file_not_found' })
    }
    const cap = typeof request.maxBytes === 'number' && request.maxBytes > 0
      ? Math.min(request.maxBytes, this.config.maxReadTextBytes)
      : this.config.maxReadTextBytes
    const fileStat = await stat(payloadPath)
    if (fileStat.size > cap) {
      throw new RemoteError(
        'blueprint/file-error',
        `File size (${String(fileStat.size)} bytes) exceeds readText limit (${String(cap)} bytes)`,
        { reasonCode: 'file_too_large' },
      )
    }
    const text = await readFile(payloadPath, 'utf8')
    return { text }
  }

  /**
   * Read base64-encoded bytes from a managed `FileResourceRef` or a Widget's `workspace/<path>`.
   * Enforces the configured 25 MiB default read cap on `FileResourceRef` reads.
   * @param request - Target `fileId` or `workspacePath` and optional `maxBytes`.
   * @returns Base64 byte envelope.
   */
  @Remote('readFileBytes')
  async readFileBytes(request: {
    readonly widgetId?: string
    readonly fileId?: string
    readonly workspacePath?: string
    readonly maxBytes?: number
  }): Promise<BlueprintFileBytes> {
    if (request.workspacePath !== undefined) {
      if (!request.widgetId?.trim()) {
        throw new RemoteError('blueprint/file-error', 'widgetId is required for workspace path reads', { reasonCode: 'invalid_file_ref' })
      }
      const wid = brandString<BlueprintWidgetId>(request.widgetId.trim())
      if (!this.widgets.has(wid)) {
        throw new RemoteError('blueprint/file-error', `Widget "${request.widgetId}" not found`, { reasonCode: 'file_not_found' })
      }
      const safeRel = this.validateWorkspacePrefixedPath(request.workspacePath)
      const abs = resolvePath(this.widgetWorkspaceDir(wid), safeRel)
      let buf: Buffer
      try {
        buf = await readFile(abs)
      } catch (_err) {
        throw new RemoteError('blueprint/file-error', `Workspace file "${safeRel}" not found`, { reasonCode: 'file_not_found' })
      }
      if (typeof request.maxBytes === 'number' && request.maxBytes > 0 && buf.byteLength > request.maxBytes) {
        throw new RemoteError(
          'blueprint/file-error',
          `Workspace file (${String(buf.byteLength)} bytes) exceeds maxBytes (${String(request.maxBytes)})`,
          { reasonCode: 'file_too_large' },
        )
      }
      const mimeType = MIME_BY_EXT[extname(safeRel).toLowerCase()]?.split(';')[0]?.trim()
      return {
        encoding: 'base64',
        data: buf.toString('base64'),
        sizeBytes: buf.byteLength,
        ...(mimeType ? { mimeType } : {}),
      }
    }

    if (!request.fileId?.trim()) {
      throw new RemoteError('blueprint/file-error', 'Expected fileId or workspacePath', { reasonCode: 'invalid_file_ref' })
    }
    const fid = brandString<BlueprintFileId>(request.fileId.trim())
    const ref = this.files.get(fid)
    const payloadPath = join(this.resourceFileDir(fid), 'payload')
    if (!ref || !existsSync(payloadPath)) {
      throw new RemoteError('blueprint/file-error', `File "${request.fileId}" not found`, { reasonCode: 'file_not_found' })
    }
    const cap = typeof request.maxBytes === 'number' && request.maxBytes > 0
      ? Math.min(request.maxBytes, this.config.maxReadBytes)
      : this.config.maxReadBytes
    const fileStat = await stat(payloadPath)
    if (fileStat.size > cap) {
      throw new RemoteError(
        'blueprint/file-error',
        `File size (${String(fileStat.size)} bytes) exceeds readBytes limit (${String(cap)} bytes)`,
        { reasonCode: 'file_too_large' },
      )
    }
    const buf = await readFile(payloadPath)
    return {
      encoding: 'base64',
      data: buf.toString('base64'),
      sizeBytes: buf.byteLength,
      ...(ref.mimeType === undefined ? {} : { mimeType: ref.mimeType }),
    }
  }

  /**
   * Create a managed `FileResourceRef` from UTF-8 text or base64 bytes (`DaimonWidget.files.write`).
   * @param request - File name, optional MIME type, encoding (`utf8` | `base64`), and payload string.
   * @returns Stored `BlueprintFileResourceRef`.
   */
  @Remote('writeManagedFile')
  async writeManagedFile(request: {
    readonly name: string
    readonly mimeType?: string
    readonly encoding: 'utf8' | 'base64'
    readonly data: string
    readonly source?: BlueprintFileSource
  }): Promise<BlueprintFileResourceRef> {
    const safeName = basename(request.name.trim())
    if (!safeName) {
      throw new RemoteError('blueprint/file-error', 'File name must not be empty', { reasonCode: 'invalid_file_ref' })
    }
    const buf = request.encoding === 'base64'
      ? Buffer.from(request.data, 'base64')
      : Buffer.from(request.data, 'utf8')
    const source: BlueprintFileSource = request.source ?? 'widget-output'
    const limit = source === 'user-upload' ? this.config.maxUploadBytes : this.config.maxWriteBytes
    if (buf.byteLength > limit) {
      throw new RemoteError(
        'blueprint/file-error',
        `File size (${String(buf.byteLength)} bytes) exceeds write limit (${String(limit)} bytes)`,
        { reasonCode: 'file_too_large' },
      )
    }
    const fileId = brandString<BlueprintFileId>(normalizeBlueprintId(undefined, 'file'))
    const dir = this.resourceFileDir(fileId)
    await mkdir(dir, { recursive: true })
    await writeFileAtomic(join(dir, 'payload'), buf, { mode: 0o600 })
    const sha256 = createHash('sha256').update(buf).digest('hex')
    const inferredMime = request.mimeType?.trim() || MIME_BY_EXT[extname(safeName).toLowerCase()]?.split(';')[0]?.trim()
    const ref: BlueprintFileResourceRef = {
      kind: 'file',
      fileId,
      name: safeName,
      ...(inferredMime ? { mimeType: inferredMime } : {}),
      sizeBytes: buf.byteLength,
      sha256,
      source,
      createdAt: new Date().toISOString(),
    }
    this.files.set(fileId, ref)
    await this.persistAndNotify()
    return ref
  }

  /**
   * Write UTF-8 text under a Widget's `workspace/<path>` (`DaimonWidget.files.writeText`).
   * @param request - Widget id, `workspace/...` path, and UTF-8 contents.
   * @returns Written workspace path, persistent widget asset URL, and byte count.
   */
  @Remote('writeWidgetWorkspaceText')
  async writeWidgetWorkspaceText(request: {
    readonly widgetId: string
    readonly path: string
    readonly contents: string
  }): Promise<{ readonly path: string; readonly url: string; readonly bytesWritten: number }> {
    const wid = brandString<BlueprintWidgetId>(request.widgetId.trim())
    const current = this.widgets.get(wid)
    if (!current) {
      throw new RemoteError('blueprint/file-error', `Widget "${request.widgetId}" not found`, { reasonCode: 'file_not_found' })
    }
    const safeRel = this.validateWorkspacePrefixedPath(request.path)
    const dest = resolvePath(this.widgetWorkspaceDir(wid), safeRel)
    await mkdir(resolvePath(dest, '..'), { recursive: true })
    const buf = Buffer.from(request.contents, 'utf8')
    await writeFileAtomic(dest, buf, { mode: 0o600 })
    this.widgets.set(wid, { ...current, updatedAt: new Date().toISOString() })
    await this.persistAndNotify()
    const encodedSegments = safeRel.split('/').map(s => encodeURIComponent(s)).join('/')
    return {
      path: safeRel,
      url: `/blueprint/widgets/${encodeURIComponent(wid)}/${encodedSegments}`,
      bytesWritten: buf.byteLength,
    }
  }

  /**
   * Mint an expiring preview/download URL for a `FileResourceRef` or resolve a Widget `workspace/...` asset URL.
   * @param request - Target `fileId` or `workspacePath`, owning `widgetId`, and `purpose` (`preview` | `download`).
   * @returns Resolved relative HTTP URL served by `BlueprintService`.
   */
  @Remote('createFileResourceUrl')
  async createFileResourceUrl(request: {
    readonly widgetId?: string
    readonly fileId?: string
    readonly workspacePath?: string
    readonly purpose?: 'preview' | 'download'
  }): Promise<{ readonly url: string }> {
    if (request.workspacePath !== undefined) {
      if (!request.widgetId?.trim()) {
        throw new RemoteError('blueprint/file-error', 'widgetId is required for workspace path URLs', { reasonCode: 'invalid_file_ref' })
      }
      const wid = brandString<BlueprintWidgetId>(request.widgetId.trim())
      if (!this.widgets.has(wid)) {
        throw new RemoteError('blueprint/file-error', `Widget "${request.widgetId}" not found`, { reasonCode: 'file_not_found' })
      }
      const safeRel = this.validateWorkspacePrefixedPath(request.workspacePath)
      const encodedSegments = safeRel.split('/').map(s => encodeURIComponent(s)).join('/')
      return {
        url: `/blueprint/widgets/${encodeURIComponent(wid)}/${encodedSegments}`,
      }
    }

    if (!request.fileId?.trim()) {
      throw new RemoteError('blueprint/file-error', 'Expected fileId or workspacePath', { reasonCode: 'invalid_file_ref' })
    }
    const fid = brandString<BlueprintFileId>(request.fileId.trim())
    const ref = this.files.get(fid)
    const payloadPath = join(this.resourceFileDir(fid), 'payload')
    if (!ref) {
      throw new RemoteError('blueprint/file-error', `File "${request.fileId}" not found`, { reasonCode: 'file_not_found' })
    }
    try {
      await stat(payloadPath)
    } catch (_err) {
      throw new RemoteError('blueprint/file-error', `File "${request.fileId}" not found`, { reasonCode: 'file_not_found' })
    }
    const purpose = request.purpose ?? 'preview'
    if (purpose === 'preview' && !this.isPreviewAllowedMime(ref.mimeType, ref.name)) {
      throw new RemoteError(
        'blueprint/file-error',
        `MIME type "${ref.mimeType ?? 'application/octet-stream'}" is outside the preview whitelist`,
        { reasonCode: 'unsupported_mime_type' },
      )
    }
    this.pruneExpiredTokens()
    const token = randomBytes(24).toString('base64url')
    this.resourceTokens.set(token, {
      fileId: fid,
      purpose,
      expiresAt: Date.now() + this.config.resourceUrlTtlMs,
    })
    const query = new URLSearchParams({ token })
    if (purpose === 'download') query.set('download', '1')
    return {
      url: `/blueprint/resources/blob/${encodeURIComponent(fid)}?${query.toString()}`,
    }
  }

  /**
   * Read a managed `FileResourceRef` metadata entry by id (for tests and Automation runners).
   * @param fileId - Managed file identifier.
   * @returns Stored `BlueprintFileResourceRef`, or `undefined` when absent.
   */
  getFileResource(fileId: string): BlueprintFileResourceRef | undefined {
    return this.files.get(brandString<BlueprintFileId>(fileId.trim()))
  }

  // ── Canvas (`看板`) Operations ────────────────────────────────────────────

  /**
   * List all Canvas dashboards ordered by most recent update.
   * @returns Stored Canvas records.
   */
  listCanvases(): BlueprintCanvasRecord[] {
    return [...this.canvases.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /**
   * Read one Canvas dashboard by id.
   * @param id - Canvas identifier.
   * @returns Canvas record.
   */
  getCanvas(id: string): BlueprintCanvasRecord {
    const canvas = this.canvases.get(brandString<BlueprintCanvasId>(id.trim()))
    if (!canvas) throw new BlueprintError(`Canvas "${id}" not found`, 'BLUEPRINT_NOT_FOUND')
    return canvas
  }

  /**
   * Create a new Canvas (`看板`) dashboard.
   * @param input - Canvas title, optional description, and layout mode (`grid` default).
   * @returns Created Canvas record.
   */
  @Remote('createCanvas')
  async createCanvas(input: CreateCanvasInput): Promise<BlueprintCanvasRecord> {
    const title = input.title.trim()
    if (!title) throw new RemoteError('blueprint/invalid-argument', 'Canvas title must not be empty', {})
    const id = brandString<BlueprintCanvasId>(normalizeBlueprintId(input.id, 'canvas'))
    const now = new Date().toISOString()
    const record: BlueprintCanvasRecord = {
      id,
      title,
      ...(input.description === undefined ? {} : { description: input.description }),
      layoutMode: input.layoutMode ?? 'grid',
      placements: [],
      viewState: { zoom: 1, panX: 0, panY: 0 },
      createdAt: now,
      updatedAt: now,
    }
    this.canvases.set(id, record)
    await this.persistAndNotify()
    return record
  }

  /**
   * Update Canvas metadata or layout mode (`grid` | `free`).
   * @param input - Canvas update fields.
   * @returns Updated Canvas record.
   */
  @Remote('updateCanvas')
  async updateCanvas(input: UpdateCanvasInput): Promise<BlueprintCanvasRecord> {
    const cid = brandString<BlueprintCanvasId>(input.id.trim())
    const current = this.canvases.get(cid)
    if (!current) throw new RemoteError('blueprint/not-found', `Canvas "${input.id}" not found`, {})
    const next: BlueprintCanvasRecord = {
      ...current,
      title: input.title !== undefined ? input.title.trim() || current.title : current.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      layoutMode: input.layoutMode ?? current.layoutMode,
      updatedAt: new Date().toISOString(),
    }
    this.canvases.set(cid, next)
    await this.persistAndNotify()
    return next
  }

  /**
   * Place a Widget onto a Canvas dashboard (auto-packing onto the 12-column grid when `rect` is omitted).
   * @param input - Placement specification.
   * @returns Updated Canvas record.
   */
  @Remote('placeWidget')
  async placeWidget(input: PlaceWidgetInput): Promise<BlueprintCanvasRecord> {
    const cid = brandString<BlueprintCanvasId>(input.canvasId.trim())
    const wid = brandString<BlueprintWidgetId>(input.widgetId.trim())
    const canvas = this.canvases.get(cid)
    if (!canvas) throw new RemoteError('blueprint/not-found', `Canvas "${input.canvasId}" not found`, {})
    if (!this.widgets.has(wid)) throw new RemoteError('blueprint/not-found', `Widget "${input.widgetId}" not found`, {})

    // If the same widget is already placed on this canvas without an explicit duplicate request, update or add cleanly
    const existingWithoutSame = canvas.placements.filter(p => p.widgetId !== wid)
    let rect
    try {
      rect = resolveCanvasGridRect(existingWithoutSame, input.rect)
    } catch (err) {
      throw new RemoteError('blueprint/invalid-argument', err instanceof Error ? err.message : String(err), {})
    }
    const existingPlacement = canvas.placements.find(p => p.widgetId === wid)
    const placementId = existingPlacement?.id
      ?? brandString<BlueprintPlacementId>(normalizeBlueprintId(undefined, 'tile'))
    const freeRect = input.freeRect !== undefined
      ? {
        x: input.freeRect.x ?? 24 + existingWithoutSame.length * 36,
        y: input.freeRect.y ?? 24 + existingWithoutSame.length * 36,
        width: input.freeRect.width ?? 420,
        height: input.freeRect.height ?? 320,
      }
      : (existingPlacement?.freeRect ?? {
        x: rect.x * 84,
        y: rect.y * 44,
        width: Math.max(240, rect.w * 80),
        height: Math.max(180, rect.h * 36),
      })

    const placement: BlueprintCanvasPlacement = {
      id: placementId,
      widgetId: wid,
      ...(input.titleOverride === undefined ? {} : { titleOverride: input.titleOverride }),
      rect,
      freeRect,
      zIndex: existingWithoutSame.length + 1,
    }
    const next: BlueprintCanvasRecord = {
      ...canvas,
      placements: [...existingWithoutSame, placement],
      updatedAt: new Date().toISOString(),
    }
    this.canvases.set(cid, next)
    await this.persistAndNotify()
    return next
  }

  /**
   * Resize or reposition an existing Widget tile on a Canvas dashboard.
   * @param input - Placement update payload.
   * @returns Updated Canvas record.
   */
  @Remote('updatePlacement')
  async updatePlacement(input: UpdatePlacementInput): Promise<BlueprintCanvasRecord> {
    const cid = brandString<BlueprintCanvasId>(input.canvasId.trim())
    const canvas = this.canvases.get(cid)
    if (!canvas) throw new RemoteError('blueprint/not-found', `Canvas "${input.canvasId}" not found`, {})
    const target = canvas.placements.find(p => p.id === input.placementId || p.widgetId === input.placementId)
    if (!target) throw new RemoteError('blueprint/not-found', `Placement "${input.placementId}" not found`, {})
    const others = canvas.placements.filter(p => p.id !== target.id)

    let nextRect = target.rect
    if (input.rect !== undefined) {
      try {
        nextRect = resolveCanvasGridRect(others, {
          x: input.rect.x ?? target.rect.x,
          y: input.rect.y ?? target.rect.y,
          w: input.rect.w ?? target.rect.w,
          h: input.rect.h ?? target.rect.h,
        })
      } catch (err) {
        throw new RemoteError('blueprint/invalid-argument', err instanceof Error ? err.message : String(err), {})
      }
    }
    const nextFree = input.freeRect !== undefined
      ? {
        x: input.freeRect.x ?? target.freeRect?.x ?? 0,
        y: input.freeRect.y ?? target.freeRect?.y ?? 0,
        width: input.freeRect.width ?? target.freeRect?.width ?? 420,
        height: input.freeRect.height ?? target.freeRect?.height ?? 320,
      }
      : target.freeRect

    const updatedTile: BlueprintCanvasPlacement = {
      ...target,
      ...(input.titleOverride !== undefined ? { titleOverride: input.titleOverride } : {}),
      rect: nextRect,
      ...(nextFree === undefined ? {} : { freeRect: nextFree }),
    }
    const next: BlueprintCanvasRecord = {
      ...canvas,
      placements: canvas.placements.map(p => (p.id === target.id ? updatedTile : p)),
      updatedAt: new Date().toISOString(),
    }
    this.canvases.set(cid, next)
    await this.persistAndNotify()
    return next
  }

  /**
   * Remove a Widget tile from a Canvas dashboard without deleting the Widget itself.
   * @param request - Canvas id and placement/widget id.
   * @returns Updated Canvas record.
   */
  @Remote('removePlacement')
  async removePlacement(request: { readonly canvasId: string; readonly placementId: string }): Promise<BlueprintCanvasRecord> {
    const cid = brandString<BlueprintCanvasId>(request.canvasId.trim())
    const canvas = this.canvases.get(cid)
    if (!canvas) throw new RemoteError('blueprint/not-found', `Canvas "${request.canvasId}" not found`, {})
    const nextPlacements = canvas.placements.filter(
      p => p.id !== request.placementId && p.widgetId !== request.placementId,
    )
    const next: BlueprintCanvasRecord = {
      ...canvas,
      placements: nextPlacements,
      updatedAt: new Date().toISOString(),
    }
    this.canvases.set(cid, next)
    await this.persistAndNotify()
    return next
  }

  /**
   * Persist Canvas zoom and pan viewport state.
   * @param request - Canvas id and viewport values.
   * @returns Updated Canvas record.
   */
  @Remote('setCanvasViewState')
  async setCanvasViewState(
    request: { readonly canvasId: string; readonly viewState: BlueprintCanvasViewState },
  ): Promise<BlueprintCanvasRecord> {
    const cid = brandString<BlueprintCanvasId>(request.canvasId.trim())
    const canvas = this.canvases.get(cid)
    if (!canvas) throw new RemoteError('blueprint/not-found', `Canvas "${request.canvasId}" not found`, {})
    const next: BlueprintCanvasRecord = {
      ...canvas,
      viewState: {
        zoom: Math.min(2.5, Math.max(0.25, request.viewState.zoom)),
        panX: request.viewState.panX,
        panY: request.viewState.panY,
      },
      updatedAt: new Date().toISOString(),
    }
    this.canvases.set(cid, next)
    await this.persistAndNotify()
    return next
  }

  /**
   * Delete a Canvas dashboard while keeping its underlying Widgets intact.
   * @param id - Canvas identifier.
   * @returns Deletion flag indicating whether the Canvas existed.
   */
  @Remote('deleteCanvas')
  async deleteCanvas(id: string): Promise<{ readonly deleted: boolean }> {
    const cid = brandString<BlueprintCanvasId>(id.trim())
    const existed = this.canvases.delete(cid)
    if (existed) await this.persistAndNotify()
    return { deleted: existed }
  }

  // ── Binding Operations ────────────────────────────────────────────────────

  /**
   * List all Binding edges.
   * @returns Stored Binding records.
   */
  listBindings(): BlueprintBindingRecord[] {
    return [...this.bindings.values()]
  }

  /**
   * Read one Binding edge by id.
   * @param id - Binding identifier.
   * @returns Binding record.
   */
  getBinding(id: string): BlueprintBindingRecord {
    const binding = this.bindings.get(brandString<BlueprintBindingId>(id.trim()))
    if (!binding) throw new BlueprintError(`Binding "${id}" not found`, 'BLUEPRINT_NOT_FOUND')
    return binding
  }

  /**
   * Create and schema-validate a Binding edge between an Automation and a Widget.
   * @param input - Binding endpoints (`automation.result -> widget.slot:main` or `widget.event:submit -> automation.input`).
   * @returns Created Binding record and compatibility diagnostics.
   */
  async createBinding(
    input: CreateBindingInput,
  ): Promise<{ readonly binding: BlueprintBindingRecord; readonly validation: BlueprintValidationResult }> {
    const id = brandString<BlueprintBindingId>(normalizeBlueprintId(input.id, 'binding'))
    const now = new Date().toISOString()
    const record: BlueprintBindingRecord = {
      id,
      source: input.source,
      target: input.target,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    }
    const validation = this.evaluateBinding(record)
    if (!validation.valid) {
      throw new BlueprintError(
        `Binding schema validation failed: ${validation.diagnostics.join(' ')}`,
        'BLUEPRINT_VALIDATION_FAILED',
      )
    }
    this.bindings.set(id, record)
    await this.persistAndNotify()
    return { binding: record, validation }
  }

  /**
   * Validate an existing Binding edge against current Widget and Automation schemas.
   * @param id - Binding identifier.
   * @returns Compatibility diagnostics.
   */
  validateBinding(id: string): BlueprintValidationResult {
    const record = this.getBinding(id)
    return this.evaluateBinding(record)
  }

  private evaluateBinding(record: BlueprintBindingRecord): BlueprintValidationResult {
    const widgetId = record.source.kind === 'widget' ? record.source.id : record.target.id
    const automationId = record.source.kind === 'automation' ? record.source.id : record.target.id
    const widget = this.widgets.get(brandString<BlueprintWidgetId>(widgetId))
    const automation = this.automations.get(brandString<BlueprintAutomationId>(automationId))
    return validateBindingCompatibility(record, widget, automation)
  }

  /**
   * Delete a Binding edge.
   * @param id - Binding identifier.
   */
  async deleteBinding(id: string): Promise<void> {
    const bid = brandString<BlueprintBindingId>(id.trim())
    if (!this.bindings.delete(bid)) {
      throw new BlueprintError(`Binding "${id}" not found`, 'BLUEPRINT_NOT_FOUND')
    }
    await this.persistAndNotify()
  }

  // ── Automation Operations (`定时任务` & `小组件任务`) ─────────────────────

  /**
   * List all Automations ordered by most recent update.
   * @returns Stored Automation records.
   */
  listAutomations(): BlueprintAutomationRecord[] {
    return [...this.automations.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /**
   * Read one Automation by id.
   * @param id - Automation identifier.
   * @returns Automation record.
   */
  getAutomation(id: string): BlueprintAutomationRecord {
    const automation = this.automations.get(brandString<BlueprintAutomationId>(id.trim()))
    if (!automation) throw new BlueprintError(`Automation "${id}" not found`, 'BLUEPRINT_NOT_FOUND')
    return automation
  }

  /**
   * Create an Automation (**disabled by default** unless `enabled: true` is explicitly passed).
   * @param input - Automation creation payload.
   * @returns Stored Automation record.
   */
  async createAutomation(input: CreateAutomationInput): Promise<BlueprintAutomationRecord> {
    const title = input.title.trim()
    if (!title) throw new BlueprintError('Automation title must not be empty', 'BLUEPRINT_VALIDATION_FAILED')
    const id = brandString<BlueprintAutomationId>(normalizeBlueprintId(input.id, 'task'))
    const now = new Date().toISOString()
    const record: BlueprintAutomationRecord = {
      id,
      title,
      ...(input.description === undefined ? {} : { description: input.description }),
      enabled: input.enabled === true,
      trigger: input.trigger ?? { kind: 'manual' },
      execution: input.execution,
      ...(input.inputSchema === undefined ? {} : { inputSchema: input.inputSchema }),
      ...(input.resultSchema === undefined ? {} : { resultSchema: input.resultSchema }),
      createdAt: now,
      updatedAt: now,
    }
    if (record.execution.type === 'code') {
      const dir = this.automationWorkspaceDir(id)
      await mkdir(dir, { recursive: true })
      const entryFile = validateRelativeWorkspacePath(record.execution.entryFile ?? 'main.py')
      await writeFileAtomic(resolvePath(dir, entryFile), record.execution.code, { mode: 0o600 })
    }
    this.automations.set(id, record)
    await this.persistAndNotify()
    return record
  }

  /**
   * Update an existing Automation's trigger, code/prompt, or schemas.
   * @param input - Automation update fields.
   * @returns Updated Automation record.
   */
  async updateAutomation(input: UpdateAutomationInput): Promise<BlueprintAutomationRecord> {
    const aid = brandString<BlueprintAutomationId>(input.id.trim())
    const current = this.automations.get(aid)
    if (!current) throw new BlueprintError(`Automation "${input.id}" not found`, 'BLUEPRINT_NOT_FOUND')
    const execution = input.execution ?? current.execution
    if (execution.type === 'code' && input.execution !== undefined) {
      const dir = this.automationWorkspaceDir(aid)
      await mkdir(dir, { recursive: true })
      const entryFile = validateRelativeWorkspacePath(execution.entryFile ?? 'main.py')
      await writeFileAtomic(resolvePath(dir, entryFile), execution.code, { mode: 0o600 })
    }
    const next: BlueprintAutomationRecord = {
      ...current,
      title: input.title !== undefined ? input.title.trim() || current.title : current.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      enabled: input.enabled ?? current.enabled,
      trigger: input.trigger ?? current.trigger,
      execution,
      ...(input.inputSchema !== undefined ? { inputSchema: input.inputSchema } : {}),
      ...(input.resultSchema !== undefined ? { resultSchema: input.resultSchema } : {}),
      updatedAt: new Date().toISOString(),
    }
    this.automations.set(aid, next)
    await this.persistAndNotify()
    return next
  }

  /**
   * Enable or disable an Automation from the Task Card or Task Center UI.
   * @param request - Automation id and desired enabled flag.
   * @returns Updated Automation record.
   */
  @Remote('setAutomationEnabled')
  async setAutomationEnabled(request: { readonly id: string; readonly enabled: boolean }): Promise<BlueprintAutomationRecord> {
    const aid = brandString<BlueprintAutomationId>(request.id.trim())
    const current = this.automations.get(aid)
    if (!current) throw new RemoteError('blueprint/not-found', `Automation "${request.id}" not found`, {})
    const next: BlueprintAutomationRecord = {
      ...current,
      enabled: request.enabled,
      updatedAt: new Date().toISOString(),
    }
    this.automations.set(aid, next)
    await this.persistAndNotify()
    return next
  }

  /**
   * Preview which Bindings and Widgets depend on an Automation before deletion.
   * @param id - Automation identifier.
   * @returns Attached Binding ids and Widget ids.
   */
  previewDeleteAutomation(id: string): { readonly bindingIds: readonly string[]; readonly widgetIds: readonly string[] } {
    const aid = brandString<BlueprintAutomationId>(id.trim())
    if (!this.automations.has(aid)) throw new BlueprintError(`Automation "${id}" not found`, 'BLUEPRINT_NOT_FOUND')
    const attached = [...this.bindings.values()].filter(
      b => (b.source.kind === 'automation' && b.source.id === aid)
        || (b.target.kind === 'automation' && b.target.id === aid),
    )
    const widgetIds = [...new Set(attached.map(b => (b.source.kind === 'widget' ? b.source.id : b.target.id)))]
    return {
      bindingIds: attached.map(b => b.id),
      widgetIds,
    }
  }

  /**
   * Delete an Automation, its workspace directory, and attached Bindings.
   * @param id - Automation identifier.
   * @returns Deletion flag indicating whether the Automation existed.
   */
  @Remote('deleteAutomation')
  async deleteAutomation(id: string): Promise<{ readonly deleted: boolean }> {
    const aid = brandString<BlueprintAutomationId>(id.trim())
    const existed = this.automations.delete(aid)
    if (!existed) return { deleted: false }
    for (const [bid, b] of this.bindings) {
      if ((b.source.kind === 'automation' && b.source.id === aid)
        || (b.target.kind === 'automation' && b.target.id === aid)) {
        this.bindings.delete(bid)
      }
    }
    for (const [rid, r] of this.runs) {
      if (r.automationId === aid) this.runs.delete(rid)
    }
    await rm(this.automationWorkspaceDir(aid), { recursive: true, force: true })
    await this.persistAndNotify()
    return { deleted: true }
  }

  /**
   * List recent runs for one Automation (or all Automations when `automationId` is omitted).
   * @param automationId - Optional Automation id filter.
   * @returns Run records ordered newest first.
   */
  @Remote('listRuns')
  listRuns(automationId?: string): Promise<readonly BlueprintAutomationRun[]> {
    const filtered = [...this.runs.values()].filter(
      r => automationId === undefined || r.automationId === automationId.trim(),
    )
    return Promise.resolve(filtered.sort((a, b) => b.startedAt.localeCompare(a.startedAt)))
  }

  /**
   * Read one Automation run record by id.
   * @param runId - Run identifier.
   * @returns Run record.
   */
  getRun(runId: string): BlueprintAutomationRun {
    const run = this.runs.get(brandString<BlueprintRunId>(runId.trim()))
    if (!run) throw new BlueprintError(`Run "${runId}" not found`, 'BLUEPRINT_NOT_FOUND')
    return run
  }

  /**
   * Cancel an in-flight Automation run.
   * @param runId - Run identifier.
   * @returns Updated run record.
   */
  cancelRun(runId: string): BlueprintAutomationRun {
    const rid = brandString<BlueprintRunId>(runId.trim())
    const current = this.runs.get(rid)
    if (!current) throw new BlueprintError(`Run "${runId}" not found`, 'BLUEPRINT_NOT_FOUND')
    this.activeControllers.get(rid)?.abort()
    if (current.status === 'running') {
      const cancelled: BlueprintAutomationRun = {
        ...current,
        status: 'cancelled',
        finishedAt: new Date().toISOString(),
      }
      this.runs.set(rid, cancelled)
      void this.persistAndNotify()
      return cancelled
    }
    return current
  }

  /**
   * Execute an Automation immediately (`Run now` / manual trigger / scheduled tick / widget event)
   * and push its validated output artifact across all active `automation -> widget` Bindings.
   * @param request - Automation id, optional input payload, and trigger origin.
   * @returns Settled Automation run record.
   */
  @Remote('runAutomation')
  async runAutomation(request: {
    readonly id: string
    readonly input?: JsonValue
    readonly triggeredBy?: 'manual' | 'schedule' | 'widget_event'
  }): Promise<BlueprintAutomationRun> {
    const aid = brandString<BlueprintAutomationId>(request.id.trim())
    const automation = this.automations.get(aid)
    if (!automation) throw new RemoteError('blueprint/not-found', `Automation "${request.id}" not found`, {})

    if (request.input !== undefined && automation.inputSchema !== undefined) {
      const inputErrors = validateRuntimePayload(request.input, automation.inputSchema)
      if (inputErrors.length > 0) {
        throw new RemoteError('blueprint/invalid-argument', `Automation input failed schema validation: ${inputErrors.join(' ')}`, {})
      }
    }

    const runId = brandString<BlueprintRunId>(normalizeBlueprintId(undefined, 'run'))
    const startedAt = new Date().toISOString()
    const triggeredBy = request.triggeredBy ?? 'manual'
    const controller = new AbortController()
    this.activeControllers.set(runId, controller)

    const runningRecord: BlueprintAutomationRun = {
      id: runId,
      automationId: aid,
      status: 'running',
      triggeredBy,
      ...(request.input === undefined ? {} : { input: request.input }),
      logs: '',
      startedAt,
    }
    this.runs.set(runId, runningRecord)
    this.automations.set(aid, {
      ...automation,
      lastRunId: runId,
      lastRunStatus: 'running',
      lastRunAt: startedAt,
      updatedAt: startedAt,
    })

    // Mark bound target widgets as running
    const outboundBindings = [...this.bindings.values()].filter(
      b => b.enabled && b.source.kind === 'automation' && b.source.id === aid && b.target.kind === 'widget',
    )
    for (const edge of outboundBindings) {
      const wid = brandString<BlueprintWidgetId>(edge.target.id)
      const w = this.widgets.get(wid)
      if (w) this.widgets.set(wid, { ...w, status: 'running', updatedAt: startedAt })
    }
    await this.persistAndNotify()

    let finalRun: BlueprintAutomationRun
    try {
      const { artifact, logs } = await this.executeAutomationBody(automation, runId, request.input, triggeredBy, controller.signal)
      const schemaErrors = validateRuntimePayload(artifact, automation.resultSchema)
      if (schemaErrors.length > 0) {
        throw new BlueprintError(`Result failed resultSchema validation: ${schemaErrors.join(' ')}`, 'BLUEPRINT_VALIDATION_FAILED')
      }
      const finishedAt = new Date().toISOString()
      finalRun = {
        ...runningRecord,
        status: 'succeeded',
        artifact,
        logs,
        finishedAt,
      }
      this.runs.set(runId, finalRun)
      const latestAuto = this.automations.get(aid)
      if (latestAuto) {
        const autoDisableOnce = latestAuto.trigger.kind === 'once' && triggeredBy === 'schedule'
        const { lastError: _droppedError, ...autoBase } = latestAuto
        void _droppedError
        this.automations.set(aid, {
          ...autoBase,
          enabled: autoDisableOnce ? false : latestAuto.enabled,
          lastRunId: runId,
          lastRunStatus: 'succeeded',
          lastRunAt: finishedAt,
          updatedAt: finishedAt,
        })
      }
      for (const edge of outboundBindings) {
        const wid = brandString<BlueprintWidgetId>(edge.target.id)
        const w = this.widgets.get(wid)
        if (!w) continue
        const slotName = edge.target.port.startsWith('slot:')
          ? edge.target.port.slice('slot:'.length)
          : edge.target.port
        const { statusMessage: _droppedStatus, ...widgetBase } = w
        void _droppedStatus
        this.widgets.set(wid, {
          ...widgetBase,
          latestData: { ...w.latestData, [slotName]: artifact },
          status: 'idle',
          lastRunAt: finishedAt,
          updatedAt: finishedAt,
        })
      }
    } catch (err) {
      const finishedAt = new Date().toISOString()
      const message = err instanceof Error ? err.message : String(err)
      const status = controller.signal.aborted ? 'cancelled' : 'failed'
      finalRun = {
        ...runningRecord,
        status,
        logs: message,
        error: message,
        finishedAt,
      }
      this.runs.set(runId, finalRun)
      const latestAuto = this.automations.get(aid)
      if (latestAuto) {
        this.automations.set(aid, {
          ...latestAuto,
          lastRunId: runId,
          lastRunStatus: status,
          lastRunAt: finishedAt,
          lastError: message,
          updatedAt: finishedAt,
        })
      }
      for (const edge of outboundBindings) {
        const wid = brandString<BlueprintWidgetId>(edge.target.id)
        const w = this.widgets.get(wid)
        if (w) {
          this.widgets.set(wid, {
            ...w,
            status: 'error',
            statusMessage: message,
            lastRunAt: finishedAt,
            updatedAt: finishedAt,
          })
        }
      }
    } finally {
      this.activeControllers.delete(runId)
      this.pruneRuns(aid)
      await this.persistAndNotify()
    }

    return finalRun
  }

  private pruneRuns(automationId: BlueprintAutomationId): void {
    const owned = [...this.runs.values()]
      .filter(r => r.automationId === automationId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    for (const stale of owned.slice(this.config.maxRunsPerAutomation)) {
      this.runs.delete(stale.id)
    }
  }

  private async executeAutomationBody(
    automation: BlueprintAutomationRecord,
    runId: BlueprintRunId,
    input: JsonValue | undefined,
    triggeredBy: string,
    signal: AbortSignal,
  ): Promise<{ artifact: JsonValue; logs: string }> {
    const triggeredAt = new Date().toISOString()
    if (automation.execution.type === 'agent') {
      return {
        artifact: {
          prompt: automation.execution.prompt,
          input: input ?? null,
          triggeredAt,
          triggeredBy,
        },
        logs: `Agent task "${automation.title}" recorded at ${triggeredAt}`,
      }
    }

    const dir = this.automationWorkspaceDir(automation.id)
    await mkdir(dir, { recursive: true })
    const entryFile = validateRelativeWorkspacePath(automation.execution.entryFile ?? 'main.py')
    const entryAbs = resolvePath(dir, entryFile)
    if (!existsSync(entryAbs)) {
      await writeFileAtomic(entryAbs, automation.execution.code, { mode: 0o600 })
    }
    const outPath = resolvePath(dir, `.artifact-${runId}.json`)
    const entryFn = automation.execution.entryFunction ?? 'run'
    const ctxPayload = JSON.stringify({
      automationId: automation.id,
      runId,
      triggeredAt,
      triggeredBy,
      resourcesDir: this.resourcesRootDir(),
      input: input ?? null,
    })

    return new Promise<{ artifact: JsonValue; logs: string }>((resolveRun, rejectRun) => {
      let stdout = ''
      let stderr = ''
      let settled = false

      const child = spawn(
        this.config.pythonCommand,
        ['-c', PYTHON_BOOTSTRAP, entryAbs, entryFn, ctxPayload, outPath],
        {
          cwd: dir,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            DAIMON_BLUEPRINT_AUTOMATION_ID: automation.id,
            DAIMON_BLUEPRINT_RUN_ID: runId,
            DAIMON_BLUEPRINT_RESOURCES_DIR: this.resourcesRootDir(),
          },
          windowsHide: true,
        },
      )

      const timer = setTimeout(() => {
        if (!settled) {
          child.kill()
          settled = true
          rejectRun(new BlueprintError(`Automation timed out after ${String(this.config.codeTimeoutMs)}ms`, 'BLUEPRINT_AUTOMATION_FAILED'))
        }
      }, this.config.codeTimeoutMs)

      const onAbort = (): void => {
        child.kill()
      }
      signal.addEventListener('abort', onAbort, { once: true })

      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
      child.on('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        rejectRun(new BlueprintError(`Failed to spawn Python "${this.config.pythonCommand}": ${err.message}`, 'BLUEPRINT_AUTOMATION_FAILED'))
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        const combinedLogs = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n')
        void (async () => {
          if (code !== 0) {
            await rm(outPath, { force: true }).catch(() => {})
            rejectRun(new BlueprintError(combinedLogs || `Python exited with code ${String(code)}`, 'BLUEPRINT_AUTOMATION_FAILED'))
            return
          }
          try {
            const rawArtifact = await readFile(outPath, 'utf8')
            await rm(outPath, { force: true }).catch(() => {})
            const rawParsed = JSON.parse(rawArtifact) as JsonValue
            const parsed = snapshotJsonValue(rawParsed)
            if (parsed === undefined) {
              rejectRun(new BlueprintError('Automation output is not valid JSON', 'BLUEPRINT_AUTOMATION_FAILED'))
              return
            }
            resolveRun({ artifact: parsed, logs: combinedLogs })
          } catch (err) {
            rejectRun(new BlueprintError(`Failed to read automation JSON output: ${String(err)}`, 'BLUEPRINT_AUTOMATION_FAILED'))
          }
        })()
      })
    })
  }

  private async tickScheduler(): Promise<void> {
    const now = Date.now()
    const nowDate = new Date(now)
    const minuteKey = `${String(nowDate.getFullYear())}-${String(nowDate.getMonth() + 1)}-${String(nowDate.getDate())}-${String(nowDate.getHours())}:${String(nowDate.getMinutes())}`

    for (const automation of this.automations.values()) {
      if (!automation.enabled || automation.lastRunStatus === 'running') continue
      const trig = automation.trigger
      if (trig.kind === 'interval') {
        const lastMs = automation.lastRunAt !== undefined ? Date.parse(automation.lastRunAt) : 0
        if (now - lastMs >= Math.max(5_000, trig.everyMs)) {
          await this.runAutomation({ id: automation.id, triggeredBy: 'schedule' }).catch(() => {})
        }
      } else if (trig.kind === 'once') {
        const dueMs = Date.parse(trig.runAt)
        if (Number.isFinite(dueMs) && now >= dueMs && automation.lastRunAt === undefined) {
          await this.runAutomation({ id: automation.id, triggeredBy: 'schedule' }).catch(() => {})
        }
      } else if (trig.kind === 'schedule') {
        if (this.lastCronMinute.get(automation.id) === minuteKey) continue
        if (matchesCronMinute(trig.cron, nowDate)) {
          this.lastCronMinute.set(automation.id, minuteKey)
          await this.runAutomation({ id: automation.id, triggeredBy: 'schedule' }).catch(() => {})
        }
      }
    }
  }
}

export default BlueprintService
