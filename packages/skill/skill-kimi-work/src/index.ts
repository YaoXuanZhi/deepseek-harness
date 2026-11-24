/**
 * Bundled Kimi Work skill provider.
 *
 * Registers the Kimi Work Blueprint (`blueprint`, `widget`, `widgetdesign`,
 * `canvas`, `automation`, `binding`) and `deep-research` skills into
 * `ctx.skills` for progressive on-demand loading through `dsh-tool-skill`.
 * @module @deepseek-ai/dsh-skill-kimi-work
 */

import { readFile } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BUNDLED_SKILL_RANK, type SkillCandidate } from '@deepseek-ai/dsh-skill'
import { KIMI_WORK_SKILL_NAMES } from './names.ts'

export type { KimiWorkSkillName } from './names.ts'

/** Configuration accepted by the bundled Kimi Work skill provider. */
export interface KimiWorkSkillsConfig {
  /** Absolute directory containing one subdirectory per bundled Kimi Work skill. */
  assetRoot?: string
}

const DEFAULT_ASSETS = fileURLToPath(new URL('../assets/', import.meta.url))
const PROVIDER_NAME = 'dsh-kimi-work'

/** Plugin name registered with the Cordis loader. */
export const name = 'skill-kimi-work'
/** Required Cordis services. */
export const inject = ['skills']

/** Runtime configuration schema. */
export const Config: z<KimiWorkSkillsConfig> = z.object({
  assetRoot: z.string().min(1).description(
    'Absolute directory containing the bundled Kimi Work skill folders (`<name>/SKILL.md`).',
  ),
})

type SkillRead =
  | { readonly kind: 'loaded'; readonly description: string; readonly content: string }
  | { readonly kind: 'failed'; readonly error: unknown; readonly persistent: boolean }

function parseSkillMarkdown(raw: string, expectedName: string, path: string): { description: string; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match?.[1] === undefined) {
    throw new Error(`skill-kimi-work: ${path} has no YAML frontmatter`)
  }
  const meta = new Map<string, string>()
  for (const line of match[1].split(/\r?\n/u)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/gu, '')
    meta.set(key, val)
  }
  if (meta.get('name') !== expectedName) {
    throw new Error(`skill-kimi-work: ${path} frontmatter name "${meta.get('name') ?? ''}" does not match "${expectedName}"`)
  }
  const description = meta.get('description') ?? ''
  if (!description) {
    throw new Error(`skill-kimi-work: ${path} has no description`)
  }
  return {
    description,
    content: raw.slice(match[0].length).trim(),
  }
}

function persistentReadFailure(error: unknown): boolean {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * Register the bundled Kimi Work skill provider on `ctx.skills`.
 * @param ctx - Cordis plugin context with `ctx.skills` injected.
 * @param config - Validated provider configuration.
 */
export function apply(ctx: Context, config: KimiWorkSkillsConfig = {}): void {
  const assetRoot = config.assetRoot ?? DEFAULT_ASSETS
  if (!isAbsolute(assetRoot)) {
    throw new Error('skill-kimi-work: assetRoot must be an absolute directory')
  }
  const reportedFailures = new Map<string, string>()

  async function readSkill(skillName: string, signal: AbortSignal | undefined): Promise<SkillRead> {
    const path = join(assetRoot, skillName, 'SKILL.md')
    let raw: string
    try {
      raw = await readFile(path, { encoding: 'utf8', signal })
    } catch (error) {
      if (signal?.aborted === true) throw error
      return recordFailure(skillName, error, persistentReadFailure(error))
    }
    try {
      const parsed = parseSkillMarkdown(raw, skillName, path)
      reportedFailures.delete(skillName)
      return { kind: 'loaded', ...parsed }
    } catch (error) {
      return recordFailure(skillName, error, true)
    }
  }

  function recordFailure(skillName: string, error: unknown, persistent: boolean): SkillRead {
    const text = String(error)
    if (reportedFailures.get(skillName) !== text) {
      reportedFailures.set(skillName, text)
      ctx.logger.warn(`skill-kimi-work: skill "${skillName}" is unavailable: ${text}`)
    }
    return { kind: 'failed', error, persistent }
  }

  ctx.skills.registerProvider(control => ({
    name: PROVIDER_NAME,
    async list(options) {
      const reads = await Promise.all(
        KIMI_WORK_SKILL_NAMES.map(async skillName => ({ skillName, read: await readSkill(skillName, options.signal) })),
      )
      const candidates: SkillCandidate[] = []
      for (const { skillName, read } of reads) {
        if (read.kind === 'failed') continue
        const directory = join(assetRoot, skillName)
        candidates.push({
          name: skillName,
          description: read.description,
          invocation: { modelInvocable: true, userInvocable: true },
          provider: PROVIDER_NAME,
          source: 'bundled',
          rank: BUNDLED_SKILL_RANK,
          resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
          locator: join(directory, 'SKILL.md'),
        })
      }
      return {
        candidates,
        complete: reads.every(({ read }) => read.kind === 'loaded' || read.persistent),
      }
    },
    async get(candidate, options) {
      const { rank: _rank, locator: _locator, ...summary } = candidate
      const read = await readSkill(candidate.name, options.signal)
      if (read.kind === 'failed') {
        if (!read.persistent) throw read.error
        control.invalidate()
        return undefined
      }
      return {
        ...summary,
        content: read.content,
      }
    },
  }))
}
