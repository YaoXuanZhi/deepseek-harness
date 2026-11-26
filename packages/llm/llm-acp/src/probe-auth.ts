/**
 * ACP subprocess spawning, `initialize` + `session/new` model/auth probing,
 * interactive OAuth `authenticate` flows, and OS terminal subscription login launcher.
 *
 * @module @deepseek-ai/dsh-llm-acp/probe-auth
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { Readable as NodeReadable, Writable as NodeWritable } from 'node:stream'
import {
  client as createAcpClientApp,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk'
import type {
  AcpAdvertisedAuthMethod,
  AcpAuthMethodType,
  AcpProviderModelEntry,
  AcpReasoningOption,
} from './types.ts'

/** Resolved spawn configuration for one ACP provider subprocess. */
export interface AcpSpawnTarget {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
}

/** Structured result returned by probing an ACP agent via `initialize` + `session/new`. */
export interface AcpProbeSnapshot {
  readonly status: 'ready' | 'auth_required' | 'error'
  readonly statusMessage?: string
  readonly authMethods: readonly AcpAdvertisedAuthMethod[]
  readonly models: readonly AcpProviderModelEntry[]
  readonly reasoningEfforts: readonly AcpReasoningOption[]
  readonly modelConfigOptionId?: string
  readonly reasoningConfigOptionId?: string
  readonly supportsHttpMcp: boolean
  readonly supportsImages: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Spawn an ACP child process with piped stdio and a cooperative teardown function.
 * @param target - Command, arguments, working directory, and environment variables.
 * @param onStderrChunk - Optional callback receiving UTF-8 stderr text chunks.
 * @returns Spawned child process, piped stdin/stdout, and async `dispose` callback.
 */
export function spawnAcpChildProcess(
  target: AcpSpawnTarget,
  onStderrChunk?: (text: string) => void,
): {
  readonly child: ChildProcess
  readonly stdin: NodeWritable
  readonly stdout: NodeReadable
  readonly getStderrTail: () => string
  readonly dispose: () => Promise<void>
} {
  mkdirSync(target.cwd, { recursive: true })
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...target.env,
  }
  const needsWinShell = process.platform === 'win32' && !/\.(exe|com)$/i.test(target.command)
  const child = needsWinShell
    ? spawn(
      [shellQuote(target.command), ...target.args.map(shellQuote)].join(' '),
      [],
      {
        cwd: target.cwd,
        env: mergedEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: true,
      },
    )
    : spawn(target.command, [...target.args], {
      cwd: target.cwd,
      env: mergedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
  let stderrTail = ''
  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    stderrTail = (stderrTail + text).slice(-4_000)
    onStderrChunk?.(text)
  })

  let disposed = false
  const dispose = async (): Promise<void> => {
    if (disposed) return
    disposed = true
    try {
      child.stdin.end()
    } catch (_stdinErr) {
      // Pipe may already be closed when child exited early.
    }
    if (child.exitCode !== null || child.killed) return
    await new Promise<void>((resolveExit) => {
      const killTimer = setTimeout(() => {
        if (child.exitCode === null) {
          if (process.platform === 'win32' && child.pid !== undefined) {
            const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
            killer.on('error', () => {})
          } else {
            try {
              child.kill('SIGKILL')
            } catch (_killErr) {
              // Child already exited between check and signal.
            }
          }
        }
      }, 1_500)
      child.once('close', () => {
        clearTimeout(killTimer)
        resolveExit()
      })
      if (process.platform !== 'win32') {
        try {
          child.kill('SIGTERM')
        } catch (_termErr) {
          // Child already exited before SIGTERM.
        }
      }
    })
  }

  return {
    child,
    stdin: child.stdin,
    stdout: child.stdout,
    getStderrTail: () => stderrTail.trim(),
    dispose,
  }
}

function shellQuote(token: string): string {
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(token)) return token
  if (process.platform === 'win32') {
    return `"${token.replaceAll('"', '\\"')}"`
  }
  return `'${token.replaceAll('\'', '\'\\\'\'')}'`
}

function normalizeAuthMethods(
  rawMethods: unknown,
  target: AcpSpawnTarget,
): readonly AcpAdvertisedAuthMethod[] {
  if (!Array.isArray(rawMethods)) return []
  const result: AcpAdvertisedAuthMethod[] = []
  for (const item of rawMethods) {
    if (!isRecord(item) || typeof item.id !== 'string') continue
    const id = item.id.trim()
    if (!id) continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id
    const description = typeof item.description === 'string' && item.description.trim()
      ? item.description.trim()
      : undefined
    const rawType = typeof item.type === 'string' ? item.type : 'agent'
    const type: AcpAuthMethodType = rawType === 'terminal' || rawType === 'env_var' ? rawType : 'agent'

    let terminalCommand: string | undefined
    if (type === 'terminal') {
      const extraArgs = Array.isArray(item.args)
        ? item.args.filter((a): a is string => typeof a === 'string')
        : []
      terminalCommand = [target.command, ...target.args, ...extraArgs].map(shellQuote).join(' ')
    }

    let envVarNames: string[] | undefined
    if (type === 'env_var' && Array.isArray(item.vars)) {
      envVarNames = item.vars
        .flatMap((v) => {
          if (typeof v === 'string') return [v]
          if (isRecord(v) && typeof v.name === 'string') return [v.name]
          return []
        })
        .filter(Boolean)
    }

    const link = typeof item.link === 'string' && /^https?:\/\//i.test(item.link)
      ? item.link
      : undefined

    result.push({
      id,
      name,
      ...(description === undefined ? {} : { description }),
      type,
      ...(terminalCommand === undefined ? {} : { terminalCommand }),
      ...(envVarNames === undefined || envVarNames.length === 0 ? {} : { envVarNames }),
      ...(link === undefined ? {} : { link }),
    })
  }
  return result
}

interface FlattenedChoice {
  readonly id: string
  readonly name: string
  readonly description?: string
}

function flattenConfigChoices(options: unknown): readonly FlattenedChoice[] {
  if (!Array.isArray(options)) return []
  const out: FlattenedChoice[] = []
  for (const entry of options) {
    if (!isRecord(entry)) continue
    if (Array.isArray(entry.options)) {
      // Grouped select options (`SessionConfigSelectGroup`)
      out.push(...flattenConfigChoices(entry.options))
      continue
    }
    const id = typeof entry.value === 'string'
      ? entry.value.trim()
      : (typeof entry.id === 'string' ? entry.id.trim() : '')
    if (!id) continue
    const name = typeof entry.name === 'string' && entry.name.trim()
      ? entry.name.trim()
      : (typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : id)
    const description = typeof entry.description === 'string' && entry.description.trim()
      ? entry.description.trim()
      : undefined
    out.push({
      id,
      name,
      ...(description === undefined ? {} : { description }),
    })
  }
  return out
}

function extractModelsAndReasoning(
  configOptions: unknown,
  legacyModelsField: unknown,
  supportsImages: boolean,
): {
  readonly models: readonly AcpProviderModelEntry[]
  readonly reasoningEfforts: readonly AcpReasoningOption[]
  readonly modelConfigOptionId?: string
  readonly reasoningConfigOptionId?: string
} {
  let modelConfigOptionId: string | undefined
  let reasoningConfigOptionId: string | undefined
  const models: AcpProviderModelEntry[] = []
  const reasoningEfforts: AcpReasoningOption[] = []
  const modalities: readonly ('text' | 'image')[] = supportsImages ? ['text', 'image'] : ['text']

  if (Array.isArray(configOptions)) {
    for (const opt of configOptions) {
      if (!isRecord(opt) || typeof opt.id !== 'string') continue
      const optId = opt.id
      const category = typeof opt.category === 'string' ? opt.category : ''
      const lowerId = optId.toLowerCase()

      if (modelConfigOptionId === undefined && (category === 'model' || lowerId === 'model')) {
        modelConfigOptionId = optId
        for (const choice of flattenConfigChoices(opt.options)) {
          if (!models.some(m => m.id === choice.id)) {
            models.push({
              id: choice.id,
              name: choice.name,
              ...(choice.description === undefined ? {} : { description: choice.description }),
              inputModalities: modalities,
            })
          }
        }
      } else if (
        reasoningConfigOptionId === undefined
        && (category === 'thought_level' || lowerId === 'thought_level' || lowerId === 'reasoning_effort' || lowerId === 'effort')
      ) {
        reasoningConfigOptionId = optId
        for (const choice of flattenConfigChoices(opt.options)) {
          if (!reasoningEfforts.some(r => r.id === choice.id)) {
            reasoningEfforts.push({ id: choice.id, name: choice.name })
          }
        }
      }
    }
  }

  // Fallback to `models.availableModels` if the ACP agent uses legacy SessionModelState
  if (models.length === 0 && isRecord(legacyModelsField) && Array.isArray(legacyModelsField.availableModels)) {
    for (const item of legacyModelsField.availableModels) {
      if (!isRecord(item)) continue
      const id = typeof item.modelId === 'string'
        ? item.modelId.trim()
        : (typeof item.id === 'string' ? item.id.trim() : '')
      if (!id || models.some(m => m.id === id)) continue
      const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id
      const description = typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : undefined
      models.push({
        id,
        name,
        ...(description === undefined ? {} : { description }),
        inputModalities: modalities,
      })
    }
  }

  return {
    models,
    reasoningEfforts,
    ...(modelConfigOptionId === undefined ? {} : { modelConfigOptionId }),
    ...(reasoningConfigOptionId === undefined ? {} : { reasoningConfigOptionId }),
  }
}

function looksLikeAuthRequired(err: unknown, stderrTail: string): boolean {
  const combined = `${err instanceof Error ? err.message : String(err)} ${stderrTail}`.toLowerCase()
  return (
    combined.includes('auth')
    || combined.includes('login')
    || combined.includes('sign in')
    || combined.includes('unauthenticated')
    || combined.includes('unauthorized')
    || combined.includes('api key')
    || combined.includes('credential')
    || combined.includes('subscription')
    || combined.includes('-32000')
  )
}

/**
 * Probe an ACP agent subprocess via `initialize` and `session/new` to discover
 * authentication methods, subscription models, reasoning efforts, and MCP capabilities.
 * @param target - Spawn target configuration.
 * @param timeoutMs - Maximum probe duration in milliseconds.
 * @returns Discovered capabilities, models, and authentication status.
 */
export async function probeAcpAgent(
  target: AcpSpawnTarget,
  timeoutMs = 25_000,
): Promise<AcpProbeSnapshot> {
  const proc = spawnAcpChildProcess(target)
  let dynamicConfigOptions: unknown
  try {
    const clientApp = createAcpClientApp({ name: 'deepseek-harness-llm-acp-probe' })
      .onNotification(methods.client.session.update, ({ params }) => {
        const upd: unknown = params.update
        if (isRecord(upd) && upd.sessionUpdate === 'config_option_update' && Array.isArray(upd.configOptions)) {
          dynamicConfigOptions = upd.configOptions
        }
        return Promise.resolve()
      })
      .onRequest(methods.client.session.requestPermission, () =>
        Promise.resolve({ outcome: { outcome: 'cancelled' } }))

    const connection = clientApp.connect(ndJsonStream(
      NodeWritable.toWeb(proc.stdin) as WritableStream<Uint8Array>,
      NodeReadable.toWeb(proc.stdout) as ReadableStream<Uint8Array>,
    ))
    const agent = connection.agent

    const childErrorPromise = new Promise<never>((_res, rej) => {
      proc.child.once('error', rej)
      proc.child.once('close', (code) => {
        if (code !== 0 && code !== null) {
          rej(new Error(`ACP process exited with code ${String(code)}${proc.getStderrTail() ? `: ${proc.getStderrTail()}` : ''}`))
        }
      })
    })
    childErrorPromise.catch(() => {})

    const timeoutPromise = new Promise<never>((_res, rej) => {
      const t = setTimeout(() => { rej(new Error(`ACP probe timed out after ${String(timeoutMs)}ms`)) }, timeoutMs)
      proc.child.once('close', () => { clearTimeout(t) })
    })
    timeoutPromise.catch(() => {})

    const initRes = await Promise.race([
      agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      }),
      childErrorPromise,
      timeoutPromise,
    ])

    const initObj: Record<string, unknown> = isRecord(initRes) ? initRes : {}
    const caps = isRecord(initObj.agentCapabilities) ? initObj.agentCapabilities : {}
    const mcpCaps = isRecord(caps.mcpCapabilities) ? caps.mcpCapabilities : {}
    const promptCaps = isRecord(caps.promptCapabilities) ? caps.promptCapabilities : {}
    const supportsHttpMcp = mcpCaps.http === true
    const supportsImages = promptCaps.image === true
    const authMethods = normalizeAuthMethods(initObj.authMethods, target)

    try {
      const sessionRes = await Promise.race([
        agent.request(methods.agent.session.new, {
          cwd: target.cwd,
          mcpServers: [],
        }),
        childErrorPromise,
        timeoutPromise,
      ])
      const sessionObj: Record<string, unknown> = isRecord(sessionRes) ? sessionRes : {}
      let extracted = extractModelsAndReasoning(
        sessionObj.configOptions ?? dynamicConfigOptions,
        sessionObj.models,
        supportsImages,
      )
      if (extracted.models.length === 0) {
        // Give agents that push model catalogs asynchronously after session/new a short settle window.
        await new Promise<void>((r) => { setTimeout(r, 450) })
        if (dynamicConfigOptions !== undefined) {
          extracted = extractModelsAndReasoning(dynamicConfigOptions, sessionObj.models, supportsImages)
        }
      }
      const sessionId = typeof sessionObj.sessionId === 'string' ? sessionObj.sessionId : undefined
      if (sessionId && isRecord(caps.sessionCapabilities) && isRecord(caps.sessionCapabilities.close)) {
        await agent.request(methods.agent.session.close, { sessionId }).catch(() => {})
      }
      const fallbackModels: readonly AcpProviderModelEntry[] = extracted.models.length > 0
        ? extracted.models
        : [{ id: 'default', name: 'Default Model', inputModalities: supportsImages ? ['text', 'image'] : ['text'] }]

      return {
        status: 'ready',
        authMethods,
        models: fallbackModels,
        reasoningEfforts: extracted.reasoningEfforts,
        ...(extracted.modelConfigOptionId === undefined ? {} : { modelConfigOptionId: extracted.modelConfigOptionId }),
        ...(extracted.reasoningConfigOptionId === undefined ? {} : { reasoningConfigOptionId: extracted.reasoningConfigOptionId }),
        supportsHttpMcp,
        supportsImages,
      }
    } catch (sessionErr) {
      const isAuth = authMethods.length > 0 || looksLikeAuthRequired(sessionErr, proc.getStderrTail())
      const msg = sessionErr instanceof Error ? sessionErr.message : String(sessionErr)
      return {
        status: isAuth ? 'auth_required' : 'error',
        statusMessage: msg,
        authMethods,
        models: [],
        reasoningEfforts: [],
        supportsHttpMcp,
        supportsImages,
      }
    }
  } catch (err) {
    const tail = proc.getStderrTail()
    const baseMsg = err instanceof Error ? err.message : String(err)
    return {
      status: looksLikeAuthRequired(err, tail) ? 'auth_required' : 'error',
      statusMessage: tail && !baseMsg.includes(tail) ? `${baseMsg} (${tail})` : baseMsg,
      authMethods: [],
      models: [],
      reasoningEfforts: [],
      supportsHttpMcp: false,
      supportsImages: false,
    }
  } finally {
    await proc.dispose()
  }
}

const URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/i

/**
 * Run an interactive ACP `authenticate` RPC flow, capturing any OAuth authorization URL
 * emitted via stderr or protocol output and invoking `onAuthUrl` immediately so the UI
 * can open the browser while waiting for authentication to finish.
 * @param target - Spawn target configuration.
 * @param methodId - Advertised auth method id (optional; picks the first `agent` method when omitted).
 * @param onAuthUrl - Callback invoked when an `https://` OAuth URL is detected.
 * @param timeoutMs - Maximum authentication wait duration in milliseconds (default 5 minutes).
 * @returns Completion message once `authenticate` resolves.
 */
export async function runAcpAuthenticateFlow(
  target: AcpSpawnTarget,
  methodId: string | undefined,
  onAuthUrl: (url: string, message?: string) => void,
  timeoutMs = 5 * 60 * 1_000,
): Promise<{ readonly authenticatedMethodId: string }> {
  let reportedUrl = false
  const inspectTextForUrl = (text: string): void => {
    if (reportedUrl) return
    const match = URL_REGEX.exec(text)
    if (match?.[0]) {
      reportedUrl = true
      onAuthUrl(match[0], text.trim().slice(0, 300))
    }
  }

  const proc = spawnAcpChildProcess(target, inspectTextForUrl)
  try {
    const clientApp = createAcpClientApp({ name: 'deepseek-harness-llm-acp-auth' })
      .onNotification(methods.client.session.update, ({ params }) => {
        inspectTextForUrl(JSON.stringify(params))
        return Promise.resolve()
      })
      .onRequest(methods.client.session.requestPermission, () =>
        Promise.resolve({ outcome: { outcome: 'cancelled' } }))

    const connection = clientApp.connect(ndJsonStream(
      NodeWritable.toWeb(proc.stdin) as WritableStream<Uint8Array>,
      NodeReadable.toWeb(proc.stdout) as ReadableStream<Uint8Array>,
    ))
    const agent = connection.agent

    const timeoutPromise = new Promise<never>((_res, rej) => {
      const timer = setTimeout(() => {
        rej(new Error('ACP authentication timed out waiting for user completion'))
      }, timeoutMs)
      proc.child.once('close', () => { clearTimeout(timer) })
    })
    timeoutPromise.catch(() => {})

    const initRes = await Promise.race([
      agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      }),
      timeoutPromise,
    ])
    const initObj: Record<string, unknown> = isRecord(initRes) ? initRes : {}
    const authMethods = normalizeAuthMethods(initObj.authMethods, target)
    const chosenId = methodId?.trim()
      || authMethods.find(m => m.type === 'agent')?.id
      || authMethods[0]?.id
      || 'default'

    await Promise.race([
      agent.request(methods.agent.authenticate, { methodId: chosenId }),
      timeoutPromise,
    ])
    return { authenticatedMethodId: chosenId }
  } finally {
    await proc.dispose()
  }
}

/**
 * Open a visible interactive OS terminal window running the ACP agent's subscription login command
 * with the provider's configured environment variables.
 * @param target - Provider spawn target (`cwd` and `env`).
 * @param loginCommandLine - Shell command line to execute inside the terminal window.
 * @returns Launched command summary.
 */
export function launchTerminalSubscriptionLogin(
  target: AcpSpawnTarget,
  loginCommandLine?: string,
): { readonly commandLine: string } {
  mkdirSync(target.cwd, { recursive: true })
  const cmdLine = loginCommandLine?.trim()
    || [target.command, ...target.args].map(shellQuote).join(' ')
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...target.env,
  }

  if (process.platform === 'win32') {
    const child = spawn(
      'cmd.exe',
      ['/c', 'start', 'ACP Subscription Login', 'cmd.exe', '/k', cmdLine],
      {
        cwd: target.cwd,
        env: mergedEnv,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      },
    )
    child.unref()
  } else if (process.platform === 'darwin') {
    const escaped = cmdLine.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
    const child = spawn(
      'osascript',
      ['-e', `tell application "Terminal" to do script "cd ${shellQuote(target.cwd)} && ${escaped}"`, '-e', 'tell application "Terminal" to activate'],
      {
        cwd: target.cwd,
        env: mergedEnv,
        detached: true,
        stdio: 'ignore',
      },
    )
    child.unref()
  } else {
    const child = spawn(
      'x-terminal-emulator',
      ['-e', 'sh', '-c', `${cmdLine}; exec sh`],
      {
        cwd: target.cwd,
        env: mergedEnv,
        detached: true,
        stdio: 'ignore',
      },
    )
    child.on('error', () => {})
    child.unref()
  }

  return { commandLine: cmdLine }
}
