import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { BlueprintWidgetDetail, BlueprintWidgetStatus } from '@deepseek-ai/dsh-blueprint/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { BlueprintLocaleKey } from './locales.ts'
import type { WidgetFilesCallOutcome } from './widget-files-host.ts'
import css from './BlueprintWidgetFrame.module.css'

/** Props accepted by the sandboxed `BlueprintWidgetFrame` host component. */
export interface BlueprintWidgetFrameProps {
  readonly widgetId: string
  readonly title: string
  readonly fallbackHtml?: string | undefined
  readonly detail?: BlueprintWidgetDetail | undefined
  readonly status?: BlueprintWidgetStatus | undefined
  readonly theme: 'light' | 'dark'
  readonly locale: string
  readonly fillHeight?: boolean | undefined
  readonly isPinned?: boolean | undefined
  readonly extraActions?: ReactNode
  readonly onEnsureDetail: (widgetId: string) => void
  readonly onSaveInput: (widgetId: string, input: Readonly<Record<string, JsonValue>>) => void
  readonly onEmitEvent: (widgetId: string, event: string, data: JsonValue) => void
  readonly onFilesCall?: ((widgetId: string, method: string, args: unknown) => Promise<WidgetFilesCallOutcome>) | undefined
  readonly onTogglePinWindow?: (() => void) | undefined
  readonly onPinToDashboard?: (() => void) | undefined
  readonly onOpenInRight?: (() => void) | undefined
  readonly t: (key: BlueprintLocaleKey, params?: Record<string, string | number>) => string
}

const INLINE_MIN_HEIGHT = 180
const INLINE_MAX_HEIGHT = 720

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Sandboxed `<iframe sandbox="allow-scripts">` rendering a Blueprint Widget with
 * live `window.DaimonWidget` / `window.DaimonCanvas` `postMessage` synchronization.
 */
export function BlueprintWidgetFrame({
  widgetId,
  title,
  fallbackHtml,
  detail,
  status,
  theme,
  locale,
  fillHeight,
  isPinned,
  extraActions,
  onEnsureDetail,
  onSaveInput,
  onEmitEvent,
  onFilesCall,
  onTogglePinWindow,
  onPinToDashboard,
  onOpenInRight,
  t,
}: BlueprintWidgetFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number>(300)

  const html = detail?.assembledHtml ?? fallbackHtml
  const effectiveStatus = detail?.status ?? status ?? 'idle'
  const displayTitle = detail?.title ?? title

  useEffect(() => {
    if (detail === undefined && widgetId) {
      onEnsureDetail(widgetId)
    }
  }, [detail, onEnsureDetail, widgetId])

  useEffect(() => {
    const postSync = (): void => {
      const win = iframeRef.current?.contentWindow
      if (!win) return
      win.postMessage({
        channel: 'daimon-widget-host',
        widgetId,
        type: 'sync',
        payload: {
          theme,
          locale,
          slots: detail?.latestData ?? {},
          savedInput: detail?.savedInput ?? {},
          status: effectiveStatus,
          statusMessage: detail?.statusMessage ?? null,
        },
      }, '*')
    }
    postSync()
  }, [detail?.latestData, detail?.savedInput, detail?.statusMessage, effectiveStatus, locale, theme, widgetId])

  useEffect(() => {
    const onMessage = (ev: MessageEvent): void => {
      if (iframeRef.current && ev.source !== iframeRef.current.contentWindow) return
      const msg: unknown = ev.data
      if (!isRecord(msg) || msg.channel !== 'daimon-widget') return
      if (typeof msg.widgetId === 'string' && msg.widgetId !== widgetId) return
      const payload = isRecord(msg.payload) ? msg.payload : {}

      if (msg.type === 'ready') {
        iframeRef.current?.contentWindow?.postMessage({
          channel: 'daimon-widget-host',
          widgetId,
          type: 'init',
          payload: {
            theme,
            locale,
            slots: detail?.latestData ?? {},
            savedInput: detail?.savedInput ?? {},
            status: effectiveStatus,
            statusMessage: detail?.statusMessage ?? null,
          },
        }, '*')
      } else if (msg.type === 'resize') {
        const rawH = typeof payload.height === 'number' ? payload.height : 0
        if (rawH > 0) {
          const clamped = Math.min(INLINE_MAX_HEIGHT, Math.max(INLINE_MIN_HEIGHT, Math.ceil(rawH)))
          setMeasuredHeight(clamped)
        }
      } else if (msg.type === 'saveInput') {
        if (isRecord(payload.input)) {
          onSaveInput(widgetId, payload.input as Readonly<Record<string, JsonValue>>)
        }
      } else if (msg.type === 'emit') {
        const evName = typeof payload.event === 'string' ? payload.event : 'submit'
        onEmitEvent(widgetId, evName, (payload.data ?? null) as JsonValue)
      } else if (msg.type === 'files-call' && onFilesCall && typeof payload.requestId === 'string' && typeof payload.method === 'string') {
        const reqId = payload.requestId
        void onFilesCall(widgetId, payload.method, payload.args).then((outcome) => {
          iframeRef.current?.contentWindow?.postMessage({
            channel: 'daimon-widget-host',
            widgetId,
            type: 'files-result',
            payload: outcome.ok
              ? { requestId: reqId, ok: true, result: outcome.result }
              : { requestId: reqId, ok: false, error: outcome.error },
          }, '*')
        })
      } else if (msg.type === 'openCanvas' && onOpenInRight) {
        onOpenInRight()
      }
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [
    detail?.latestData,
    detail?.savedInput,
    detail?.statusMessage,
    effectiveStatus,
    locale,
    onEmitEvent,
    onFilesCall,
    onOpenInRight,
    onSaveInput,
    theme,
    widgetId,
  ])

  const statusText = effectiveStatus === 'running'
    ? t('widget.status.running')
    : effectiveStatus === 'error'
      ? t('widget.status.error')
      : effectiveStatus === 'degraded'
        ? t('widget.status.degraded')
        : effectiveStatus === 'needs_input'
          ? t('widget.status.needsInput')
          : null

  return (
    <div className={clsx(css.shell, fillHeight && css.shellTile)}>
      <div className={css.toolbar}>
        <div className={css.titleGroup}>
          <span className={css.title}>{displayTitle}</span>
          {statusText !== null && (
            <span
              className={clsx(
                css.statusPill,
                effectiveStatus === 'error' && css.statusError,
                (effectiveStatus === 'degraded' || effectiveStatus === 'needs_input') && css.statusWarn,
              )}
            >
              {statusText}
            </span>
          )}
        </div>
        <div className={css.actions}>
          {onTogglePinWindow !== undefined && (
            <button
              type="button"
              className={css.actionBtn}
              aria-pressed={isPinned === true}
              onClick={onTogglePinWindow}
            >
              {isPinned ? t('widget.unpinWindow') : t('widget.pinWindow')}
            </button>
          )}
          {onPinToDashboard !== undefined && (
            <button type="button" className={css.actionBtn} onClick={onPinToDashboard}>
              {t('widget.pinToDashboard')}
            </button>
          )}
          {onOpenInRight !== undefined && (
            <button type="button" className={css.actionBtn} onClick={onOpenInRight}>
              {t('widget.openInRight')}
            </button>
          )}
          {extraActions}
        </div>
      </div>
      {html !== undefined && html.trim() !== '' ? (
        <iframe
          ref={iframeRef}
          title={displayTitle}
          sandbox="allow-scripts"
          srcDoc={html}
          className={clsx(css.frame, fillHeight && css.frameFill)}
          style={fillHeight ? undefined : { height: `${String(measuredHeight)}px` }}
        />
      ) : (
        <div className={css.placeholder}>
          {detail === undefined ? t('widget.loading') : t('widget.unavailable')}
        </div>
      )}
    </div>
  )
}
