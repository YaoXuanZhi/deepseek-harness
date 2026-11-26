/**
 * Host-local ACP CLI discovery (`@deepseek-ai/dsh-llm-acp/local-discovery`).
 *
 * Performs fast synchronous filesystem and `PATH` checks (no subprocess spawns) to detect
 * already-installed local ACP-compatible CLIs and their existing subscription auth directories
 * (such as `~/.gemini/bin/agy.exe` + `~/.gemini/antigravity-acp`).
 *
 * @module @deepseek-ai/dsh-llm-acp/local-discovery
 */

import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { splitInlineAcpCommand, type ResolveExecutableOptions } from './probe-auth.ts'
import type { DetectedLocalAcpAgent } from './types.ts'

/** Minimal configured provider summary used to mark already-configured local agents. */
export interface ConfiguredAcpProviderHint {
  /** Configured provider route id. */
  readonly id: string
  /** Configured executable command string. */
  readonly command: string
  /** Configured source (`registry` or `local`). */
  readonly source: 'registry' | 'local'
}

interface LocalAcpAgentSpec {
  readonly id: string
  readonly displayName: string
  readonly commandNames: readonly string[]
  readonly args: readonly string[]
  readonly extraDirs: (home: string, platform: NodeJS.Platform) => readonly string[]
  readonly detectAuth: (home: string) => { readonly detected: boolean; readonly authPath?: string }
}

function isFile(filePath: string): boolean {
  try {
    return existsSync(filePath) && statSync(filePath).isFile()
  } catch (_statErr) {
    // Inaccessible or invalid path on the host filesystem.
    return false
  }
}

function findCommandInDirs(
  dirs: readonly string[],
  names: readonly string[],
  platform: NodeJS.Platform,
  pathExts: readonly string[],
): string | undefined {
  for (const dir of dirs) {
    for (const name of names) {
      if (platform === 'win32' && !/\.[a-z0-9]+$/i.test(name)) {
        for (const ext of pathExts) {
          const candidate = join(dir, `${name}${ext}`)
          if (isFile(candidate)) return candidate
        }
      }
      const direct = join(dir, name)
      if (isFile(direct)) return direct
    }
  }
  return undefined
}

const LOCAL_AGENT_SPECS: readonly LocalAcpAgentSpec[] = [
  {
    id: 'agy-acp',
    displayName: 'Antigravity ACP',
    commandNames: ['agy'],
    args: ['acp'],
    extraDirs: (home, platform) => [
      join(home, '.gemini', 'bin'),
      ...(platform === 'win32' ? [join(home, 'AppData', 'Local', 'Programs', 'antigravity', 'bin')] : []),
    ],
    detectAuth: (home) => {
      const authDir = join(home, '.gemini', 'antigravity-acp')
      if (isFile(join(authDir, 'acp_token.json'))) {
        return { detected: true, authPath: authDir }
      }
      return { detected: false }
    },
  },
  {
    id: 'gemini-acp',
    displayName: 'Gemini CLI ACP',
    commandNames: ['gemini'],
    args: ['--experimental-acp'],
    extraDirs: (home, platform) => [
      join(home, '.local', 'bin'),
      ...(platform === 'win32' ? [join(home, 'AppData', 'Roaming', 'npm')] : []),
    ],
    detectAuth: (home) => {
      const creds = join(home, '.gemini', 'oauth_creds.json')
      if (isFile(creds)) {
        return { detected: true, authPath: join(home, '.gemini') }
      }
      return { detected: false }
    },
  },
  {
    id: 'claude-code-acp',
    displayName: 'Claude Code ACP',
    commandNames: ['claude-code-acp', 'claude-agent-acp'],
    args: [],
    extraDirs: (home, platform) => [
      join(home, '.local', 'bin'),
      ...(platform === 'win32' ? [join(home, 'AppData', 'Roaming', 'npm')] : []),
    ],
    detectAuth: (home) => {
      const credFile = join(home, '.claude', '.credentials.json')
      if (isFile(credFile)) {
        return { detected: true, authPath: join(home, '.claude') }
      }
      return { detected: false }
    },
  },
  {
    id: 'codex-acp',
    displayName: 'Codex ACP',
    commandNames: ['codex-acp'],
    args: [],
    extraDirs: (home, platform) => [
      join(home, '.local', 'bin'),
      join(home, '.cargo', 'bin'),
      ...(platform === 'win32' ? [join(home, 'AppData', 'Roaming', 'npm')] : []),
    ],
    detectAuth: (home) => {
      const authFile = join(home, '.codex', 'auth.json')
      if (isFile(authFile)) {
        return { detected: true, authPath: join(home, '.codex') }
      }
      return { detected: false }
    },
  },
  {
    id: 'kimi-acp',
    displayName: 'Kimi CLI ACP',
    commandNames: ['kimi'],
    args: ['acp'],
    extraDirs: home => [join(home, '.local', 'bin')],
    detectAuth: (home) => {
      const kimiDir = join(home, '.kimi')
      if (isFile(join(kimiDir, 'credentials.json')) || isFile(join(kimiDir, 'config.toml'))) {
        return { detected: true, authPath: kimiDir }
      }
      return { detected: false }
    },
  },
  {
    id: 'opencode-acp',
    displayName: 'OpenCode ACP',
    commandNames: ['opencode'],
    args: ['acp'],
    extraDirs: home => [join(home, '.opencode', 'bin'), join(home, '.local', 'bin')],
    detectAuth: (home) => {
      const authFile = join(home, '.local', 'share', 'opencode', 'auth.json')
      if (isFile(authFile)) {
        return { detected: true, authPath: join(home, '.local', 'share', 'opencode') }
      }
      return { detected: false }
    },
  },
]

function normalizeBaseCommandName(rawCommand: string): string {
  const firstToken = splitInlineAcpCommand(rawCommand, []).command
  const base = basename(firstToken).toLowerCase()
  return base.replace(/\.(exe|cmd|bat|com)$/i, '')
}

/**
 * Scan standard user bin directories and `PATH` for installed local ACP-compatible CLIs
 * and report whether existing subscription authorization files were found on disk.
 * @param configuredProviders - Already-configured ACP providers used to flag duplicates.
 * @param options - Optional host directory and platform overrides for deterministic testing.
 * @returns Discovered local ACP agents ordered with authenticated agents first.
 */
export function detectLocalAcpAgents(
  configuredProviders: readonly ConfiguredAcpProviderHint[] = [],
  options?: ResolveExecutableOptions,
): readonly DetectedLocalAcpAgent[] {
  const platform = options?.platform ?? process.platform
  const home = options?.homeDir ?? homedir()
  const pathStr = options?.envPath ?? process.env.PATH ?? ''
  const pathSep = platform === 'win32' ? ';' : delimiter
  const pathDirs = pathStr.split(pathSep).map(d => d.trim()).filter(Boolean)
  const rawExts = (options?.pathExt ?? process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.startsWith('.'))
  const pathExts = rawExts.length > 0 ? rawExts : ['.exe', '.cmd', '.bat', '.com']

  const found: DetectedLocalAcpAgent[] = []
  for (const spec of LOCAL_AGENT_SPECS) {
    const searchDirs = [...spec.extraDirs(home, platform), ...pathDirs]
    const resolvedCmd = findCommandInDirs(searchDirs, spec.commandNames, platform, pathExts)
    if (!resolvedCmd) continue

    const auth = spec.detectAuth(home)
    const specNames = new Set(spec.commandNames.map(n => n.toLowerCase()))
    const alreadyConfigured = configuredProviders.some((p) => {
      if (p.id === spec.id) return true
      if (p.source !== 'local') return false
      return specNames.has(normalizeBaseCommandName(p.command))
    })

    found.push({
      id: spec.id,
      displayName: spec.displayName,
      command: resolvedCmd,
      args: spec.args,
      authDetected: auth.detected,
      ...(auth.authPath === undefined ? {} : { authPath: auth.authPath }),
      alreadyConfigured,
    })
  }

  return found.sort((a, b) => Number(b.authDetected) - Number(a.authDetected))
}
