/**
 * Embedded PTY sign-in terminal session manager for `@deepseek-ai/dsh-llm-acp`.
 *
 * Allocates real pseudo-terminals via `ctx.subprocess.spawnTerminal` (`node-pty` / ConPTY)
 * so users can complete interactive CLI subscription logins directly inside the Settings Web UI
 * without opening an external OS terminal window.
 *
 * @module @deepseek-ai/dsh-llm-acp/pty-auth
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { stripVTControlCharacters } from 'node:util'
import type { SubprocessRuntime, SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import type { AcpSpawnTarget } from './probe-auth.ts'
import type { AcpLlmProviderId, AcpTerminalAuthSessionView } from './types.ts'

const MAX_TRANSCRIPT_CHARS = 65_536
const OUTPUT_COALESCE_MS = 40
const URL_SCAN_REGEX = /https:\/\/[^\s"'<>`)\]]+/gi

interface ManagedPtySession {
  readonly sessionId: string
  readonly providerId: AcpLlmProviderId
  readonly commandLine: string
  readonly startedAt: string
  handle: SubprocessTerminalHandle | undefined
  status: 'running' | 'exited' | 'failed'
  exitCode?: number
  output: string
  outputOffset: number
  detectedUrl?: string
  errorMessage?: string
  flushTimer: ReturnType<typeof setTimeout> | undefined
}

function buildShellArgv(commandLine: string): readonly string[] {
  if (process.platform === 'win32') {
    const trimmed = commandLine.trimStart()
    const needsCallOp = trimmed.startsWith('"') || trimmed.startsWith('\'')
    const psBody = `${needsCallOp ? `& ${commandLine}` : commandLine}; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }`
    return ['powershell.exe', '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psBody]
  }
  const shPath = process.env.SHELL?.trim() || '/bin/sh'
  return [shPath, '-c', commandLine]
}

function extractLatestHttpsUrl(rawTranscript: string): string | undefined {
  const plain = stripVTControlCharacters(rawTranscript)
  let latest: string | undefined
  URL_SCAN_REGEX.lastIndex = 0
  let match = URL_SCAN_REGEX.exec(plain)
  while (match !== null) {
    const cleaned = match[0].replace(/[.,;:!?]+$/, '')
    if (cleaned.length > 10) latest = cleaned
    match = URL_SCAN_REGEX.exec(plain)
  }
  return latest
}

/**
 * Manages ephemeral interactive PTY sign-in sessions keyed by `sessionId` (at most one active
 * session per `providerId` at a time).
 */
export class EmbeddedPtyAuthManager {
  private readonly sessions = new Map<string, ManagedPtySession>()

  constructor(
    private readonly getSubprocess: () => SubprocessRuntime | undefined,
    private readonly onChanged: () => void,
    private readonly onAuthenticatedExit: (providerId: AcpLlmProviderId) => Promise<void>,
  ) {}

  /**
   * Snapshot all active and recent PTY sign-in sessions for `catalog()`.
   * @returns Ordered session views.
   */
  listViews(): readonly AcpTerminalAuthSessionView[] {
    return [...this.sessions.values()].map(s => this.toView(s))
  }

  /**
   * Start a new embedded PTY sign-in session for `providerId`, terminating any previous
   * session owned by the same provider.
   * @param options - Provider id, spawn target, login command line, and initial dimensions.
   * @returns Initial PTY session snapshot.
   */
  async startSession(options: {
    readonly providerId: AcpLlmProviderId
    readonly target: AcpSpawnTarget
    readonly commandLine: string
    readonly cols?: number
    readonly rows?: number
  }): Promise<AcpTerminalAuthSessionView> {
    const subprocess = this.getSubprocess()
    if (!subprocess) {
      throw new Error('Embedded sign-in terminal requires @deepseek-ai/dsh-subprocess on this host.')
    }

    // Stop any previous session for the same provider so credentials never race.
    for (const [existingId, prev] of this.sessions) {
      if (prev.providerId === options.providerId) {
        await this.stopSession(existingId)
      }
    }

    mkdirSync(options.target.cwd, { recursive: true })
    const cols = Math.max(20, Math.min(300, Math.trunc(options.cols ?? 92)))
    const rows = Math.max(6, Math.min(120, Math.trunc(options.rows ?? 16)))
    const sessionId = `pty-${randomUUID().slice(0, 12)}`
    const session: ManagedPtySession = {
      sessionId,
      providerId: options.providerId,
      commandLine: options.commandLine,
      startedAt: new Date().toISOString(),
      handle: undefined,
      status: 'running',
      output: '',
      outputOffset: 0,
      flushTimer: undefined,
    }
    this.sessions.set(sessionId, session)

    try {
      const handle = await subprocess.spawnTerminal({
        argv: buildShellArgv(options.commandLine),
        cwd: options.target.cwd,
        env: { ...options.target.env },
        cols,
        rows,
        terminalType: 'xterm-256color',
        graceMs: 1_500,
      })
      session.handle = handle

      const decoder = new TextDecoder()
      const scheduleNotify = (): void => {
        if (session.flushTimer !== undefined) return
        session.flushTimer = setTimeout(() => {
          session.flushTimer = undefined
          this.onChanged()
        }, OUTPUT_COALESCE_MS)
      }

      handle.output.on('data', (chunk: Uint8Array | string) => {
        const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
        if (!text) return
        session.outputOffset += text.length
        session.output = (session.output + text).slice(-MAX_TRANSCRIPT_CHARS)
        const maybeUrl = extractLatestHttpsUrl(session.output)
        if (maybeUrl !== undefined) session.detectedUrl = maybeUrl
        scheduleNotify()
      })

      void handle.done.then(
        async (outcome) => {
          const tail = decoder.decode()
          if (tail) {
            session.outputOffset += tail.length
            session.output = (session.output + tail).slice(-MAX_TRANSCRIPT_CHARS)
          }
          if (session.flushTimer !== undefined) {
            clearTimeout(session.flushTimer)
            session.flushTimer = undefined
          }
          if (session.status === 'running') {
            session.status = outcome.exitCode === 0 ? 'exited' : 'failed'
            if (outcome.exitCode !== null) session.exitCode = outcome.exitCode
          }
          if (outcome.exitCode === 0) {
            await this.onAuthenticatedExit(session.providerId).catch(() => {})
          }
          this.onChanged()
        },
        (err: unknown) => {
          if (session.flushTimer !== undefined) {
            clearTimeout(session.flushTimer)
            session.flushTimer = undefined
          }
          session.status = 'failed'
          session.errorMessage = err instanceof Error ? err.message : String(err)
          this.onChanged()
        },
      )
    } catch (err) {
      session.status = 'failed'
      session.errorMessage = err instanceof Error ? err.message : String(err)
      this.onChanged()
      throw err
    }

    this.onChanged()
    return this.toView(session)
  }

  /**
   * Deliver user keystrokes, pasted text, and/or terminal dimension updates to a running PTY session.
   * @param request - Target `sessionId`, optional UTF-8 `data`, and optional `cols`/`rows`.
   */
  async writeSession(request: {
    readonly sessionId: string
    readonly data?: string
    readonly cols?: number
    readonly rows?: number
  }): Promise<void> {
    const session = this.sessions.get(request.sessionId)
    if (!session || session.status !== 'running' || !session.handle) {
      throw new Error('Sign-in terminal session is no longer running.')
    }
    if (request.cols !== undefined && request.rows !== undefined) {
      const cols = Math.max(20, Math.min(300, Math.trunc(request.cols)))
      const rows = Math.max(6, Math.min(120, Math.trunc(request.rows)))
      await session.handle.resize(cols, rows)
    }
    if (request.data !== undefined && request.data.length > 0) {
      await session.handle.write(request.data)
    }
  }

  /**
   * Terminate and remove a PTY sign-in session.
   * @param sessionId - Session identifier to stop.
   * @returns `true` if a tracked session was removed.
   */
  async stopSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    if (session.flushTimer !== undefined) {
      clearTimeout(session.flushTimer)
      session.flushTimer = undefined
    }
    this.sessions.delete(sessionId)
    if (session.handle) {
      await session.handle.terminate().catch(() => {})
    }
    this.onChanged()
    return true
  }

  /**
   * Terminate all active PTY sessions owned by a deleted provider.
   * @param providerId - Provider identifier being removed.
   */
  async stopForProvider(providerId: AcpLlmProviderId): Promise<void> {
    for (const [sid, session] of this.sessions) {
      if (session.providerId === providerId) {
        await this.stopSession(sid)
      }
    }
  }

  /**
   * Terminate all managed PTY sessions on plugin shutdown.
   */
  async disposeAll(): Promise<void> {
    const handles: SubprocessTerminalHandle[] = []
    for (const session of this.sessions.values()) {
      if (session.flushTimer !== undefined) {
        clearTimeout(session.flushTimer)
      }
      if (session.handle) handles.push(session.handle)
    }
    this.sessions.clear()
    await Promise.allSettled(handles.map(h => h.terminate()))
  }

  private toView(session: ManagedPtySession): AcpTerminalAuthSessionView {
    return {
      sessionId: session.sessionId,
      providerId: session.providerId,
      commandLine: session.commandLine,
      status: session.status,
      ...(session.exitCode === undefined ? {} : { exitCode: session.exitCode }),
      output: session.output,
      outputOffset: session.outputOffset,
      ...(session.detectedUrl === undefined ? {} : { detectedUrl: session.detectedUrl }),
      ...(session.errorMessage === undefined ? {} : { errorMessage: session.errorMessage }),
      startedAt: session.startedAt,
    }
  }
}
