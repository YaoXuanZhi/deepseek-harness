// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownDelegateProvider } from '../src/markdown/MarkdownDelegate.tsx'
import { MarkdownText } from '../src/markdown/MarkdownText.tsx'
import { parseFileLink } from '../src/markdown/file-link.ts'
import { citationPillContent } from '../src/markdown/CitationPreviewPill.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('parseFileLink line range and heading anchors', () => {
  it('preserves endLine for line ranges and heading for markdown section anchors', () => {
    expect(parseFileLink('/F:/repo/PageContainer.cs#L185-L190')).toEqual({
      path: 'F:/repo/PageContainer.cs',
      line: 185,
      endLine: 190,
    })
    expect(parseFileLink('docs/project-structure.md#%E7%A8%8B%E5%BA%8F%E9%9B%86%E4%B8%8E%E4%BE%9D%E8%B5%96%E6%96%B9%E5%90%91')).toEqual({
      path: 'docs/project-structure.md',
      heading: '程序集与依赖方向',
    })
    expect(parseFileLink('src/app.ts:42')).toEqual({
      path: 'src/app.ts',
      line: 42,
    })
  })
})

describe('CitationPreviewPill', () => {
  it('strips common file extensions for compact source pill labels', () => {
    expect(citationPillContent('docs/project-structure.md', ['project-structure.md'])).toBe('project-structure')
    expect(citationPillContent('Runtime/PageContainer.cs', ['Runtime/PageContainer.cs#L10-L20'])).toBe('PageContainer')
    expect(citationPillContent('docs/guide.md', ['Architecture overview'])).toEqual(['Architecture overview'])
  })

  it('renders citation pills with hover excerpt previews when filePreview delegate is provided', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const openFile = vi.fn()
    const loadExcerpt = vi.fn().mockResolvedValue({
      fileName: 'PageContainer.cs',
      isCode: true,
      lines: [
        { number: 185, text: 'yield return _lifecycleHandler.BeforePush(context);', highlighted: true },
        { number: 186, text: 'yield return _lifecycleHandler.Push(context, playAnimation);', highlighted: false },
      ],
    })
    render(
      <MarkdownDelegateProvider
        openFile={openFile}
        filePreview={{ loadExcerpt, loadingLabel: 'Loading preview' }}
      >
        <MarkdownText
          text="See [PageContainer.cs](Runtime/PageContainer.cs#L185-L185)."
          labels={{ code: { copyLabel: 'Copy', copiedLabel: 'Copied' }, footnotes: 'Footnotes' }}
        />
      </MarkdownDelegateProvider>,
    )

    const pill = screen.getByRole('button', { name: 'PageContainer' })
    expect(pill.hasAttribute('data-citation-pill')).toBe(true)

    fireEvent.pointerEnter(pill, { pointerType: 'mouse' })
    await waitFor(() => {
      expect(screen.getByText('PageContainer.cs')).toBeTruthy()
      expect(screen.getByText('yield return _lifecycleHandler.BeforePush(context);').hasAttribute('data-highlighted')).toBe(true)
    })

    fireEvent.click(pill)
    expect(openFile).toHaveBeenCalledWith('Runtime/PageContainer.cs', { line: 185 })
  })
})
