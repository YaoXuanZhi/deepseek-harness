/**
 * Embedded interactive xterm.js sign-in terminal surface for ACP subscription providers.
 *
 * Streams live PTY output via `(output, outputOffset)` deltas, syncs light/dark theme colors
 * from DSH CSS tokens, makes `https://` authorization links clickable, and forwards user
 * keystrokes and terminal dimensions back to `AcpLlmService`.
 *
 * @module @deepseek-ai/dsh-client-ui-settings-acp/client/ProviderAuthTerminal
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import css from './ProviderAuthTerminal.module.css'

/** Props for the embedded ACP sign-in terminal surface. */
export interface ProviderAuthTerminalProps {
  /** Active PTY session identifier. */
  readonly sessionId: string
  /** Rolling UTF-8 PTY output buffer. */
  readonly output: string
  /** Monotonic cumulative UTF-8 character offset. */
  readonly outputOffset: number
  /** Current PTY session lifecycle state. */
  readonly status: 'running' | 'exited' | 'failed'
  /** Accessible label for the terminal input surface. */
  readonly ariaLabel: string
  /** Callback invoked when the user types or pastes into the terminal. */
  readonly onInput: (data: string) => void
  /** Callback invoked when the terminal grid dimensions change. */
  readonly onResize: (cols: number, rows: number) => void
}

const FOCUS_REPORTS = new Set(['\x1b[I', '\x1b[O'])
const TERMINAL_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const LINE_URL_REGEX = /https:\/\/[^\s"'<>`)\]]+/g

/**
 * Interactive in-page PTY terminal surface rendered inside Settings -> Models.
 * @param props - PTY stream state and input/resize callbacks.
 * @returns Mounted xterm.js container (with graceful text fallback in non-canvas test DOMs).
 */
export function ProviderAuthTerminal(props: ProviderAuthTerminalProps): ReactNode {
  const {
    sessionId,
    output,
    outputOffset,
    status,
    ariaLabel,
    onInput,
    onResize,
  } = props

  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const writtenOffsetRef = useRef(0)
  const activeSessionRef = useRef(sessionId)
  const callbacksRef = useRef({ onInput, onResize, status })
  callbacksRef.current = { onInput, onResize, status }

  const [fallbackMode, setFallbackMode] = useState(false)

  useEffect(() => {
    const node = hostRef.current
    if (!node) return

    let xterm: Terminal | null = null
    let fit: FitAddon | null = null
    let inputDisposable: { dispose: () => void } | null = null
    let linkDisposable: { dispose: () => void } | null = null
    let resizeObserver: ResizeObserver | null = null
    let themeObserver: MutationObserver | null = null

    try {
      xterm = new Terminal({
        cursorBlink: true,
        fontSize: 12.5,
        lineHeight: 1.35,
        fontFamily: TERMINAL_FONT_STACK,
        minimumContrastRatio: 4.5,
        scrollback: 1_500,
        convertEol: true,
      })
      fit = new FitAddon()
      xterm.loadAddon(fit)
      xterm.open(node)

      const syncTheme = (): void => {
        if (!xterm) return
        const computed = getComputedStyle(node)
        const bg = computed.backgroundColor || '#14161a'
        const fg = computed.color || '#e6e8ee'
        xterm.options.theme = {
          background: bg,
          foreground: fg,
          cursor: fg,
          cursorAccent: bg,
          selectionBackground: 'rgba(127, 138, 160, 0.3)',
        }
      }
      syncTheme()

      if (typeof MutationObserver !== 'undefined') {
        themeObserver = new MutationObserver(syncTheme)
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme', 'class', 'style'],
        })
      }

      const terminalInstance = xterm
      linkDisposable = terminalInstance.registerLinkProvider({
        provideLinks(bufferLineNumber, callback) {
          const line = terminalInstance.buffer.active.getLine(bufferLineNumber - 1)
          if (!line) {
            callback(undefined)
            return
          }
          const text = line.translateToString(true)
          const links: {
            range: { start: { x: number; y: number }; end: { x: number; y: number } }
            text: string
            activate: () => void
          }[] = []
          LINE_URL_REGEX.lastIndex = 0
          let match = LINE_URL_REGEX.exec(text)
          while (match !== null) {
            const urlText = match[0].replace(/[.,;:!?]+$/, '')
            const startX = match.index + 1
            const endX = match.index + urlText.length
            links.push({
              range: {
                start: { x: startX, y: bufferLineNumber },
                end: { x: endX, y: bufferLineNumber },
              },
              text: urlText,
              activate: () => {
                window.open(urlText, '_blank', 'noopener,noreferrer')
              },
            })
            match = LINE_URL_REGEX.exec(text)
          }
          callback(links.length > 0 ? links : undefined)
        },
      })

      xterm.textarea?.setAttribute('aria-label', ariaLabel)
      inputDisposable = xterm.onData((data) => {
        if (FOCUS_REPORTS.has(data)) return
        if (callbacksRef.current.status !== 'running') return
        callbacksRef.current.onInput(data)
      })

      const fitAndReport = (): void => {
        if (!xterm || !fit || node.clientWidth === 0 || node.clientHeight === 0) return
        const dims = fit.proposeDimensions()
        if (!dims || dims.cols < 20 || dims.rows < 4) return
        if (xterm.cols !== dims.cols || xterm.rows !== dims.rows) {
          xterm.resize(dims.cols, dims.rows)
        }
        if (callbacksRef.current.status === 'running') {
          callbacksRef.current.onResize(dims.cols, dims.rows)
        }
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(fitAndReport)
        resizeObserver.observe(node)
      }
      fitAndReport()

      termRef.current = xterm
      fitRef.current = fit
      writtenOffsetRef.current = 0
      activeSessionRef.current = sessionId
    } catch (_initErr) {
      // Non-canvas DOM environments (such as unit test JSDOM) render the accessible fallback below.
      setFallbackMode(true)
    }

    return () => {
      resizeObserver?.disconnect()
      themeObserver?.disconnect()
      inputDisposable?.dispose()
      linkDisposable?.dispose()
      xterm?.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [ariaLabel, sessionId])

  useEffect(() => {
    const xterm = termRef.current
    if (!xterm) return
    if (activeSessionRef.current !== sessionId) {
      xterm.reset()
      writtenOffsetRef.current = 0
      activeSessionRef.current = sessionId
    }
    const delta = outputOffset - writtenOffsetRef.current
    if (delta > 0 && delta <= output.length) {
      xterm.write(output.slice(-delta))
    } else if (delta !== 0) {
      xterm.reset()
      if (output.length > 0) xterm.write(output)
    }
    writtenOffsetRef.current = outputOffset
  }, [output, outputOffset, sessionId])

  useEffect(() => {
    const xterm = termRef.current
    if (!xterm) return
    xterm.options.disableStdin = status !== 'running'
    if (status === 'running') {
      xterm.focus()
    }
  }, [status])

  if (fallbackMode) {
    return (
      <div className={css.embeddedTerminalFallback} data-acp-auth-terminal={sessionId}>
        <pre className={css.embeddedTerminalPre}>{output}</pre>
        {status === 'running' && (
          <input
            type="text"
            aria-label={ariaLabel}
            className={css.fallbackInput}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') {
                onInput(`${ev.currentTarget.value}\r`)
                ev.currentTarget.value = ''
              }
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div
      ref={hostRef}
      className={css.embeddedTerminalSurface}
      data-acp-auth-terminal={sessionId}
    />
  )
}
