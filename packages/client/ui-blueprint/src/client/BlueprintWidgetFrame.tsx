import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type {
  BlueprintPlacementHeightMode,
  BlueprintWidgetDetail,
  BlueprintWidgetStatus,
} from '@deepseek-ai/dsh-blueprint/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { BlueprintLocaleKey } from './locales.ts'
import type { WidgetFilesCallOutcome } from './widget-files-host.ts'
import css from './BlueprintWidgetFrame.module.css'

/** Action callbacks and state for a Widget tile placed on a Dashboard (`看板`). */
export interface BlueprintTileControlsProps {
  readonly heightMode: BlueprintPlacementHeightMode
  readonly isFullWidth: boolean
  readonly showWidthToggle?: boolean | undefined
  readonly onToggleHeightMode: () => void
  readonly onToggleWidth: () => void
  readonly onRemoveTile: () => void
}

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
  readonly explicitHeight?: number | undefined
  readonly minAutoHeight?: number | undefined
  readonly maxAutoHeight?: number | undefined
  readonly contentZoom?: number | undefined
  readonly interacting?: boolean | undefined
  readonly isPinned?: boolean | undefined
  readonly tileControls?: BlueprintTileControlsProps | undefined
  readonly onMeasuredHeight?: ((height: number) => void) | undefined
  readonly onEnsureDetail: (widgetId: string) => void
  readonly onSaveInput: (widgetId: string, input: Readonly<Record<string, JsonValue>>) => void
  readonly onEmitEvent: (widgetId: string, event: string, data: JsonValue) => void
  readonly onFilesCall?: ((widgetId: string, method: string, args: unknown) => Promise<WidgetFilesCallOutcome>) | undefined
  readonly onTogglePinWindow?: (() => void) | undefined
  readonly onPinToDashboard?: (() => void) | undefined
  readonly onOpenInRight?: (() => void) | undefined
  readonly t: (key: BlueprintLocaleKey, params?: Record<string, string | number>) => string
}

const DEFAULT_MIN_HEIGHT = 180
const DEFAULT_MAX_HEIGHT = 720

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Sandboxed `<iframe sandbox="allow-scripts">` rendering a Blueprint Widget with
 * live `window.DaimonWidget` / `window.DaimonCanvas` `postMessage` synchronization.
 * @param props - Widget metadata, sizing controls, host callbacks, and localized copy.
 * @returns Rendered Widget card element.
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
  explicitHeight,
  minAutoHeight,
  maxAutoHeight,
  contentZoom,
  interacting,
  isPinned,
  tileControls,
  onMeasuredHeight,
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
  const measuredCallbackRef = useRef(onMeasuredHeight)
  measuredCallbackRef.current = onMeasuredHeight

  const minH = minAutoHeight ?? DEFAULT_MIN_HEIGHT
  const maxH = maxAutoHeight ?? DEFAULT_MAX_HEIGHT
  const [rawContentHeight, setRawContentHeight] = useState<number>(320)

  const html = detail?.assembledHtml ?? fallbackHtml
  const effectiveStatus = detail?.status ?? status ?? 'idle'
  const displayTitle = detail?.title ?? title
  const zoom = contentZoom !== undefined && Number.isFinite(contentZoom) && contentZoom > 0
    ? Math.min(1.5, Math.max(0.6, contentZoom))
    : 1

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
          const ceilH = Math.ceil(rawH)
          setRawContentHeight(ceilH)
          measuredCallbackRef.current?.(ceilH)
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

  const autoFrameHeight = Math.min(maxH, Math.max(minH, rawContentHeight))
  const visualAutoHeight = Math.max(minH, Math.ceil(autoFrameHeight * zoom))
  const isPositioned = fillHeight === true || explicitHeight !== undefined

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
          {tileControls !== undefined && (
            <button
              type="button"
              className={clsx(css.actionBtn, tileControls.heightMode === 'fill' && css.actionBtnActive)}
              onClick={tileControls.onToggleHeightMode}
            >
              {tileControls.heightMode === 'auto' ? t('canvas.heightFill') : t('canvas.heightAuto')}
            </button>
          )}
          {tileControls?.showWidthToggle === true && (
            <button
              type="button"
              className={css.actionBtn}
              onClick={tileControls.onToggleWidth}
            >
              {tileControls.isFullWidth ? t('canvas.resizeCompact') : t('canvas.resizeFull')}
            </button>
          )}
          {onTogglePinWindow !== undefined && (
            <button
              type="button"
              className={clsx(css.actionBtn, isPinned && css.actionBtnActive)}
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
          {tileControls !== undefined && (
            <button
              type="button"
              className={css.actionBtn}
              onClick={tileControls.onRemoveTile}
            >
              {t('canvas.removeTile')}
            </button>
          )}
        </div>
      </div>
      {html !== undefined && html.trim() !== '' ? (
        <div
          className={clsx(css.frameViewport, fillHeight && css.frameViewportFill)}
          style={
            fillHeight
              ? undefined
              : { height: `${String(explicitHeight ?? visualAutoHeight)}px` }
          }
        >
          <iframe
            ref={iframeRef}
            title={displayTitle}
            sandbox="allow-scripts"
            srcDoc={html}
            className={clsx(
              css.frame,
              isPositioned && css.framePositioned,
              interacting && css.frameInteracting,
            )}
            style={
              isPositioned
                ? {
                  width: zoom === 1 ? '100%' : `${String(100 / zoom)}%`,
                  height: zoom === 1 ? '100%' : `${String(100 / zoom)}%`,
                  transform: zoom === 1 ? undefined : `scale(${String(zoom)})`,
                  transformOrigin: zoom === 1 ? undefined : '0 0',
                }
                : {
                  width: zoom === 1 ? '100%' : `${String(100 / zoom)}%`,
                  height: `${String(autoFrameHeight)}px`,
                  transform: zoom === 1 ? undefined : `scale(${String(zoom)})`,
                  transformOrigin: zoom === 1 ? undefined : '0 0',
                }
            }
          />
        </div>
      ) : (
        <div className={css.placeholder}>
          {detail === undefined ? t('widget.loading') : t('widget.unavailable')}
        </div>
      )}
    </div>
  )
}
