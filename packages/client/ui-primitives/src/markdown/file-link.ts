/** Local Markdown destinations accepted by the file-preview callback. */

/**
 * Recognize a relative, rooted, or absolute Windows path before URL parsing.
 * @param value - A decoded or URI-normalized destination.
 * @returns Whether a filesystem prefix makes the destination unambiguous.
 */
export function isExplicitFilePath(value: string): boolean {
  return /^(?:[\\/]|\.{1,2}[\\/]|[a-z]:[\\/])/i.test(value)
}

/** Parsed local file destination with optional line range or heading anchor. */
export interface ParsedFileLink {
  readonly path: string
  readonly line?: number | undefined
  readonly endLine?: number | undefined
  readonly heading?: string | undefined
}

/**
 * Decode a file destination with a fragment, line range, or line/column suffix.
 * Explicit relative, slash/backslash-rooted, and Windows drive paths take
 * precedence over URLs. Other parseable absolute URLs are not file links.
 * Fragments take precedence over colon suffixes; invalid locations open the
 * file without selecting a line. Columns are consumed but not selected.
 * Percent-encode literal `?`, `#`, and numeric colon suffixes in filenames.
 * @param value - Parsed Markdown link destination.
 * @returns A local path and optional line range or heading anchor, or undefined for URLs,
 * fragment-only links, queries, malformed escapes, or control characters.
 */
export function parseFileLink(value: string): ParsedFileLink | undefined {
  const hash = value.indexOf('#')
  const destination = hash < 0 ? value : value.slice(0, hash)
  if (destination.includes('?')) return undefined
  let path: string
  try {
    path = decodeURIComponent(destination)
  } catch (_error) {
    // Malformed percent escapes cannot identify a file unambiguously.
    return undefined
  }
  if (path.length === 0 || /[\u0000-\u001f\u007f]/.test(path)) return undefined
  if (/^\/[a-z]:[\\/]/i.test(path)) path = path.slice(1)
  if (!isExplicitFilePath(path) && URL.canParse(path)) return undefined
  const suffix = hash < 0 ? /:(\d+)(?::\d+|-(\d+))?$/.exec(destination) : null
  if (suffix !== null) path = path.slice(0, -suffix[0].length)
  if (path.length === 0) return undefined
  const fragment = hash < 0 ? '' : value.slice(hash + 1)
  const match = suffix ?? (hash < 0 ? null : /^L(\d+)(?:-L(\d+))?$/.exec(fragment))
  if (match === null) {
    if (fragment.length === 0) return { path }
    try {
      const heading = decodeURIComponent(fragment).trim()
      return heading.length > 0 ? { path, heading } : { path }
    } catch (_error) {
      // Malformed fragment escapes keep the decoded file path without a heading anchor.
      return { path }
    }
  }
  const line = Number(match[1])
  const end = match[2] === undefined ? line : Number(match[2])
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(end) || line < 1 || end < line) return { path }
  return end > line ? { path, line, endLine: end } : { path, line }
}
