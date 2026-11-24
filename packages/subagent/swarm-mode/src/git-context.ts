/**
 * Durable step-1 repository `<git-context>` snapshot injection for read-only
 * `explore` and `plan` specialist subagents.
 *
 * Captures working directory, credential-sanitized origin remote and project
 * slug, active branch, bounded `git status --porcelain` entries, and the latest
 * 3 commits on step 1 of a Session, logging the snapshot as a `git-context`
 * user message so model-visible context remains 100% reconstructable from the
 * Session log.
 *
 * @module @deepseek-ai/dsh-swarm-mode/git-context
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-working-directory'

const execFileAsync = promisify(execFile)

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Durable step-1 Git repository snapshot injected for specialist presets. */
    'git-context': { kind: 'git-context' } & ContextFormed
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'git-context'

/** Services required by the `<git-context>` pre-step injector. */
export const inject = ['agents', 'sessionProjections', 'workingDirectory']

/** Configuration for `<git-context>` repository snapshot collection. */
export interface GitContextConfig {
  /** Maximum `git status --porcelain` lines rendered before summarizing the remainder. */
  maxStatusFiles?: number
}

/** Schemastery schema for {@link GitContextConfig}. */
export const Config: z<GitContextConfig> = z.object({
  maxStatusFiles: z.natural().min(1).max(200).default(20).description('Maximum porcelain status entries included in `<git-context>`.'),
})

const gitContextStateSchema = zod.object({
  injected: zod.boolean(),
}).strict()

/**
 * Strip embedded userinfo credentials from a Git remote URL and extract the
 * normalized `owner/repo` project identifier when recognizable.
 * @param rawUrl - Raw `remote.origin.url` string from Git config.
 * @returns Sanitized remote string and optional `owner/repo` slug.
 */
export function sanitizeGitRemoteUrl(rawUrl: string): { remote: string; project: string | null } {
  const trimmed = rawUrl.trim()
  if (trimmed === '') return { remote: '', project: null }

  const scpMatch = /^(?:[^@/\s]+@)?([^:/\s]+):([^/\s].*?)(?:\.git)?\/?$/.exec(trimmed)
  if (scpMatch !== null && !trimmed.includes('://')) {
    const host = scpMatch[1] ?? ''
    const repoPath = (scpMatch[2] ?? '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '')
    return {
      remote: `${host}:${repoPath}`,
      project: repoPath.includes('/') ? repoPath : null,
    }
  }

  try {
    const parsed = new URL(trimmed)
    parsed.username = ''
    parsed.password = ''
    const cleanPath = parsed.pathname.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '')
    return {
      remote: `${parsed.protocol}//${parsed.host}${parsed.pathname}`,
      project: cleanPath.includes('/') ? cleanPath : null,
    }
  } catch (_err) {
    // Non-URL local filesystem remotes contain no URL authority credentials.
    return { remote: trimmed, project: null }
  }
}

async function runGit(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', [...args], {
      cwd,
      timeout: 5_000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
      ...(signal === undefined ? {} : { signal }),
    })
    return stdout.trimEnd()
  } catch (_err) {
    // Missing git binary, non-repo directory, or empty commit history degrades cleanly.
    return null
  }
}

/**
 * Collect a concise, credential-safe `<git-context>` XML block for `cwd`.
 * @param cwd - Working directory to inspect.
 * @param maxStatusFiles - Maximum status lines rendered inline before truncation.
 * @param signal - Optional cancellation signal.
 * @returns Formatted `<git-context>` snapshot string.
 */
export async function collectGitContext(
  cwd: string,
  maxStatusFiles = 20,
  signal?: AbortSignal,
): Promise<string> {
  const insideRepo = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'], signal)
  if (insideRepo?.trim() !== 'true') {
    return '<git-context status="unavailable" reason="not-a-repo"/>'
  }

  const [branchOut, headOut, remoteOut, statusOut, logOut] = await Promise.all([
    runGit(cwd, ['branch', '--show-current'], signal),
    runGit(cwd, ['rev-parse', '--short', 'HEAD'], signal),
    runGit(cwd, ['config', '--get', 'remote.origin.url'], signal),
    runGit(cwd, ['status', '--porcelain'], signal),
    runGit(cwd, ['log', '-3', '--format=%h %s'], signal),
  ])

  const branch = branchOut && branchOut.trim() !== ''
    ? branchOut.trim()
    : (headOut && headOut.trim() !== '' ? `(detached ${headOut.trim()})` : '(unborn)')

  const lines: string[] = [
    '<git-context>',
    `Working directory: ${cwd}`,
  ]

  if (remoteOut && remoteOut.trim() !== '') {
    const { remote, project } = sanitizeGitRemoteUrl(remoteOut)
    if (remote !== '') lines.push(`Remote: ${remote}`)
    if (project !== null) lines.push(`Project: ${project}`)
  }

  lines.push(`Branch: ${branch}`)

  const statusLines = statusOut
    ? statusOut.split(/\r?\n/).filter(line => line.trim().length > 0)
    : []
  if (statusLines.length === 0) {
    lines.push('Status: (clean)')
  } else {
    lines.push('Status:')
    for (const entry of statusLines.slice(0, maxStatusFiles)) {
      lines.push(`  ${entry.slice(0, 200)}`)
    }
    if (statusLines.length > maxStatusFiles) {
      lines.push(`  ... (${String(statusLines.length - maxStatusFiles)} more)`)
    }
  }

  const commitLines = logOut
    ? logOut.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
    : []
  if (commitLines.length > 0) {
    lines.push('Recent commits:')
    for (const commit of commitLines.slice(0, 3)) {
      lines.push(`  ${commit.slice(0, 200)}`)
    }
  }

  lines.push('</git-context>')
  return lines.join('\n')
}

/**
 * Mount durable step-1 `<git-context>` injection for the active preset scope.
 * @param ctx - Cordis plugin context.
 * @param config - Snapshot truncation configuration.
 */
export async function apply(ctx: Context, config: GitContextConfig = {}): Promise<void> {
  const maxStatusFiles = config.maxStatusFiles ?? 20
  const projectionHandle = await ctx.sessionProjections.register({
    key: 'gitContext',
    stateVersion: 1,
    stateSchema: gitContextStateSchema,
    init: () => ({ injected: false }),
    apply: (state, event) => {
      if (event.type === 'subagent/descriptor') {
        return { injected: false }
      }
      if (event.type === 'user/message' && event.data.source.kind === name) {
        return { injected: true }
      }
      return state
    },
  })

  ctx.on('agent/pre-step', async (
    { agent, step, signal },
    next,
  ): Promise<PreStepDecision> => {
    ctx.fiber.assertActive()
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || step !== 1) return decision
    if (projectionHandle.stateOf(agent.session).injected) return decision

    const cwd = await ctx.workingDirectory.ensure(agent, signal)
    const text = await collectGitContext(cwd, maxStatusFiles, signal)
    signal.throwIfAborted()

    return {
      ...decision,
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: name, form: 'snapshot', sections: [{ name, text }] },
        }),
      ],
    }
  }, { prepend: true })
}

/** Cordis plugin entry for durable step-1 `<git-context>` snapshot injection. */
const gitContextPlugin = { name, inject, Config, apply }

export default gitContextPlugin
