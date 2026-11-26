import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { buildFilePreviewExcerpt, createFilePreviewLoader, type WorkspaceFileExcerptReader } from '../src/client/chat/file-preview.ts'

describe('buildFilePreviewExcerpt', () => {
  it('highlights the referenced line range for source code citations', () => {
    const excerpt = buildFilePreviewExcerpt(
      'PageContainer.cs',
      'line1\nyield return BeforePush(ctx);\nyield return Push(ctx);\nline4\n',
      184,
      { path: 'Runtime/PageContainer.cs', line: 185, endLine: 186 },
    )
    expect(excerpt).toEqual({
      fileName: 'PageContainer.cs',
      isCode: true,
      lines: [
        { number: 185, text: 'yield return BeforePush(ctx);', highlighted: true },
        { number: 186, text: 'yield return Push(ctx);', highlighted: true },
        { number: 187, text: 'line4', highlighted: false },
      ],
    })
  })

  it('highlights the matched heading anchor in markdown documents', () => {
    const excerpt = buildFilePreviewExcerpt(
      'project-structure.md',
      '# Title\nIntro\n## 程序集与依赖方向\nRuntime depends on Foundation.\nCore depends on Runtime.\n',
      1,
      { path: 'docs/project-structure.md', heading: '程序集与依赖方向' },
    )
    expect(excerpt?.isCode).toBe(false)
    expect(excerpt?.lines[0]).toEqual({ number: 3, text: '## 程序集与依赖方向', highlighted: true })
    expect(excerpt?.lines[1]?.highlighted).toBe(false)
  })
})

describe('createFilePreviewLoader', () => {
  it('caches repeated lookups for the same resolved target', async () => {
    const read = vi.fn<WorkspaceFileExcerptReader['read']>().mockResolvedValue({
      ok: true,
      value: {
        absolutePath: '/repo/README.md',
        version: 'v1',
        bytes: 26,
        offset: 1,
        text: '## Overview\nDetails here.',
        lines: 2,
        eof: true,
      },
    })
    const loader = createFilePreviewLoader({ read }, 's1' as SessionId, p => `/repo/${p}`)
    const controller = new AbortController()

    const first = await loader({ path: 'README.md' }, controller.signal)
    const second = await loader({ path: 'README.md' }, controller.signal)

    expect(first).toEqual(second)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
