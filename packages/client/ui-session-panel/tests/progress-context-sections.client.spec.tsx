// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ProgressSection, type ProgressSectionProps } from '../src/client/ProgressSection.tsx'
import { ContextFilesSection, extractReferencedFiles, type ContextFilesSectionProps } from '../src/client/ContextFilesSection.tsx'
import { zh, type SessionPanelKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: SessionPanelKey, params?: Record<string, unknown>) => {
  let out: string = zh[key]
  if (params !== undefined) {
    for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}) as ProgressSectionProps['t']

const renderFold: ProgressSectionProps['renderFactorySlot'] = (_slot, props) => {
  const fold = props as { label: string; onToggle: () => void }
  return <button type="button" onClick={fold.onToggle}>{fold.label}</button>
}

describe('ProgressSection', () => {
  it('renders nothing when todos are empty and shows completed/in_progress/pending items when present', () => {
    const emptyProps = {
      sessionId: 's1' as SessionId,
      presentation: 'docked',
      dismissOverlay: vi.fn(),
      useProjection: () => [],
      renderFactorySlot: renderFold,
      t,
    } as never as ProgressSectionProps
    const { container, rerender } = render(<ProgressSection {...emptyProps} />)
    expect(container.firstChild).toBeNull()

    const todos = [
      { content: '核对项目定位与程序集边界', status: 'completed' as const },
      { content: '追踪运行时导航与示例调用链', status: 'in_progress' as const },
      { content: '归纳架构取舍与维护重点', status: 'pending' as const },
    ]
    rerender(<ProgressSection {...emptyProps} useProjection={() => todos as never} />)
    expect(screen.getByText('核对项目定位与程序集边界')).toBeTruthy()
    expect(screen.getByText('追踪运行时导航与示例调用链')).toBeTruthy()
    expect(screen.getByText('归纳架构取舍与维护重点')).toBeTruthy()
  })
})

describe('ContextFilesSection', () => {
  it('deduplicates referenced files from tool calls and markdown links, folds after 3, and opens on click', () => {
    const nodes = [
      { kind: 'tool-result', call: { name: 'read', argsRaw: '{"path":"AGENTS.md"}' } },
      { kind: 'tool-result', call: { name: 'read', argsRaw: '{"file_path":"README.md"}' } },
      {
        kind: 'assistant',
        blocks: [
          { kind: 'tool-call', callId: 'c1', name: 'read', argsRaw: '{"target_file":"docs/system.md"}' },
          { kind: 'text', text: 'See [Page.cs](Runtime/Page.cs#L10-L20) and [Modal.cs](Runtime/Modal.cs) and [web](https://example.com).' },
        ],
      },
    ] as never as ChatSnapshot['legacy']['nodes']

    expect(extractReferencedFiles(nodes)).toEqual(['AGENTS.md', 'README.md', 'docs/system.md', 'Runtime/Page.cs', 'Runtime/Modal.cs'])

    const openFile = vi.fn()
    const dismissOverlay = vi.fn()
    const props = {
      sessionId: 's1' as SessionId,
      presentation: 'docked',
      dismissOverlay,
      openFile,
      useChat: (selector: (s: ChatSnapshot) => unknown) => selector({ legacy: { nodes } } as ChatSnapshot),
      renderFactorySlot: renderFold,
      t,
    } as never as ContextFilesSectionProps

    render(<ContextFilesSection {...props} />)
    expect(screen.getByText('AGENTS.md')).toBeTruthy()
    expect(screen.getByText('README.md')).toBeTruthy()
    expect(screen.getByText('system.md')).toBeTruthy()
    expect(screen.queryByText('Page.cs')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开 2 个' }))
    expect(screen.getByText('Page.cs')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Page.cs' }))
    expect(openFile).toHaveBeenCalledWith('s1', 'Runtime/Page.cs')
    expect(dismissOverlay).toHaveBeenCalledTimes(1)
  })
})
