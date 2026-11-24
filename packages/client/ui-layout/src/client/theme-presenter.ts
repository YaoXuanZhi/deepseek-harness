/**
 * Global theme DOM applier: projects the resolved ThemeSnapshot onto the
 * document — `html { color-scheme }` for native UA chrome (scrollbars, form
 * controls), `body[data-ds-dark-theme]` for the token palette, the active
 * theme's alias-token overrides as inline CSS variables on body, the content
 * font-size axis (`--dsh-content-font-size`), the code and terminal sizes
 * (`--dsh-code-font-size`, `--dsh-terminal-font-size`), the user font lists
 * (`--dsh-font-family-<role>`), `html[data-ds-theme-source]`
 * for native-chrome mirroring, and one presenter-owned
 * `meta[name="theme-color"]` for surrounding browser UI. Pure DOM writes, no
 * React involvement; the presenter only ever retracts what it wrote itself,
 * so foreign attributes, metadata, and inline styles survive.
 */
import type { FontRole, ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Body attribute selecting the dark base palette in the token stylesheets. */
export const DARK_ATTRIBUTE = 'data-ds-dark-theme'

/**
 * Root attribute publishing the theme source (`light`, `dark`, or `system`)
 * for host shells that mirror it into the native theme (the Electron preload
 * forwards it to `nativeTheme.themeSource`, so native chrome, renderer
 * `prefers-color-scheme` queries, and Platform login links follow the app
 * palette on every platform). `system` only when the preference is `system`;
 * a fixed preference (including registered theme ids) publishes its resolved
 * scheme.
 */
export const THEME_SOURCE_ATTRIBUTE = 'data-ds-theme-source'

/** Body variable carrying the user's content font size in px. */
export const CONTENT_FONT_SIZE_VARIABLE = '--dsh-content-font-size'

/** Body variables carrying the user's font sizes in px by role. */
const FONT_SIZE_VARIABLES = {
  text: CONTENT_FONT_SIZE_VARIABLE,
  code: '--dsh-code-font-size',
  terminal: '--dsh-terminal-font-size',
} as const satisfies Record<FontRole, string>

/** Body variables carrying the user's normalized font lists; absent selects the built-in stack. */
const FONT_FAMILY_VARIABLES = {
  text: '--dsh-font-family-text',
  code: '--dsh-font-family-code',
  terminal: '--dsh-font-family-terminal',
} as const satisfies Record<FontRole, string>

/** Root attribute marking an active circular ViewTransition palette switch. */
export const THEME_TRANSITION_ATTRIBUTE = 'data-dsh-theme-transition'

const THEME_SWITCH_X = '--dsh-theme-switch-x'
const THEME_SWITCH_Y = '--dsh-theme-switch-y'
const THEME_SWITCH_R = '--dsh-theme-switch-r'

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<unknown> }
}

/** Applies theme snapshots to the document; one instance per plugin fiber. */
export class ThemePresenter {
  /** Token names this presenter wrote in the last apply (its retraction set). */
  private appliedTokens: string[] = []
  /** The single metadata node this presenter inserts and removes. */
  private readonly themeColorMeta: HTMLMetaElement
  private styleObserver: MutationObserver | undefined
  private appliedScheme: 'light' | 'dark' | undefined
  private lastPointer: { x: number; y: number } | undefined
  private readonly onPointerDown = (event: PointerEvent): void => {
    this.lastPointer = { x: event.clientX, y: event.clientY }
  }

  /** Create the presenter-owned metadata node before the first snapshot arrives. */
  constructor() {
    this.themeColorMeta = document.createElement('meta')
    this.themeColorMeta.name = 'theme-color'
  }

  /** Observe stylesheet installation and pointer coordinates after theme initialization. */
  start(): void {
    if (this.styleObserver !== undefined) return
    document.addEventListener('pointerdown', this.onPointerDown, { capture: true, passive: true })
    this.styleObserver = new MutationObserver((changes) => {
      const isStyle = (node: Node): boolean => node.nodeName === 'STYLE'
      if (changes.some(change => isStyle(change.target) || change.target.parentNode?.nodeName === 'STYLE'
        || [...change.addedNodes, ...change.removedNodes].some(isStyle))) this.refreshThemeColor()
    })
    this.styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true })
  }

  /**
   * Project a snapshot onto the document: set root `color-scheme` and the body
   * palette attribute from `active.colorScheme` (never the id — `system` is
   * resolved upstream), publish the font sizes and font lists, then replace the
   * previously applied token variables with `active.tokens`. When switching
   * between light and dark interactively with View Transitions enabled, animate
   * the palette flip from the last pointer origin.
   * @param snapshot - resolved theme snapshot from ctx.theme.
   */
  apply(snapshot: ThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme
    const previousScheme = this.appliedScheme
    this.appliedScheme = scheme
    const doc = document as ViewTransitionDocument
    const canTransition = previousScheme !== undefined
      && previousScheme !== scheme
      && typeof doc.startViewTransition === 'function'
      && (typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: no-preference)').matches)
    if (!canTransition) {
      this.commit(snapshot)
      return
    }
    const root = document.documentElement
    const x = this.lastPointer?.x ?? Math.round(window.innerWidth / 2)
    const y = this.lastPointer?.y ?? Math.round(window.innerHeight / 2)
    const radius = Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)))
    root.style.setProperty(THEME_SWITCH_X, `${x}px`)
    root.style.setProperty(THEME_SWITCH_Y, `${y}px`)
    root.style.setProperty(THEME_SWITCH_R, `${radius}px`)
    root.setAttribute(THEME_TRANSITION_ATTRIBUTE, '')
    const clearTransition = (): void => {
      root.removeAttribute(THEME_TRANSITION_ATTRIBUTE)
      root.style.removeProperty(THEME_SWITCH_X)
      root.style.removeProperty(THEME_SWITCH_Y)
      root.style.removeProperty(THEME_SWITCH_R)
    }
    const transition = doc.startViewTransition(() => { this.commit(snapshot) })
    void transition.finished.then(clearTransition, clearTransition)
  }

  private commit(snapshot: ThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme
    document.documentElement.style.colorScheme = scheme
    document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE,
      snapshot.preference === 'system' ? 'system' : scheme)
    const body = document.body
    if (scheme === 'dark') body.setAttribute(DARK_ATTRIBUTE, '')
    else body.removeAttribute(DARK_ATTRIBUTE)
    for (const [role, name] of Object.entries(FONT_SIZE_VARIABLES)) {
      body.style.setProperty(name, `${snapshot.fontSizes[role as FontRole]}px`)
    }
    for (const [kind, name] of Object.entries(FONT_FAMILY_VARIABLES)) {
      const list = snapshot.fontFamilies[kind as FontRole]
      if (list === '') body.style.removeProperty(name)
      else body.style.setProperty(name, list)
    }
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value)
      this.appliedTokens.push(name)
    }
    this.refreshThemeColor()
  }

  private refreshThemeColor(): void {
    this.themeColorMeta.content = getComputedStyle(document.body).backgroundColor
    if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta)
  }

  /**
   * Retract root color-scheme, the theme-source attribute, the palette
   * attribute, token variables, the font sizes, font lists, and the owned metadata node.
   */
  dispose(): void {
    document.removeEventListener('pointerdown', this.onPointerDown, { capture: true })
    this.styleObserver?.disconnect()
    this.styleObserver = undefined
    this.appliedScheme = undefined
    const root = document.documentElement
    root.style.removeProperty('color-scheme')
    root.removeAttribute(THEME_SOURCE_ATTRIBUTE)
    root.removeAttribute(THEME_TRANSITION_ATTRIBUTE)
    root.style.removeProperty(THEME_SWITCH_X)
    root.style.removeProperty(THEME_SWITCH_Y)
    root.style.removeProperty(THEME_SWITCH_R)
    const body = document.body
    body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of Object.values(FONT_SIZE_VARIABLES)) body.style.removeProperty(name)
    for (const name of Object.values(FONT_FAMILY_VARIABLES)) body.style.removeProperty(name)
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    this.themeColorMeta.remove()
  }
}
