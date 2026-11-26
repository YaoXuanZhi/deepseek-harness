/**
 * Host ACP LLM Provider & Registry service (`@deepseek-ai/dsh-llm-acp`).
 *
 * Bridges ACP Registry agents (`npx`, `uvx`, `binary`) and local subscription
 * ACP executables into `ctx.llm` as native DeepSeek Harness LLM routes, while
 * exposing `@Remote` management, Registry search/install, OAuth URL flows, and
 * interactive terminal login to the Settings UI.
 *
 * @module @deepseek-ai/dsh-llm-acp
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { brandString } from '@deepseek-ai/dsh-brand'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-subprocess'
import { AcpLlmAdapter, type ResolvedAcpProviderRuntime } from './adapter.ts'
import { detectLocalAcpAgents } from './local-discovery.ts'
import {
  deriveDefaultTerminalLoginCommand,
  launchTerminalSubscriptionLogin,
  normalizeAcpSpawnCommand,
  probeAcpAgent,
  runAcpAuthenticateFlow,
  type AcpSpawnTarget,
} from './probe-auth.ts'
import { EmbeddedPtyAuthManager } from './pty-auth.ts'
import { AcpRegistryManager, DEFAULT_ACP_REGISTRY_URL } from './registry.ts'
import type {
  AcpAdvertisedAuthMethod,
  AcpAuthFlowView,
  AcpLlmCatalog,
  AcpLlmProviderId,
  AcpLlmProviderView,
  AcpProbeOutcome,
  AcpProviderModelEntry,
  AcpProviderSourceKind,
  AcpReasoningOption,
  AcpRegistryDistributionKind,
  AcpRegistryPrepareResult,
  AcpRegistrySearchResult,
  AcpTerminalAuthSessionView,
  UpsertAcpProviderInput,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** ACP LLM provider registry, OAuth/terminal auth coordinator, and model bridge. */
    llmAcp: AcpLlmService
  }
}

/** Declarative configuration entry for one ACP provider in `cordis.patch.yml`. */
export interface DeclarativeAcpProviderConfig {
  /** Human-readable provider label displayed in Settings and model pickers. */
  readonly displayName?: string
  /** Whether this ACP provider route is registered on `ctx.llm` (default `true`). */
  readonly enabled?: boolean
  /** Provider origin kind (`registry` or `local`). */
  readonly source?: AcpProviderSourceKind
  /** Official ACP Registry agent id when `source === 'registry'`. */
  readonly registryAgentId?: string
  /** Preferred distribution mechanism when `source === 'registry'`. */
  readonly distribution?: AcpRegistryDistributionKind
  /** Executable command used to launch the ACP agent. */
  readonly command?: string
  /** Command-line arguments passed to `command`. */
  readonly args?: string[]
  /** Plaintext environment variables passed to the ACP agent process. */
  readonly env?: Record<string, string>
  /** Optional explicit model entries exposed before or alongside probing. */
  readonly models?: AcpProviderModelEntry[]
}

/** Configuration schema of `@deepseek-ai/dsh-llm-acp`. */
export interface AcpLlmConfig {
  /** Root directory storing ACP Registry packages, probe state, and isolated workspaces. */
  registryRoot?: string
  /** Official or mirror ACP Registry JSON URL. */
  registryUrl?: string
  /** Maximum duration in milliseconds when installing Registry packages. */
  installTimeoutMs?: number
  /** Maximum duration in milliseconds when probing an ACP agent via `initialize` + `session/new`. */
  probeTimeoutMs?: number
  /** Optional declaratively configured ACP providers merged with UI-managed providers. */
  providers?: Record<string, DeclarativeAcpProviderConfig>
}

interface StoredEnvEntry {
  readonly name: string
  readonly value: string
  readonly secret: boolean
}

interface PersistedAcpProviderRecord {
  readonly id: AcpLlmProviderId
  readonly displayName: string
  readonly enabled: boolean
  readonly source: AcpProviderSourceKind
  readonly registryAgentId?: string
  readonly registryVersion?: string
  readonly distribution?: AcpRegistryDistributionKind
  readonly command: string
  readonly args: readonly string[]
  readonly env: readonly StoredEnvEntry[]
  readonly models: readonly AcpProviderModelEntry[]
  readonly reasoningEfforts: readonly AcpReasoningOption[]
  readonly modelConfigOptionId?: string
  readonly reasoningConfigOptionId?: string
  readonly supportsHttpMcp?: boolean
  readonly supportsImages?: boolean
  readonly authMethods: readonly AcpAdvertisedAuthMethod[]
  readonly status: 'ready' | 'auth_required' | 'unprobed' | 'error'
  readonly statusMessage?: string
  readonly lastProbedAt?: string
}

interface PersistedAcpState {
  readonly version: 1
  readonly providers: readonly PersistedAcpProviderRecord[]
}

const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeProviderId(raw: string): AcpLlmProviderId {
  const trimmed = raw.trim()
  if (!PROVIDER_ID_PATTERN.test(trimmed)) {
    throw new RemoteError(
      'llm-acp/invalid-argument',
      `Invalid ACP Provider ID "${trimmed}": start with a lowercase ASCII letter and use only lowercase letters, digits, hyphens, or underscores`,
      {},
    )
  }
  return brandString<AcpLlmProviderId>(trimmed)
}

/**
 * Host service managing ACP Registry / local subscription ACP providers and
 * registering their routes onto `ctx.llm`.
 */
export class AcpLlmService extends TypertRemoteService {
  static inject = ['llm']

  static Config: z<AcpLlmConfig> = z.object({
    registryRoot: z.string().default(dshHomePath('acp-registry')).description('Directory storing ACP Registry packages, state, and runtime workspaces.'),
    registryUrl: z.string().default(DEFAULT_ACP_REGISTRY_URL).description('HTTPS URL of the ACP Registry JSON index.'),
    installTimeoutMs: z.natural().min(5_000).max(1_800_000).default(600_000).description('Timeout in milliseconds when downloading or installing ACP Registry distributions.'),
    probeTimeoutMs: z.natural().min(2_000).max(300_000).default(25_000).description('Timeout in milliseconds when probing an ACP agent for models and auth methods.'),
    providers: z.dict(z.object({
      displayName: z.string(),
      enabled: z.boolean().default(true),
      source: z.union(['registry', 'local'] as const).default('local'),
      registryAgentId: z.string(),
      distribution: z.union(['binary', 'npx', 'uvx'] as const),
      command: z.string(),
      args: z.array(z.string()).default([]),
      env: z.dict(z.string()).default({}),
      models: z.array(z.object({
        id: z.string().required(),
        name: z.string().required(),
        description: z.string(),
        contextWindow: z.natural(),
        maxTokens: z.natural(),
      })),
    })).default({}),
  })

  private readonly rootDir: string
  private readonly statePath: string
  private readonly secretsPath: string
  private readonly sandboxCwd: string
  private readonly registryManager: AcpRegistryManager
  private readonly probeTimeoutMs: number
  private readonly providers = new Map<AcpLlmProviderId, PersistedAcpProviderRecord>()
  private secrets: Record<string, Record<string, string>> = {}
  private readonly authFlows = new Map<string, AcpAuthFlowView>()
  private readonly ptyAuthManager: EmbeddedPtyAuthManager
  private adapterHandle: AdapterRegistrationHandle | undefined
  private revision = 1

  constructor(ctx: Context, config: AcpLlmConfig = {}) {
    super(ctx, 'llmAcp')
    const rawRoot = config.registryRoot ?? dshHomePath('acp-registry')
    this.rootDir = isAbsolute(rawRoot) ? rawRoot : resolvePath(rawRoot)
    this.statePath = join(this.rootDir, 'state.json')
    this.secretsPath = join(this.rootDir, 'secrets.json')
    this.sandboxCwd = join(this.rootDir, 'empty-workspace')
    this.probeTimeoutMs = config.probeTimeoutMs ?? 25_000
    this.registryManager = new AcpRegistryManager(
      this.rootDir,
      config.registryUrl ?? DEFAULT_ACP_REGISTRY_URL,
      config.installTimeoutMs ?? 600_000,
    )
    this.ptyAuthManager = new EmbeddedPtyAuthManager(
      () => this.ctx.get('subprocess'),
      () => {
        this.revision += 1
        this.ctx.emit('llm-acp/changed', this.revision)
      },
      async (providerId) => {
        await this.probeProvider(providerId).catch(() => {})
      },
    )
    this.loadFromDiskSync()
    this.mergeDeclarativeConfig(config.providers ?? {})
  }

  protected [TypertRemoteService.init](): void {
    const adapter = new AcpLlmAdapter(
      providerId => this.resolveProviderRuntime(providerId),
      async (attachmentId) => {
        const attachments = this.ctx.get('attachments') as {
          readBytes?: (id: string) => Promise<{ bytes: Uint8Array; mimeType: string }>
        } | undefined
        if (!attachments?.readBytes) return undefined
        const res = await attachments.readBytes(attachmentId)
        return {
          data: Buffer.from(res.bytes).toString('base64'),
          mimeType: res.mimeType,
        }
      },
    )

    const initialRoutes = this.enabledRouteIds()
    if (initialRoutes.length > 0) {
      this.adapterHandle = this.ctx.llm.registerAdapter(initialRoutes, adapter)
    }
    this.ctx.effect(() => async () => {
      this.adapterHandle?.()
      this.adapterHandle = undefined
      await this.ptyAuthManager.disposeAll()
    })

    // Re-bind adapter lazily whenever first route is added after empty startup
    this.syncAdapterRoutes = (): void => {
      const routes = this.enabledRouteIds()
      if (this.adapterHandle === undefined) {
        if (routes.length > 0) {
          this.adapterHandle = this.ctx.llm.registerAdapter(routes, adapter)
        }
      } else {
        this.adapterHandle.replace(routes)
      }
      for (const route of routes) {
        this.ctx.emit('llm/models-updated', route)
      }
    }
  }

  private syncAdapterRoutes: () => void = () => {}

  private enabledRouteIds(): string[] {
    return [...this.providers.values()]
      .filter(p => p.enabled && p.command.trim() !== '' && p.models.length > 0)
      .map(p => p.id)
  }

  private loadFromDiskSync(): void {
    mkdirSync(this.rootDir, { recursive: true })
    mkdirSync(this.sandboxCwd, { recursive: true })
    if (existsSync(this.statePath)) {
      try {
        const parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as Partial<PersistedAcpState>
        for (const item of parsed.providers ?? []) {
          this.providers.set(item.id, item)
        }
      } catch (err) {
        this.ctx.logger.warn(`llm-acp: failed to read ${this.statePath}: ${String(err)}`)
      }
    }
    if (existsSync(this.secretsPath)) {
      try {
        const rawParsed: unknown = JSON.parse(readFileSync(this.secretsPath, 'utf8'))
        const next: Record<string, Record<string, string>> = {}
        if (isRecord(rawParsed)) {
          for (const [pid, vars] of Object.entries(rawParsed)) {
            if (isRecord(vars)) {
              const cleanVars: Record<string, string> = {}
              for (const [k, v] of Object.entries(vars)) {
                if (typeof v === 'string') cleanVars[k] = v
              }
              next[pid] = cleanVars
            }
          }
        }
        this.secrets = next
      } catch (err) {
        this.ctx.logger.warn(`llm-acp: failed to read ${this.secretsPath}: ${err instanceof Error ? err.message : JSON.stringify(err)}`)
      }
    }
  }

  private mergeDeclarativeConfig(configured: Record<string, DeclarativeAcpProviderConfig>): void {
    for (const [rawId, entry] of Object.entries(configured)) {
      if (!PROVIDER_ID_PATTERN.test(rawId)) continue
      const id = brandString<AcpLlmProviderId>(rawId)
      if (this.providers.has(id)) continue
      const models = entry.models && entry.models.length > 0
        ? entry.models
        : [{ id: 'default', name: 'Default Model', inputModalities: ['text'] as const }]
      const envEntries: StoredEnvEntry[] = Object.entries(entry.env ?? {}).map(([name, value]) => ({
        name,
        value,
        secret: false,
      }))
      this.providers.set(id, {
        id,
        displayName: entry.displayName?.trim() || rawId,
        enabled: entry.enabled ?? true,
        source: entry.source ?? 'local',
        ...(entry.registryAgentId === undefined ? {} : { registryAgentId: entry.registryAgentId }),
        ...(entry.distribution === undefined ? {} : { distribution: entry.distribution }),
        command: entry.command?.trim() ?? '',
        args: entry.args ?? [],
        env: envEntries,
        models,
        reasoningEfforts: [],
        authMethods: [],
        status: entry.command?.trim() ? 'ready' : 'unprobed',
      })
    }
  }

  private async persistAndNotify(): Promise<void> {
    this.revision += 1
    const rev = this.revision
    const statePayload: PersistedAcpState = {
      version: 1,
      providers: [...this.providers.values()],
    }
    await writeFileAtomic(this.statePath, JSON.stringify(statePayload, null, 2), { mode: 0o600 })
    await writeFileAtomic(this.secretsPath, JSON.stringify(this.secrets, null, 2), { mode: 0o600 })
    this.syncAdapterRoutes()
    this.ctx.emit('llm-acp/changed', rev)
  }

  private buildSpawnEnv(record: PersistedAcpProviderRecord): Record<string, string> {
    const out: Record<string, string> = {}
    if (record.source === 'registry' && record.registryAgentId) {
      const receipt = this.registryManager.readPreparedReceipt(record.registryAgentId, record.registryVersion)
      if (receipt) {
        Object.assign(out, receipt.env)
      }
    }
    const providerSecrets = this.secrets[record.id] ?? {}
    for (const item of record.env) {
      if (item.secret) {
        const secVal = providerSecrets[item.name]
        if (secVal !== undefined && secVal !== '') {
          out[item.name] = secVal
        }
      } else if (item.value !== '') {
        out[item.name] = item.value
      }
    }
    return out
  }

  private buildSpawnTarget(record: PersistedAcpProviderRecord): AcpSpawnTarget {
    const normalized = normalizeAcpSpawnCommand(record.command, record.args)
    return {
      command: normalized.command,
      args: normalized.args,
      cwd: this.sandboxCwd,
      env: this.buildSpawnEnv(record),
    }
  }

  private resolveProviderRuntime(providerId: string): ResolvedAcpProviderRuntime | undefined {
    const record = this.providers.get(brandString<AcpLlmProviderId>(providerId))
    if (!record || !record.enabled || !record.command.trim()) return undefined
    return {
      id: record.id,
      displayName: record.displayName,
      spawnTarget: this.buildSpawnTarget(record),
      models: record.models,
      reasoningEfforts: record.reasoningEfforts,
      ...(record.modelConfigOptionId === undefined ? {} : { modelConfigOptionId: record.modelConfigOptionId }),
      ...(record.reasoningConfigOptionId === undefined ? {} : { reasoningConfigOptionId: record.reasoningConfigOptionId }),
      ...(record.supportsHttpMcp === undefined ? {} : { supportsHttpMcp: record.supportsHttpMcp }),
      ...(record.supportsImages === undefined ? {} : { supportsImages: record.supportsImages }),
    }
  }

  private toProviderView(record: PersistedAcpProviderRecord): AcpLlmProviderView {
    const providerSecrets = this.secrets[record.id] ?? {}
    return {
      id: record.id,
      displayName: record.displayName,
      enabled: record.enabled,
      source: record.source,
      ...(record.registryAgentId === undefined ? {} : { registryAgentId: record.registryAgentId }),
      ...(record.registryVersion === undefined ? {} : { registryVersion: record.registryVersion }),
      ...(record.distribution === undefined ? {} : { distribution: record.distribution }),
      command: record.command,
      args: record.args,
      env: record.env.map(item => ({
        name: item.name,
        value: item.secret ? '' : item.value,
        secret: item.secret,
        configured: item.secret ? Boolean(providerSecrets[item.name]) : item.value !== '',
      })),
      models: record.models,
      reasoningEfforts: record.reasoningEfforts,
      ...(record.modelConfigOptionId === undefined ? {} : { modelConfigOptionId: record.modelConfigOptionId }),
      ...(record.reasoningConfigOptionId === undefined ? {} : { reasoningConfigOptionId: record.reasoningConfigOptionId }),
      ...(record.supportsHttpMcp === undefined ? {} : { supportsHttpMcp: record.supportsHttpMcp }),
      ...(record.supportsImages === undefined ? {} : { supportsImages: record.supportsImages }),
      authMethods: record.authMethods,
      status: record.status,
      ...(record.statusMessage === undefined ? {} : { statusMessage: record.statusMessage }),
      ...(record.lastProbedAt === undefined ? {} : { lastProbedAt: record.lastProbedAt }),
    }
  }

  /**
   * Read the current ACP LLM provider catalog and active authentication flows.
   * @returns Redacted catalog snapshot.
   */
  @Remote('catalog')
  catalog(): Promise<AcpLlmCatalog> {
    const providers = [...this.providers.values()]
    return Promise.resolve({
      revision: this.revision,
      providers: providers.map(p => this.toProviderView(p)),
      authFlows: [...this.authFlows.values()],
      terminalSessions: this.ptyAuthManager.listViews(),
      detectedLocalAgents: detectLocalAcpAgents(providers),
    })
  }

  /**
   * Search the official ACP Registry for agents supported on the current host platform.
   * @param request - Search query substring and optional cache bypass flag.
   * @returns Matching ACP Registry agents.
   */
  @Remote('searchRegistry')
  async searchRegistry(
    request: { readonly query?: string; readonly forceRefresh?: boolean },
  ): Promise<AcpRegistrySearchResult> {
    try {
      return await this.registryManager.search(request.query ?? '', request.forceRefresh === true)
    } catch (err) {
      throw new RemoteError(
        'llm-acp/operation-failed',
        err instanceof Error ? err.message : String(err),
        {},
      )
    }
  }

  /**
   * Download and prepare an ACP Registry agent inside `$DSH_HOME/acp-registry`.
   * @param request - Target `agentId` and optional `distribution` preference.
   * @returns Preparation receipt with resolved command and arguments.
   */
  @Remote('prepareRegistryAgent')
  async prepareRegistryAgent(request: {
    readonly agentId: string
    readonly distribution?: AcpRegistryDistributionKind
  }): Promise<AcpRegistryPrepareResult> {
    try {
      const receipt = await this.registryManager.prepare(request.agentId, request.distribution)
      return {
        agentId: receipt.agentId,
        name: receipt.name,
        version: receipt.version,
        distribution: receipt.distribution,
        command: receipt.command,
        args: receipt.args,
      }
    } catch (err) {
      throw new RemoteError(
        'llm-acp/operation-failed',
        err instanceof Error ? err.message : String(err),
        {},
      )
    }
  }

  /**
   * Create or update an ACP LLM provider (from ACP Registry or a local executable command),
   * optionally auto-probing its models and auth methods.
   * @param input - Provider configuration and write-only secrets.
   * @returns Updated redacted provider view.
   */
  @Remote('upsertProvider')
  async upsertProvider(input: UpsertAcpProviderInput): Promise<AcpLlmProviderView> {
    const id = normalizeProviderId(input.id)
    const existing = this.providers.get(id)
    const displayName = input.displayName.trim() || existing?.displayName || id

    let command = input.command?.trim() ?? existing?.command ?? ''
    let args: readonly string[] = input.args ?? existing?.args ?? []
    let registryVersion = existing?.registryVersion
    let distribution = input.distribution ?? existing?.distribution

    if (input.source === 'registry') {
      const agentId = input.registryAgentId?.trim() || existing?.registryAgentId
      if (!agentId) {
        throw new RemoteError('llm-acp/invalid-argument', 'registryAgentId is required for Registry ACP providers', {})
      }
      try {
        const receipt = await this.registryManager.prepare(agentId, distribution)
        if (!input.command?.trim()) {
          command = receipt.command
          args = receipt.args
        }
        registryVersion = receipt.version
        distribution = receipt.distribution
      } catch (err) {
        throw new RemoteError('llm-acp/operation-failed', err instanceof Error ? err.message : String(err), {})
      }
    } else if (!command) {
      throw new RemoteError('llm-acp/invalid-argument', 'Executable command is required for local ACP providers', {})
    } else {
      const normalized = normalizeAcpSpawnCommand(command, args)
      command = normalized.command
      args = normalized.args
    }

    // Merge env & write-only secrets constructively (no dynamic property deletion)
    const prevSecrets: Readonly<Record<string, string>> = this.secrets[id] ?? {}
    const nextSecrets: Record<string, string> = {}
    const nextEnv: StoredEnvEntry[] = []
    if (input.env !== undefined) {
      const seen = new Set<string>()
      for (const entry of input.env) {
        const envName = entry.name.trim()
        if (!envName) continue
        if (!ENV_NAME_PATTERN.test(envName)) {
          throw new RemoteError('llm-acp/invalid-argument', `Invalid environment variable name "${envName}"`, {})
        }
        if (seen.has(envName)) continue
        seen.add(envName)
        const isSecret = entry.secret === true
        if (isSecret) {
          if (entry.keepExistingSecret) {
            const existingVal = prevSecrets[envName]
            if (existingVal !== undefined && existingVal !== '') {
              nextSecrets[envName] = existingVal
            }
          } else if (entry.value && entry.value.trim() !== '') {
            nextSecrets[envName] = entry.value.trim()
          }
          nextEnv.push({ name: envName, value: '', secret: true })
        } else {
          nextEnv.push({ name: envName, value: entry.value ?? '', secret: false })
        }
      }
    } else if (existing) {
      Object.assign(nextSecrets, prevSecrets)
      nextEnv.push(...existing.env)
    }
    this.secrets[id] = nextSecrets

    const explicitModels = input.models?.filter(m => m.id.trim() !== '')
    const record: PersistedAcpProviderRecord = {
      id,
      displayName,
      enabled: input.enabled ?? existing?.enabled ?? true,
      source: input.source,
      ...(input.registryAgentId ?? existing?.registryAgentId
        ? { registryAgentId: (input.registryAgentId ?? existing?.registryAgentId ?? '').trim() }
        : {}),
      ...(registryVersion === undefined ? {} : { registryVersion }),
      ...(distribution === undefined ? {} : { distribution }),
      command,
      args,
      env: nextEnv,
      models: explicitModels !== undefined ? explicitModels : (existing?.models ?? []),
      reasoningEfforts: existing?.reasoningEfforts ?? [],
      ...(existing?.modelConfigOptionId === undefined ? {} : { modelConfigOptionId: existing.modelConfigOptionId }),
      ...(existing?.reasoningConfigOptionId === undefined ? {} : { reasoningConfigOptionId: existing.reasoningConfigOptionId }),
      ...(existing?.supportsHttpMcp === undefined ? {} : { supportsHttpMcp: existing.supportsHttpMcp }),
      ...(existing?.supportsImages === undefined ? {} : { supportsImages: existing.supportsImages }),
      authMethods: existing?.authMethods ?? [],
      status: existing?.status ?? 'unprobed',
      ...(existing?.statusMessage === undefined ? {} : { statusMessage: existing.statusMessage }),
      ...(existing?.lastProbedAt === undefined ? {} : { lastProbedAt: existing.lastProbedAt }),
    }

    this.providers.set(id, record)
    await this.persistAndNotify()

    if (input.autoProbe !== false) {
      const probed = await this.probeProvider(id)
      return probed.provider
    }
    return this.toProviderView(record)
  }

  /**
   * Remove a configured ACP LLM provider and its stored secrets.
   * @param providerId - Provider route identifier to delete.
   * @returns Deletion flag.
   */
  @Remote('removeProvider')
  async removeProvider(providerId: string): Promise<{ readonly deleted: boolean }> {
    const id = brandString<AcpLlmProviderId>(providerId.trim())
    const existed = this.providers.delete(id)
    this.secrets = Object.fromEntries(Object.entries(this.secrets).filter(([k]) => k !== id))
    await this.ptyAuthManager.stopForProvider(id)
    if (existed) {
      await this.persistAndNotify()
    }
    return { deleted: existed }
  }

  /**
   * Probe an ACP provider via `initialize` + `session/new` to discover or refresh
   * its subscription models, reasoning efforts, and authentication methods.
   * @param providerId - Provider route identifier.
   * @returns Refreshed provider view.
   */
  @Remote('probeProvider')
  async probeProvider(providerId: string): Promise<AcpProbeOutcome> {
    const id = brandString<AcpLlmProviderId>(providerId.trim())
    const current = this.providers.get(id)
    if (!current) {
      throw new RemoteError('llm-acp/not-found', `ACP provider "${providerId}" not found`, {})
    }

    const target = this.buildSpawnTarget(current)
    const snap = await probeAcpAgent(target, this.probeTimeoutMs)
    const mergedModels = snap.models.length > 0 ? snap.models : current.models
    const { statusMessage: _oldMsg, ...rest } = current
    const shouldPersistNormalized = current.source === 'local'
      && (snap.status === 'ready' || snap.status === 'auth_required')
    const updated: PersistedAcpProviderRecord = {
      ...rest,
      ...(shouldPersistNormalized ? { command: target.command, args: target.args } : {}),
      models: mergedModels,
      reasoningEfforts: snap.reasoningEfforts.length > 0 ? snap.reasoningEfforts : current.reasoningEfforts,
      ...(snap.modelConfigOptionId === undefined ? {} : { modelConfigOptionId: snap.modelConfigOptionId }),
      ...(snap.reasoningConfigOptionId === undefined ? {} : { reasoningConfigOptionId: snap.reasoningConfigOptionId }),
      supportsHttpMcp: snap.supportsHttpMcp,
      supportsImages: snap.supportsImages,
      authMethods: snap.authMethods.length > 0 ? snap.authMethods : current.authMethods,
      status: snap.status,
      ...(snap.statusMessage === undefined ? {} : { statusMessage: snap.statusMessage }),
      lastProbedAt: new Date().toISOString(),
    }
    this.providers.set(id, updated)
    await this.persistAndNotify()
    return { provider: this.toProviderView(updated) }
  }

  /**
   * Start an interactive ACP `authenticate` OAuth/agent flow. Returns immediately once
   * either an OAuth URL is emitted (`status: 'url_required'`) or fast authentication
   * completes (`status: 'succeeded'`), and automatically probes models upon completion.
   * @param request - Target `providerId` and optional `methodId`.
   * @returns Current auth flow view.
   */
  @Remote('startAuth')
  async startAuth(request: {
    readonly providerId: string
    readonly methodId?: string
  }): Promise<AcpAuthFlowView> {
    const id = brandString<AcpLlmProviderId>(request.providerId.trim())
    const record = this.providers.get(id)
    if (!record) {
      throw new RemoteError('llm-acp/not-found', `ACP provider "${request.providerId}" not found`, {})
    }

    const flowId = `auth-${randomUUID().slice(0, 12)}`
    const initialFlow: AcpAuthFlowView = {
      flowId,
      providerId: id,
      methodId: request.methodId ?? 'default',
      status: 'pending',
      startedAt: new Date().toISOString(),
    }
    this.authFlows.set(flowId, initialFlow)
    this.revision += 1
    this.ctx.emit('llm-acp/changed', this.revision)

    let resolveEarly: ((flow: AcpAuthFlowView) => void) | undefined
    const earlyPromise = new Promise<AcpAuthFlowView>((res) => {
      resolveEarly = res
      // If neither URL nor completion arrives within 3.5s, return pending flow while background continues.
      setTimeout(() => {
        res(this.authFlows.get(flowId) ?? initialFlow)
      }, 3_500)
    })

    void runAcpAuthenticateFlow(
      this.buildSpawnTarget(record),
      request.methodId,
      (url, message) => {
        const urlFlow: AcpAuthFlowView = {
          ...initialFlow,
          status: 'url_required',
          authUrl: url,
          ...(message === undefined ? {} : { message }),
        }
        this.authFlows.set(flowId, urlFlow)
        this.revision += 1
        this.ctx.emit('llm-acp/changed', this.revision)
        resolveEarly?.(urlFlow)
      },
    ).then(
      async ({ authenticatedMethodId }) => {
        const doneFlow: AcpAuthFlowView = {
          ...initialFlow,
          methodId: authenticatedMethodId,
          status: 'succeeded',
        }
        this.authFlows.set(flowId, doneFlow)
        await this.probeProvider(id).catch(() => {})
        this.revision += 1
        this.ctx.emit('llm-acp/changed', this.revision)
        resolveEarly?.(doneFlow)
      },
      (err: unknown) => {
        const failedFlow: AcpAuthFlowView = {
          ...initialFlow,
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
        }
        this.authFlows.set(flowId, failedFlow)
        this.revision += 1
        this.ctx.emit('llm-acp/changed', this.revision)
        resolveEarly?.(failedFlow)
      },
    )

    return earlyPromise
  }

  /**
   * Open an interactive OS terminal window running the ACP agent's subscription login
   * command with the provider's configured environment variables.
   * @param request - Target `providerId` and optional `commandLine` override.
   * @returns Launched command line string.
   */
  @Remote('launchTerminalLogin')
  launchTerminalLogin(request: {
    readonly providerId: string
    readonly commandLine?: string
  }): Promise<{ readonly commandLine: string }> {
    const id = brandString<AcpLlmProviderId>(request.providerId.trim())
    const record = this.providers.get(id)
    if (!record) {
      throw new RemoteError('llm-acp/not-found', `ACP provider "${request.providerId}" not found`, {})
    }
    const target = this.buildSpawnTarget(record)
    const cmdToRun = request.commandLine?.trim()
      || deriveDefaultTerminalLoginCommand(target, record.authMethods)
    return Promise.resolve(launchTerminalSubscriptionLogin(target, cmdToRun))
  }

  /**
   * Start an embedded interactive Web PTY sign-in terminal session inside Settings.
   * Automatically probes models when the login command exits with code `0`.
   * @param request - Target `providerId`, optional `commandLine`, and initial `cols`/`rows`.
   * @returns Started PTY session view.
   */
  @Remote('startTerminalAuth')
  async startTerminalAuth(request: {
    readonly providerId: string
    readonly commandLine?: string
    readonly cols?: number
    readonly rows?: number
  }): Promise<AcpTerminalAuthSessionView> {
    const id = brandString<AcpLlmProviderId>(request.providerId.trim())
    const record = this.providers.get(id)
    if (!record) {
      throw new RemoteError('llm-acp/not-found', `ACP provider "${request.providerId}" not found`, {})
    }
    const target = this.buildSpawnTarget(record)
    const cmdToRun = request.commandLine?.trim()
      || deriveDefaultTerminalLoginCommand(target, record.authMethods)
    try {
      return await this.ptyAuthManager.startSession({
        providerId: id,
        target,
        commandLine: cmdToRun,
        ...(request.cols === undefined ? {} : { cols: request.cols }),
        ...(request.rows === undefined ? {} : { rows: request.rows }),
      })
    } catch (err) {
      throw new RemoteError(
        'llm-acp/operation-failed',
        err instanceof Error ? err.message : String(err),
        {},
      )
    }
  }

  /**
   * Send user keystrokes, pasted text, or terminal resize dimensions to a running embedded PTY session.
   * @param request - Target `sessionId`, optional `data`, and optional `cols`/`rows`.
   * @returns Acknowledgement object.
   */
  @Remote('writeTerminalAuth')
  async writeTerminalAuth(request: {
    readonly sessionId: string
    readonly data?: string
    readonly cols?: number
    readonly rows?: number
  }): Promise<{ readonly ok: boolean }> {
    try {
      await this.ptyAuthManager.writeSession(request)
      return { ok: true }
    } catch (err) {
      throw new RemoteError(
        'llm-acp/operation-failed',
        err instanceof Error ? err.message : String(err),
        {},
      )
    }
  }

  /**
   * Terminate and close an embedded PTY sign-in terminal session.
   * @param request - Target `sessionId` to close.
   * @returns Whether an active or retained session was closed.
   */
  @Remote('stopTerminalAuth')
  async stopTerminalAuth(request: { readonly sessionId: string }): Promise<{ readonly stopped: boolean }> {
    const stopped = await this.ptyAuthManager.stopSession(request.sessionId.trim())
    return { stopped }
  }
}

export default AcpLlmService
