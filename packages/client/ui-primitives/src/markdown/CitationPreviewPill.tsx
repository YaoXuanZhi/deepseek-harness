/** Inline file citation pill with lazy hover excerpt preview card. */
import { useEffect, useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { HoverCard } from '../HoverCard.tsx'
import { LinkIconMedium, classifyLinkPath } from '../LinkIcon.tsx'
import type { MarkdownDelegateFilePreview, MarkdownFilePreviewExcerpt, MarkdownFilePreviewTarget } from './MarkdownDelegate.tsx'
import css from './MarkdownText.module.css'

/** Extensions stripped from pill labels so filenames read like compact source tags. */
const STRIP_EXTENSION = new RegExp(
  '\\.(?:md|markdown|mdx|cs|ts|tsx|js|jsx|mjs|cjs|py|json|ya?ml|toml|css|scss|'
  + 'html|txt|sh|ps1|rs|go|java|kt|swift|cpp|cc|c|h|hpp|asmdef|unity|prefab|asset)$',
  'iu',
)

function basenameOf(path: string): string {
  const normalized = path.replace(/[\\/]+$/u, '')
  const parts = normalized.split(/[\\/]/u)
  return parts.at(-1) ?? path
}

/** Extract plain text when children consist solely of strings or numbers. */
function plainChildrenText(children: readonly ReactNode[]): string | undefined {
  let out = ''
  for (const child of children) {
    if (typeof child === 'string' || typeof child === 'number') out += String(child)
    else return undefined
  }
  return out.trim()
}

/**
 * Compact display text for an inline file citation pill.
 * File-like labels drop directory prefixes and common extensions so citations
 * stay compact in prose (e.g. `PageContainer.cs` -> `PageContainer`).
 * @param path - Decoded workspace path.
 * @param children - Authored markdown link children.
 * @returns Compact pill text or the original children.
 */
export function citationPillContent(path: string, children: readonly ReactNode[]): ReactNode {
  const text = plainChildrenText(children)
  if (text === undefined || text === '') return children
  const cleaned = text.replace(/(?:#L\d+(?:-L\d+)?|:\d+(?::\d+|-\d+)?)$/u, '')
  const base = cleaned.includes('/') || cleaned.includes('\\') ? basenameOf(cleaned) : cleaned
  const stripped = base.replace(STRIP_EXTENSION, '')
  if (stripped.length > 0 && stripped !== base) return stripped
  if (cleaned.includes('/') || cleaned.includes('\\')) return base || basenameOf(path)
  return children
}

interface CitationPreviewCardProps {
  readonly target: MarkdownFilePreviewTarget
  readonly filePreview: MarkdownDelegateFilePreview
}

/** Lazy-loaded excerpt card mounted only while the hover card is open. */
function CitationPreviewCard({ target, filePreview }: CitationPreviewCardProps): ReactNode {
  const [state, setState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'loaded'; readonly excerpt: MarkdownFilePreviewExcerpt }
    | { readonly status: 'fallback' }
  >({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void filePreview.loadExcerpt(target, controller.signal).then(
      (excerpt) => {
        if (controller.signal.aborted) return
        if (excerpt === null || excerpt.lines.length === 0) setState({ status: 'fallback' })
        else setState({ status: 'loaded', excerpt })
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'fallback' })
      },
    )
    return () => { controller.abort() }
  }, [filePreview, target.path, target.line, target.endLine, target.heading])

  const fileName = state.status === 'loaded' ? state.excerpt.fileName : basenameOf(target.path)
  return (
    <div className={css.citationCard} data-citation-preview="">
      <div className={css.citationCardHeader}>
        <LinkIconMedium kind={classifyLinkPath(target.path)} className={css.citationCardIcon} />
        <span className={css.citationCardName}>{fileName}</span>
      </div>
      {state.status === 'loading' && (
        <div className={css.citationCardLoading} aria-live="polite">
          <span className={css.citationSkeletonLine} />
          <span className={css.citationSkeletonLineShort} />
          <span className={css.srOnly}>{filePreview.loadingLabel}</span>
        </div>
      )}
      {state.status === 'loaded' && (
        <div className={clsx(css.citationExcerpt, state.excerpt.isCode && css.citationExcerptCode)}>
          {state.excerpt.lines.map(line => (
            <div
              key={line.number}
              className={clsx(css.citationLine, line.highlighted && css.citationLineHighlighted)}
              data-highlighted={line.highlighted ? '' : undefined}
            >
              {line.text === '' ? '\u00A0' : line.text}
            </div>
          ))}
        </div>
      )}
      {state.status === 'fallback' && (
        <div className={css.citationCardFallback}>{target.path}</div>
      )}
    </div>
  )
}

/** Props for {@link CitationPreviewPill}. */
export interface CitationPreviewPillProps {
  readonly file: MarkdownFilePreviewTarget
  readonly children: readonly ReactNode[]
  readonly openFile: (path: string, options?: { line?: number }) => void
  readonly filePreview: MarkdownDelegateFilePreview
  readonly triggerProps?: Pick<HTMLAttributes<HTMLElement>, 'onContextMenu' | 'onKeyDown' | 'tabIndex'> | undefined
}

/**
 * Render a compact file citation pill that inverts on hover/open and displays
 * an inline floating excerpt preview card.
 * @param props - File target, authored label, opener, preview loader, and menu props.
 * @returns The interactive citation pill wrapped in a HoverCard.
 */
export function CitationPreviewPill({
  file, children, openFile, filePreview, triggerProps,
}: CitationPreviewPillProps): ReactNode {
  const [open, setOpen] = useState(false)
  const pill = (
    <button
      type="button"
      className={clsx(css.citationPill, open && css.citationPillActive)}
      data-citation-pill=""
      data-citation-active={open ? '' : undefined}
      {...triggerProps}
      onClick={() => { openFile(file.path, file.line === undefined ? undefined : { line: file.line }) }}
    >
      {citationPillContent(file.path, children)}
    </button>
  )
  return (
    <HoverCard
      inline
      openDelayMs={200}
      cardClassName={css.citationHoverCard}
      onOpenChange={setOpen}
      anchor={pill}
      content={<CitationPreviewCard target={file} filePreview={filePreview} />}
    />
  )
}
