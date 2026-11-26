/** Cached workspace file excerpt loader for inline Markdown citation hover cards. */
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceFileRange, WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { MarkdownFilePreviewExcerpt, MarkdownFilePreviewLine, MarkdownFilePreviewTarget } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Minimal Host workspace-file reader used by citation hover cards. */
export interface WorkspaceFileExcerptReader {
  read(
    sessionId: SessionId,
    path: string,
    range: WorkspaceFileRange,
    signal?: AbortSignal,
  ): Promise<RemoteResult<WorkspaceFileText>>
}

const MAX_CACHE_ENTRIES = 64
const MAX_EXCERPT_LINES = 5
const HEADING_SCAN_LIMIT = 80
const MAX_LINE_CHARS = 180
const MARKDOWN_EXTENSIONS = /\.(?:md|markdown|mdx|txt)$/iu

function basenameOf(path: string): string {
  const normalized = path.replace(/[\\/]+$/u, '')
  const parts = normalized.split(/[\\/]/u)
  return parts.at(-1) ?? path
}

function truncateLine(line: string): string {
  const trimmed = line.replace(/\r$/u, '')
  if (trimmed.length <= MAX_LINE_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_LINE_CHARS - 1)}…`
}

function normalizeHeading(value: string): string {
  return value
    .trim()
    .replace(/^#+\s*/u, '')
    .toLowerCase()
    .replace(/[\s_-]+/gu, '')
}

/**
 * Slice a concise excerpt from read file lines, marking the referenced line
 * range or matched Markdown heading as highlighted.
 * @param fileName - Display filename including extension.
 * @param text - Raw paged file text returned by the Host.
 * @param startLine - 1-based line number of the first line in `text`.
 * @param target - Citation target describing line range or heading anchor.
 * @returns Structured excerpt lines, or null when the file has no visible content.
 */
export function buildFilePreviewExcerpt(
  fileName: string,
  text: string,
  startLine: number,
  target: MarkdownFilePreviewTarget,
): MarkdownFilePreviewExcerpt | null {
  const rawLines = text.split(/\r?\n/u)
  if (rawLines.length > 0 && rawLines.at(-1) === '') rawLines.pop()
  if (rawLines.length === 0) return null

  const isCode = !MARKDOWN_EXTENSIONS.test(fileName)
  const numbered = rawLines.map((line, idx) => ({ number: startLine + idx, text: line }))

  // 1. Explicit line or line-range citation (#L185-L190 / :185).
  if (target.line !== undefined) {
    const startTarget = target.line
    const endLine = target.endLine ?? startTarget
    const hitIdx = numbered.findIndex(item => item.number >= startTarget)
    const anchorIdx = hitIdx >= 0 ? hitIdx : 0
    const sliceStart = Math.max(0, anchorIdx - (endLine > startTarget ? 0 : 1))
    const slice = numbered.slice(sliceStart, sliceStart + MAX_EXCERPT_LINES)
    const lines: MarkdownFilePreviewLine[] = slice.map(item => ({
      number: item.number,
      text: truncateLine(item.text),
      highlighted: item.number >= startTarget && item.number <= endLine,
    }))
    return { fileName, lines, isCode }
  }

  // 2. Markdown heading anchor (#程序集与依赖方向) or first non-empty heading/paragraph.
  let matchIdx = -1
  if (target.heading !== undefined && target.heading.length > 0) {
    const wanted = normalizeHeading(target.heading)
    matchIdx = numbered.findIndex((item) => {
      if (!/^\s*#{1,6}\s+/u.test(item.text)) return false
      return normalizeHeading(item.text) === wanted
    })
    if (matchIdx < 0) {
      matchIdx = numbered.findIndex(item => normalizeHeading(item.text).includes(wanted))
    }
  }
  if (matchIdx < 0 && !isCode) {
    matchIdx = numbered.findIndex(item => /^\s*#{1,6}\s+\S/u.test(item.text))
  }
  if (matchIdx < 0) {
    matchIdx = numbered.findIndex(item => item.text.trim().length > 0)
  }
  const sliceStart = Math.max(0, matchIdx)
  const slice = numbered.slice(sliceStart, sliceStart + MAX_EXCERPT_LINES)
  const highlightHeading = !isCode || (target.heading !== undefined && matchIdx >= 0)
  const lines: MarkdownFilePreviewLine[] = slice.map((item, idx) => ({
    number: item.number,
    text: truncateLine(item.text),
    highlighted: highlightHeading && idx === 0 && item.text.trim().length > 0,
  }))
  return { fileName, lines, isCode }
}

/**
 * Create a bounded LRU-cached citation preview loader backed by `workspaceFiles.read`.
 * @param reader - Host workspace-file reader.
 * @param sessionId - Session whose workspace resolves relative paths.
 * @param resolvePath - Resolves authored relative paths against the session directory.
 * @returns Async excerpt loader compatible with `MarkdownDelegate.filePreview.loadExcerpt`.
 */
export function createFilePreviewLoader(
  reader: WorkspaceFileExcerptReader,
  sessionId: SessionId,
  resolvePath: (path: string) => string,
): (target: MarkdownFilePreviewTarget, signal: AbortSignal) => Promise<MarkdownFilePreviewExcerpt | null> {
  const cache = new Map<string, MarkdownFilePreviewExcerpt | null>()

  const remember = (key: string, value: MarkdownFilePreviewExcerpt | null): void => {
    if (cache.has(key)) cache.delete(key)
    cache.set(key, value)
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
  }

  return async (target, signal) => {
    const resolvedPath = resolvePath(target.path)
    const cacheKey = `${resolvedPath}#${target.line ?? ''}-${target.endLine ?? ''}#${target.heading ?? ''}`
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey) ?? null
      remember(cacheKey, cached)
      return cached
    }
    const offset = target.line !== undefined ? Math.max(1, target.line - 1) : 1
    const limit = target.line !== undefined
      ? Math.max(MAX_EXCERPT_LINES + 2, (target.endLine ?? target.line) - offset + 3)
      : HEADING_SCAN_LIMIT
    const result = await reader.read(sessionId, resolvedPath, { offset, limit }, signal)
    if (signal.aborted) return null
    if (!result.ok) {
      remember(cacheKey, null)
      return null
    }
    const excerpt = buildFilePreviewExcerpt(basenameOf(resolvedPath), result.value.text, result.value.offset, target)
    remember(cacheKey, excerpt)
    return excerpt
  }
}
