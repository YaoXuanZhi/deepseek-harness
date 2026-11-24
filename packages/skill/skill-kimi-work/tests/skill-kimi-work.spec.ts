import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as SkillKimiWork from '../src/index.ts'
import { KIMI_WORK_SKILL_NAMES } from '../src/names.ts'

describe('@deepseek-ai/dsh-skill-kimi-work', () => {
  const tempDirs: string[] = []

  function makeTempDir(): string {
    const dir = join(tmpdir(), `dsh-skill-kimi-work-${String(Date.now())}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('discovers and loads all bundled Kimi Work skills within the 8192-char skill budget and cleans up on dispose', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillKimiWork)

    const catalog = await ctx.skills.list()
    expect(catalog.map(entry => entry.name).sort()).toEqual([...KIMI_WORK_SKILL_NAMES].sort())

    for (const skillName of KIMI_WORK_SKILL_NAMES) {
      const detail = await ctx.skills.get(skillName)
      expect(detail).toBeDefined()
      expect(detail?.name).toBe(skillName)
      expect(detail?.provider).toBe('dsh-kimi-work')
      expect(detail?.source).toBe('bundled')
      expect(detail?.content.length).toBeGreaterThan(80)
      expect(detail?.content.length).toBeLessThan(8192)
    }

    expect(await ctx.skills.get('unknown-skill')).toBeUndefined()

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
    await ctx.fiber.dispose()
  })

  it('rejects relative assetRoot loudly', () => {
    const ctx = new Context()
    expect(() =>{  SkillKimiWork.apply(ctx, { assetRoot: 'relative/assets' }) }).toThrow(/absolute directory/)
  })

  it('omits missing or malformed SKILL.md files and invalidates when a skill disappears before get()', async () => {
    const root = makeTempDir()
    mkdirSync(join(root, 'widget'), { recursive: true })
    writeFileSync(
      join(root, 'widget', 'SKILL.md'),
      '---\nname: widget\ndescription: Interactive widget authoring.\n---\n\n# Widget Body\n',
      'utf8',
    )
    mkdirSync(join(root, 'canvas'), { recursive: true })
    writeFileSync(
      join(root, 'canvas', 'SKILL.md'),
      '---\nname: wrong-name\ndescription: Invalid name.\n---\n\nBody\n',
      'utf8',
    )

    const ctx = new Context()
    vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(SkillKimiWork, { assetRoot: root })

    const discovered = await ctx.skills.list()
    expect(discovered.map(item => item.name)).toEqual(['widget'])

    rmSync(join(root, 'widget', 'SKILL.md'), { force: true })
    expect(await ctx.skills.get('widget')).toBeUndefined()
    expect(await ctx.skills.list()).toEqual([])
    await ctx.fiber.dispose()
  })
})
