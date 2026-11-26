/** Context files card section: lists workspace files referenced in the Session. */
import { useMemo, useState, type ReactNode } from 'react'
import { LinkIconMedium, classifyLinkPath } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { NS } from './locales.ts'
import type {} from './slots.ts'

/** Injected file-opener capability for the Context card. */
export interface ContextFilesSectionInjected {
  /** Open one referenced workspace file in the right Sidebar when available. */
  readonly openFile: (sessionId: SessionId, path: string) => void
}

/** Full props of the built-in Context files section. */
export type ContextFilesSectionProps =
  PropsRuntime<'conversation.session.panel.section'>
  & PropsRenderFactories
  & PropsLocale<typeof NS>
  & InjectFace<ContextFilesSectionInjected>

/** Rows shown before folding behind the shared fold row, matching Kimi Work's Context card. */
const FOLD_LIMIT = 3

/** Common tool input field names that hold a workspace file path. */
const PATH_KEYS = ['path', 'file_path', 'filePath', 'target_file', 'targetFile', 'AbsolutePath', 'TargetFile', 'file'] as const

/** Markdown links whose destination looks like a workspace file path. */
const MARKDOWN_FILE_LINK = /\]\(([^)\s]+)\)/gu

function basenameOf(path: string): string {
  const normalized = path.replace(/[\\/]+$/u, '')
  const parts = normalized.split(/[\\/]/u)
  return parts.at(-1) ?? path
}

function normalizeCandidatePath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^<|>$/gu, '')
  if (trimmed.length === 0 || trimmed.length > 512) return null
  if (/^(?:https?|mailto|data|blob|javascript):/iu.test(trimmed)) return null
  const withoutFragment = trimmed.split('#')[0] ?? ''
  const withoutLine = withoutFragment.replace(/:\d+(?::\d+|-\d+)?$/u, '')
  if (withoutLine.length === 0 || withoutLine.includes('?')) return null
  const unslashed = /^\/[a-z]:[\\/]/iu.test(withoutLine) ? withoutLine.slice(1) : withoutLine
  // Require an extension or path separator so plain words are never mistaken for files.
  const hasSep = unslashed.includes('/') || unslashed.includes('\\')
  const hasExt = /\.[a-z0-9]{1,10}$/iu.test(unslashed)
  if (!hasSep && !hasExt) return null
  // Directories (trailing slash) are excluded from the files list.
  if (/[\\/]$/u.test(unslashed)) return null
  return unslashed
}

function extractPathsFromInput(input: unknown, collect: (path: string) => void): void {
  if (typeof input !== 'object' || input === null) return
  const record = input as Record<string, unknown>
  for (const key of PATH_KEYS) {
    const value = record[key]
    if (typeof value === 'string') {
      const normalized = normalizeCandidatePath(value)
      if (normalized !== null) collect(normalized)
    }
  }
}

function extractPathsFromArgsRaw(argsRaw: string | undefined, collect: (path: string) => void): void {
  if (argsRaw === undefined || argsRaw.trim() === '') return
  try {
    extractPathsFromInput(JSON.parse(argsRaw), collect)
  } catch (_error) {
    // Partial or non-JSON tool arguments cannot reliably name a workspace file.
  }
}

/**
 * Extract unique referenced workspace file paths from the Chat snapshot's
 * tool calls and settled assistant Markdown links.
 * @param nodes - Settled Chat snapshot legacy nodes.
 * @returns Deduplicated referenced file paths in first-seen order.
 */
export function extractReferencedFiles(nodes: ChatSnapshot['legacy']['nodes']): readonly string[] {
  const seen = new Map<string, string>()
  const collect = (path: string): void => {
    const key = path.replaceAll('\\', '/').toLowerCase()
    if (!seen.has(key)) seen.set(key, path)
  }

  for (const node of nodes) {
    if (node.kind === 'tool-result') {
      extractPathsFromArgsRaw(node.call?.argsRaw, collect)
      continue
    }
    if (node.kind !== 'assistant') continue
    for (const block of node.blocks) {
      if (block.kind === 'tool-call') {
        extractPathsFromArgsRaw(block.argsRaw, collect)
      } else if (block.kind === 'text') {
        for (const match of block.text.matchAll(MARKDOWN_FILE_LINK)) {
          const dest = match[1]
          if (dest !== undefined) {
            const normalized = normalizeCandidatePath(dest)
            if (normalized !== null) collect(normalized)
          }
        }
      }
    }
  }
  return [...seen.values()]
}

/**
 * Render referenced workspace files as a Kimi-style Context card.
 * Returns null when no files have been referenced so the panel hides the card.
 * @param props - Chat selector, factory renderer, file opener, and locale seat.
 * @returns File rows and optional fold row, or null when empty.
 */
export function ContextFilesSection({
  sessionId, useChat, renderFactorySlot, openFile, dismissOverlay, t,
}: ContextFilesSectionProps): ReactNode {
  const nodes = useChat(s => s.legacy.nodes)
  const files = useMemo(() => extractReferencedFiles(nodes), [nodes])
  const [expanded, setExpanded] = useState(false)
  if (files.length === 0) return null

  const canFold = files.length > FOLD_LIMIT + 1
  const visible = canFold && !expanded ? files.slice(0, FOLD_LIMIT) : files
  const hiddenCount = files.length - visible.length

  return (
    <div data-session-panel-context-files="">
      {visible.map(path => (
        <div key={path} data-session-panel-row="">
          <button
            type="button"
            data-row-part="body"
            title={path}
            onClick={() => {
              openFile(sessionId, path)
              dismissOverlay()
            }}
          >
            <span data-row-part="icon" aria-hidden="true">
              <LinkIconMedium kind={classifyLinkPath(path)} />
            </span>
            <span data-row-part="content">{basenameOf(path)}</span>
          </button>
        </div>
      ))}
      {canFold && renderFactorySlot('conversation.session.panel.fold', {
        expanded,
        label: expanded ? t('fold.collapse') : t('fold.expand', { count: hiddenCount }),
        name: `${expanded ? t('fold.collapse') : t('fold.expand', { count: hiddenCount })} ${t('section.context')}`,
        onToggle: () => { setExpanded(value => !value) },
      })}
    </div>
  )
}
