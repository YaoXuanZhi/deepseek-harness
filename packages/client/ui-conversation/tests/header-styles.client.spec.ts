/** Conversation navigation spacing preserves the right-pane header alignment. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/skeleton/ConversationRoot.module.css', import.meta.url), 'utf8')

describe('conversation header geometry', () => {
  it('keeps the single-row borderless header at the 48px height', () => {
    const header = css.match(/\.header\s*\{([^}]*)\}/)?.[1]
    expect(header).toContain('min-height: 48px')
    expect(header).toContain('border-bottom: none')
    expect(css.match(/\.tab\s*\{([^}]*)\}/)?.[1]).toContain('height: 24px')
  })

  it('clips overflowing title actions and fades them inside the gap before the next control', () => {
    const cluster = css.match(/\.titleCluster\s*\{([^}]*)\}/)?.[1]
    expect(cluster).toContain('overflow: clip')
    expect(cluster).toContain('--title-cluster-fade: 20px')
    expect(cluster).toContain('margin: -4px calc(-1 * var(--title-cluster-fade)) -4px -4px')
    expect(cluster).toContain('padding: 4px var(--title-cluster-fade) 4px 4px')
    expect(cluster).toContain('mask-image: linear-gradient(to left, transparent calc(0.3 * var(--title-cluster-fade)), #000 var(--title-cluster-fade))')
    expect(css.match(/^\.headerUtilities\s*\{([^}]*)\}/m)?.[1]).toContain('margin-left: 20px')
    expect(css.match(/\.titleCluster:has\(\+ \.headerUtilities:empty\)\s*\{([^}]*)\}/)?.[1]).toContain('--title-cluster-fade: 8px')
    expect(css.match(/^\.headerCorner\s*\{([^}]*)\}/m)?.[1]).toContain('margin-left: 8px')
  })

  it('places view labels inside a compact inline pill switcher', () => {
    expect(css.match(/\.viewTabs\s*\{([^}]*)\}/)?.[1]).toContain('display: inline-flex')
    expect(css.match(/\.tabs\s*\{([^}]*)\}/)?.[1]).toContain('display: inline-flex')
  })
})
