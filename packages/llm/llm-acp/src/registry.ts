/**
 * Official ACP Registry (`cdn.agentclientprotocol.com`) catalog search, caching,
 * and hermetic sandbox preparation (`binary`, `npx`, `uvx`) under `$DSH_HOME/acp-registry`.
 *
 * @module @deepseek-ai/dsh-llm-acp/registry
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type {
  AcpRegistryAgentSummary,
  AcpRegistryDistributionKind,
  AcpRegistryPrepareResult,
  AcpRegistrySearchResult,
} from './types.ts'

/** Default official ACP Registry index URL. */
export const DEFAULT_ACP_REGISTRY_URL = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json'

const CACHE_TTL_MS = 5 * 60 * 1_000

interface RawRegistryBinaryTarget {
  readonly archive: string
  readonly cmd: string
  readonly sha256?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

interface RawRegistryPkgDist {
  readonly package: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

interface RawRegistryAgent {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly authors?: readonly string[]
  readonly license?: string
  readonly website?: string
  readonly repository?: string
  readonly icon?: string
  readonly distribution: {
    readonly binary?: Readonly<Record<string, RawRegistryBinaryTarget>>
    readonly npx?: RawRegistryPkgDist
    readonly uvx?: RawRegistryPkgDist
  }
}

interface RawRegistryIndex {
  readonly version: string
  readonly agents: readonly RawRegistryAgent[]
}

/** Stored receipt written after preparing a Registry agent under `$DSH_HOME/acp-registry`. */
export interface PreparedRegistryReceipt {
  readonly agentId: string
  readonly name: string
  readonly version: string
  readonly distribution: AcpRegistryDistributionKind
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly preparedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolvePlatformTargetCandidates(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): readonly string[] {
  const os = platform === 'win32'
    ? 'windows'
    : platform === 'darwin'
      ? 'darwin'
      : platform === 'linux'
        ? 'linux'
        : undefined
  const cpu = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : undefined
  if (!os || !cpu) return []
  const primary = `${os}-${cpu}`
  if (primary === 'windows-aarch64') return ['windows-aarch64', 'windows-x86_64']
  if (primary === 'darwin-aarch64') return ['darwin-aarch64', 'darwin-x86_64']
  return [primary]
}

function findBinaryTarget(
  binaryMap: Readonly<Record<string, RawRegistryBinaryTarget>> | undefined,
): RawRegistryBinaryTarget | undefined {
  if (!binaryMap) return undefined
  for (const target of resolvePlatformTargetCandidates()) {
    const hit = binaryMap[target]
    if (hit !== undefined && typeof hit.archive === 'string' && typeof hit.cmd === 'string') {
      return hit
    }
  }
  return undefined
}

function availableDistributionsFor(agent: RawRegistryAgent): readonly AcpRegistryDistributionKind[] {
  const list: AcpRegistryDistributionKind[] = []
  if (agent.distribution.npx?.package) list.push('npx')
  if (findBinaryTarget(agent.distribution.binary) !== undefined) list.push('binary')
  if (agent.distribution.uvx?.package) list.push('uvx')
  return list
}

function parseRegistryIndex(raw: unknown): RawRegistryIndex {
  if (!isRecord(raw) || !Array.isArray(raw.agents)) {
    throw new Error('Invalid ACP Registry JSON response')
  }
  const version = typeof raw.version === 'string' ? raw.version : '1.0.0'
  const agents: RawRegistryAgent[] = []
  for (const entry of raw.agents) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') continue
    if (!isRecord(entry.distribution)) continue
    const dist = entry.distribution
    const npx = isRecord(dist.npx) && typeof dist.npx.package === 'string'
      ? {
        package: dist.npx.package,
        ...(Array.isArray(dist.npx.args) ? { args: dist.npx.args.filter((x): x is string => typeof x === 'string') } : {}),
        ...(isRecord(dist.npx.env) ? { env: Object.fromEntries(Object.entries(dist.npx.env).filter((kv): kv is [string, string] => typeof kv[1] === 'string')) } : {}),
      }
      : undefined
    const uvx = isRecord(dist.uvx) && typeof dist.uvx.package === 'string'
      ? {
        package: dist.uvx.package,
        ...(Array.isArray(dist.uvx.args) ? { args: dist.uvx.args.filter((x): x is string => typeof x === 'string') } : {}),
        ...(isRecord(dist.uvx.env) ? { env: Object.fromEntries(Object.entries(dist.uvx.env).filter((kv): kv is [string, string] => typeof kv[1] === 'string')) } : {}),
      }
      : undefined
    let binary: Record<string, RawRegistryBinaryTarget> | undefined
    if (isRecord(dist.binary)) {
      binary = {}
      for (const [k, v] of Object.entries(dist.binary)) {
        if (isRecord(v) && typeof v.archive === 'string' && typeof v.cmd === 'string') {
          binary[k] = {
            archive: v.archive,
            cmd: v.cmd,
            ...(typeof v.sha256 === 'string' ? { sha256: v.sha256 } : {}),
            ...(Array.isArray(v.args) ? { args: v.args.filter((x): x is string => typeof x === 'string') } : {}),
            ...(isRecord(v.env) ? { env: Object.fromEntries(Object.entries(v.env).filter((kv): kv is [string, string] => typeof kv[1] === 'string')) } : {}),
          }
        }
      }
    }
    agents.push({
      id: entry.id.trim(),
      name: entry.name.trim(),
      version: typeof entry.version === 'string' ? entry.version.trim() : '0.0.0',
      description: typeof entry.description === 'string' ? entry.description.trim() : '',
      ...(Array.isArray(entry.authors) ? { authors: entry.authors.filter((x): x is string => typeof x === 'string') } : {}),
      ...(typeof entry.license === 'string' ? { license: entry.license } : {}),
      ...(typeof entry.website === 'string' ? { website: entry.website } : {}),
      ...(typeof entry.repository === 'string' ? { repository: entry.repository } : {}),
      ...(typeof entry.icon === 'string' ? { icon: entry.icon } : {}),
      distribution: {
        ...(binary ? { binary } : {}),
        ...(npx ? { npx } : {}),
        ...(uvx ? { uvx } : {}),
      },
    })
  }
  return { version, agents }
}

function runCommandCollect(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv; readonly timeoutMs: number },
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolveCmd, rejectCmd) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
    })
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill()
        rejectCmd(new Error(`Command "${command}" timed out after ${String(options.timeoutMs)}ms`))
      }
    }, options.timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectCmd(err)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        const tail = (stderr.trim() || stdout.trim()).slice(-800)
        rejectCmd(new Error(`Command "${command}" exited with code ${String(code)}${tail ? `: ${tail}` : ''}`))
        return
      }
      resolveCmd({ stdout, stderr })
    })
  })
}

function findExtractedFile(dir: string, targetCmd: string): string | undefined {
  const normalizedTarget = targetCmd.replaceAll('\\', '/').replace(/^\.\//, '')
  const direct = resolvePath(dir, normalizedTarget)
  if (existsSync(direct)) return direct
  const baseName = normalizedTarget.split('/').pop() ?? normalizedTarget
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isFile() && (entry.name === baseName || entry.name === `${baseName}.exe` || entry.name === `${baseName}.cmd`)) {
      return full
    }
    if (entry.isDirectory()) {
      const nested = resolvePath(full, normalizedTarget)
      if (existsSync(nested)) return nested
      const nestedBase = join(full, baseName)
      if (existsSync(nestedBase)) return nestedBase
    }
  }
  return undefined
}

/**
 * Sandboxed ACP Registry manager storing cached index and prepared agent distributions
 * inside `$DSH_HOME/acp-registry`.
 */
export class AcpRegistryManager {
  private cachedIndex: { readonly fetchedAt: number; readonly data: RawRegistryIndex } | undefined

  constructor(
    private readonly registryRoot: string,
    private readonly registryUrl: string,
    private readonly installTimeoutMs: number,
  ) {
    mkdirSync(this.registryRoot, { recursive: true })
  }

  private receiptPath(agentId: string, version: string): string {
    const safeId = agentId.replace(/[^a-zA-Z0-9._-]/g, '_')
    const safeVer = version.replace(/[^a-zA-Z0-9._+-]/g, '_')
    return join(this.registryRoot, 'packages', safeId, safeVer, 'receipt.json')
  }

  /**
   * Read an existing prepared receipt if present on disk.
   * @param agentId - ACP Registry agent id.
   * @param version - Optional exact version; when omitted, checks the latest prepared version.
   * @returns Prepared receipt or `undefined`.
   */
  readPreparedReceipt(agentId: string, version?: string): PreparedRegistryReceipt | undefined {
    const safeId = agentId.replace(/[^a-zA-Z0-9._-]/g, '_')
    const agentDir = join(this.registryRoot, 'packages', safeId)
    if (!existsSync(agentDir)) return undefined
    const versions = version !== undefined
      ? [version]
      : readdirSync(agentDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort()
        .reverse()
    for (const ver of versions) {
      const p = this.receiptPath(agentId, ver)
      if (!existsSync(p)) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(readFileSync(p, 'utf8'))
      } catch (_readErr) {
        // Corrupted receipt is ignored so re-preparation can overwrite it.
        continue
      }
      if (
        isRecord(parsed)
        && typeof parsed.agentId === 'string'
        && typeof parsed.name === 'string'
        && typeof parsed.version === 'string'
        && (parsed.distribution === 'binary' || parsed.distribution === 'npx' || parsed.distribution === 'uvx')
        && typeof parsed.command === 'string'
        && Array.isArray(parsed.args)
        && parsed.args.every((item): item is string => typeof item === 'string')
        && isRecord(parsed.env)
        && typeof parsed.preparedAt === 'string'
      ) {
        const env: Record<string, string> = {}
        for (const [k, v] of Object.entries(parsed.env)) {
          if (typeof v === 'string') env[k] = v
        }
        return {
          agentId: parsed.agentId,
          name: parsed.name,
          version: parsed.version,
          distribution: parsed.distribution,
          command: parsed.command,
          args: parsed.args,
          env,
          preparedAt: parsed.preparedAt,
        }
      }
    }
    return undefined
  }

  private async fetchIndex(forceRefresh = false): Promise<RawRegistryIndex> {
    if (!forceRefresh && this.cachedIndex && Date.now() - this.cachedIndex.fetchedAt < CACHE_TTL_MS) {
      return this.cachedIndex.data
    }
    const cacheFile = join(this.registryRoot, 'registry-cache.json')
    try {
      const response = await fetch(this.registryUrl, {
        signal: AbortSignal.timeout(25_000),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${String(response.status)} from ${this.registryUrl}`)
      }
      const rawJson: unknown = await response.json()
      const parsed = parseRegistryIndex(rawJson)
      this.cachedIndex = { fetchedAt: Date.now(), data: parsed }
      await writeFileAtomic(cacheFile, JSON.stringify(rawJson), { mode: 0o600 }).catch(() => {})
      return parsed
    } catch (fetchErr) {
      if (existsSync(cacheFile)) {
        const cachedRaw: unknown = JSON.parse(await readFile(cacheFile, 'utf8'))
        const parsed = parseRegistryIndex(cachedRaw)
        this.cachedIndex = { fetchedAt: Date.now(), data: parsed }
        return parsed
      }
      throw fetchErr
    }
  }

  /**
   * Search the official ACP Registry for agents supported on the current host OS/architecture.
   * @param query - Optional case-insensitive search substring.
   * @param forceRefresh - Bypass the 5-minute index cache when `true`.
   * @returns Matching ACP Registry agent summaries.
   */
  async search(query = '', forceRefresh = false): Promise<AcpRegistrySearchResult> {
    const index = await this.fetchIndex(forceRefresh)
    const needle = query.trim().toLowerCase()
    const summaries: AcpRegistryAgentSummary[] = []
    for (const agent of index.agents) {
      const dists = availableDistributionsFor(agent)
      const primaryDist = dists[0]
      if (primaryDist === undefined) continue
      if (needle !== '') {
        const hay = `${agent.id} ${agent.name} ${agent.description} ${(agent.authors ?? []).join(' ')}`.toLowerCase()
        if (!hay.includes(needle)) continue
      }
      const prepared = this.readPreparedReceipt(agent.id, agent.version) !== undefined
      summaries.push({
        id: agent.id,
        name: agent.name,
        version: agent.version,
        description: agent.description,
        authors: agent.authors ?? [],
        ...(agent.license === undefined ? {} : { license: agent.license }),
        ...(agent.website === undefined ? {} : { website: agent.website }),
        ...(agent.repository === undefined ? {} : { repository: agent.repository }),
        ...(agent.icon === undefined ? {} : { icon: agent.icon }),
        distribution: primaryDist,
        availableDistributions: dists,
        prepared,
      })
    }
    return {
      registryVersion: index.version,
      agents: summaries,
    }
  }

  /**
   * Download and prepare an ACP Registry agent inside `$DSH_HOME/acp-registry/packages/<id>/<version>`.
   * @param agentId - ACP Registry agent id.
   * @param preferredDistribution - Optional preferred distribution (`npx` | `binary` | `uvx`).
   * @returns Preparation receipt with resolved command and arguments.
   */
  async prepare(
    agentId: string,
    preferredDistribution?: AcpRegistryDistributionKind,
  ): Promise<PreparedRegistryReceipt & AcpRegistryPrepareResult> {
    const index = await this.fetchIndex(false)
    const agent = index.agents.find(a => a.id === agentId.trim())
    if (!agent) {
      throw new Error(`ACP Registry agent "${agentId}" was not found`)
    }
    const available = availableDistributionsFor(agent)
    const dist = preferredDistribution && available.includes(preferredDistribution)
      ? preferredDistribution
      : available[0]
    if (!dist) {
      throw new Error(`ACP Registry agent "${agent.id}" has no supported distribution for ${process.platform}/${process.arch}`)
    }

    const existing = this.readPreparedReceipt(agent.id, agent.version)
    if (existing && existing.distribution === dist && (dist === 'uvx' || existsSync(existing.command))) {
      return existing
    }

    const safeId = agent.id.replace(/[^a-zA-Z0-9._-]/g, '_')
    const safeVer = agent.version.replace(/[^a-zA-Z0-9._+-]/g, '_')
    const pkgDir = join(this.registryRoot, 'packages', safeId, safeVer)
    await rm(pkgDir, { recursive: true, force: true }).catch(() => {})
    await mkdir(pkgDir, { recursive: true })

    let command = ''
    let args: string[] = []
    let env: Record<string, string> = {}

    if (dist === 'npx' && agent.distribution.npx) {
      const npxSpec = agent.distribution.npx
      await writeFile(join(pkgDir, 'package.json'), '{"private":true}\n', 'utf8')
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      const cacheDir = join(this.registryRoot, 'npm-cache')
      await mkdir(cacheDir, { recursive: true })
      await runCommandCollect(
        npmCmd,
        ['install', '--no-audit', '--no-fund', '--cache', cacheDir, npxSpec.package],
        { cwd: pkgDir, timeoutMs: this.installTimeoutMs },
      )
      // Resolve installed package's bin script so we invoke it directly with current process.execPath (Node.js)
      const pkgNameMatch = /^(@[^/@]+\/[^@]+|[^@]+)/.exec(npxSpec.package)
      const pkgName = pkgNameMatch?.[1] ?? npxSpec.package
      const installedPkgJsonPath = join(pkgDir, 'node_modules', ...pkgName.split('/'), 'package.json')
      const manifestRaw: unknown = JSON.parse(await readFile(installedPkgJsonPath, 'utf8'))
      let relBin = ''
      if (isRecord(manifestRaw)) {
        if (typeof manifestRaw.bin === 'string') {
          relBin = manifestRaw.bin
        } else if (isRecord(manifestRaw.bin)) {
          const entries = Object.values(manifestRaw.bin).filter((v): v is string => typeof v === 'string')
          relBin = entries[0] ?? ''
        }
      }
      if (!relBin) {
        throw new Error(`Installed npm package "${pkgName}" did not declare an executable bin entry`)
      }
      const binScriptAbs = resolvePath(join(pkgDir, 'node_modules', ...pkgName.split('/')), relBin)
      command = process.execPath
      args = [binScriptAbs, ...(npxSpec.args ?? [])]
      env = { ...(npxSpec.env ?? {}) }
    } else if (dist === 'binary') {
      const target = findBinaryTarget(agent.distribution.binary)
      if (!target) {
        throw new Error(`No binary archive available for "${agent.id}" on ${process.platform}/${process.arch}`)
      }
      const res = await fetch(target.archive, { signal: AbortSignal.timeout(this.installTimeoutMs) })
      if (!res.ok) {
        throw new Error(`Failed to download binary archive (${String(res.status)}) from ${target.archive}`)
      }
      const bytes = Buffer.from(await res.arrayBuffer())
      if (target.sha256) {
        const digest = createHash('sha256').update(bytes).digest('hex')
        if (digest.toLowerCase() !== target.sha256.toLowerCase()) {
          throw new Error(`SHA-256 mismatch for ${agent.id}: expected ${target.sha256}, received ${digest}`)
        }
      }
      const lowerUrl = new URL(target.archive).pathname.toLowerCase()
      const extractDir = join(pkgDir, 'bin')
      await mkdir(extractDir, { recursive: true })
      if (lowerUrl.endsWith('.zip')) {
        const archivePath = join(pkgDir, 'archive.zip')
        await writeFile(archivePath, bytes)
        if (process.platform === 'win32') {
          await runCommandCollect(
            'powershell.exe',
            ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${extractDir.replaceAll("'", "''")}' -Force`],
            { cwd: pkgDir, timeoutMs: this.installTimeoutMs },
          )
        } else {
          await runCommandCollect('unzip', ['-oq', archivePath, '-d', extractDir], { cwd: pkgDir, timeoutMs: this.installTimeoutMs })
        }
        await rm(archivePath, { force: true }).catch(() => {})
      } else if (lowerUrl.endsWith('.tar.gz') || lowerUrl.endsWith('.tgz') || lowerUrl.endsWith('.tar.xz')) {
        const archivePath = join(pkgDir, lowerUrl.endsWith('.tar.xz') ? 'archive.tar.xz' : 'archive.tar.gz')
        await writeFile(archivePath, bytes)
        await runCommandCollect('tar', ['-xf', archivePath, '-C', extractDir], { cwd: pkgDir, timeoutMs: this.installTimeoutMs })
        await rm(archivePath, { force: true }).catch(() => {})
      } else {
        const directPath = join(extractDir, process.platform === 'win32' && !target.cmd.endsWith('.exe') ? `${target.cmd}.exe` : target.cmd)
        await writeFile(directPath, bytes, { mode: 0o755 })
      }
      const resolvedCmd = findExtractedFile(extractDir, target.cmd)
      if (!resolvedCmd) {
        throw new Error(`Archive for "${agent.id}" did not contain expected executable "${target.cmd}"`)
      }
      command = resolvedCmd
      args = [...(target.args ?? [])]
      env = { ...(target.env ?? {}) }
    } else if (dist === 'uvx' && agent.distribution.uvx) {
      const uvxSpec = agent.distribution.uvx
      const uvCacheDir = join(this.registryRoot, 'uv-cache')
      const uvToolDir = join(this.registryRoot, 'uv-tools')
      await mkdir(uvCacheDir, { recursive: true })
      await mkdir(uvToolDir, { recursive: true })
      command = process.platform === 'win32' ? 'uvx.exe' : 'uvx'
      args = ['--from', uvxSpec.package, ...(uvxSpec.args ?? [])]
      env = {
        UV_CACHE_DIR: uvCacheDir,
        UV_TOOL_DIR: uvToolDir,
        ...(uvxSpec.env ?? {}),
      }
    } else {
      throw new Error(`Unsupported distribution "${dist}" for "${agent.id}"`)
    }

    const receipt: PreparedRegistryReceipt = {
      agentId: agent.id,
      name: agent.name,
      version: agent.version,
      distribution: dist,
      command,
      args,
      env,
      preparedAt: new Date().toISOString(),
    }
    await writeFileAtomic(this.receiptPath(agent.id, agent.version), JSON.stringify(receipt, null, 2), { mode: 0o600 })
    return receipt
  }
}
