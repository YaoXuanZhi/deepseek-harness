import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { HocShare, InjectFace, PropsLocale, PropsRuntime, SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import type { } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { BlueprintWidgetStatus } from '@deepseek-ai/dsh-blueprint/client'
import { BlueprintWidgetFrame } from './BlueprintWidgetFrame.tsx'
import { selectBlueprintTurnCards } from './turn-blueprint.ts'
import type { BlueprintViewInjected } from './index.ts'
import type { BlueprintLocaleKey } from './locales.ts'
import css from './BlueprintToolViews.module.css'

/** Shared composed props for keyed Blueprint tool views. */
export type BlueprintToolViewProps =
  PropsRuntime<'tool.call.toolview'> & InjectFace<BlueprintViewInjected> & PropsLocale<'blueprint'>

/** Composed props for persistent Turn-tail Blueprint cards. */
export type BlueprintTurnTailProps =
  PropsRuntime<'conversation.chat.turnTail'> & InjectFace<BlueprintViewInjected> & PropsLocale<'blueprint'>

/** Composed props for the `daimon-canvas` Markdown fence card. */
export type DaimonCanvasFenceProps =
  PropsRuntime<'conversation.chat.markdown.fence'>
  & HocShare<SlotMap['conversation.chat.markdown.fence']>
  & InjectFace<BlueprintViewInjected>
  & PropsLocale<'blueprint'>

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function DashboardGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.35" />
      <rect x="9.8" y="2.2" width="6" height="3.8" rx="1.3" stroke="currentColor" strokeWidth="1.35" />
      <rect x="9.8" y="7.6" width="6" height="8.2" rx="1.5" stroke="currentColor" strokeWidth="1.35" />
      <rect x="2.2" y="9.8" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  )
}

/**
 * Keyed `Widget` tool view: renders live `BlueprintWidgetFrame` inline when
 * `action === 'show'` and compact status pills for `create`/`update`/`validate`.
 */
export function BlueprintWidgetToolView(props: BlueprintToolViewProps): ReactNode {
  const {
    phase,
    block,
    useBlueprintState,
    useBlueprintTheme,
    usePinnedWidgetIds,
    localeCode,
    ensureWidget,
    saveWidgetInput,
    emitWidgetEvent,
    handleWidgetFilesCall,
    togglePinWindow,
    pinWidgetToDashboard,
    openWidgetInRight,
    t,
  } = props
  const bp = useBlueprintState(s => s)
  const theme = useBlueprintTheme(s => s)
  const pinnedIds = usePinnedWidgetIds(ids => ids)

  const meta = phase === 'result' ? asRecord(block.meta) : undefined
  const argAction = block.args.text('action')
  const argId = block.args.text('id')
  const argTitle = block.args.text('title')
  const action = typeof meta?.action === 'string'
    ? meta.action
    : (argAction ?? 'show')
  const widgetId = typeof meta?.widgetId === 'string'
    ? meta.widgetId
    : (argId ?? '')
  const title = typeof meta?.title === 'string'
    ? meta.title
    : (argTitle || widgetId || t('widget.badge'))

  if (action === 'show' && widgetId) {
    const detail = bp.widgetDetails[widgetId]
    const fallbackHtml = typeof meta?.assembledHtml === 'string' ? meta.assembledHtml : undefined
    const metaStatus = typeof meta?.status === 'string' ? (meta.status as BlueprintWidgetStatus) : undefined
    return (
      <BlueprintWidgetFrame
        widgetId={widgetId}
        title={title}
        fallbackHtml={fallbackHtml}
        detail={detail}
        status={metaStatus}
        theme={theme}
        locale={localeCode}
        isPinned={pinnedIds.includes(widgetId)}
        onEnsureDetail={ensureWidget}
        onSaveInput={saveWidgetInput}
        onEmitEvent={emitWidgetEvent}
        onFilesCall={handleWidgetFilesCall}
        onTogglePinWindow={() => { void togglePinWindow(widgetId, title, fallbackHtml) }}
        onPinToDashboard={() => { void pinWidgetToDashboard(widgetId, title) }}
        onOpenInRight={() => {
          if (typeof openWidgetInRight === 'function') openWidgetInRight(widgetId, title)
          else void pinWidgetToDashboard(widgetId, title, true)
        }}
        t={t}
      />
    )
  }

  const label = action === 'create'
    ? t('widget.created', { title })
    : action === 'update'
      ? t('widget.updated', { title })
      : action === 'validate'
        ? t('widget.validated', { id: widgetId || title })
        : `${title} (${action})`

  return (
    <div className={css.compactRow}>
      <span>{label}</span>
    </div>
  )
}

/**
 * Keyed `Canvas` tool view: renders Kimi's clickable Dashboard (`看板`) card.
 */
export function BlueprintCanvasToolView(props: BlueprintToolViewProps): ReactNode {
  const { phase, block, useBlueprintState, openDashboardInRight, t } = props
  const canvases = useBlueprintState(s => s.catalog.canvases)
  const meta = phase === 'result' ? asRecord(block.meta) : undefined
  const argId = block.args.text('id')
  const argTitle = block.args.text('title')
  const canvasId = typeof meta?.canvasId === 'string'
    ? meta.canvasId
    : (argId ?? '')
  const liveCanvas = canvases.find(c => c.id === canvasId)
  const title = liveCanvas?.title
    ?? (typeof meta?.title === 'string' ? meta.title : (argTitle ?? t('canvas.badge')))
  const count = liveCanvas?.placements.length
    ?? (typeof meta?.widgetCount === 'number' ? meta.widgetCount : 0)

  return (
    <button
      type="button"
      className={css.canvasCard}
      onClick={() => { openDashboardInRight(canvasId || undefined) }}
    >
      <div className={css.canvasLeft}>
        <span className={css.canvasGlyph}>
          <DashboardGlyph />
        </span>
        <div className={css.canvasMeta}>
          <span className={css.canvasTitle}>{title}</span>
          <span className={css.canvasSub}>
            {t('canvas.badge')} · {t('canvas.widgetCount', { count: String(count) })} · {t('canvas.subtitle')}
          </span>
        </div>
      </div>
      <span className={css.canvasAction}>{t('canvas.open')}</span>
    </button>
  )
}

interface AutomationCardItemProps {
  readonly automationId: string
  readonly fallbackTitle: string
  readonly fallbackEnabled: boolean
  readonly ruleSummary: string
  readonly fallbackLastStatus?: string | undefined
  readonly useBlueprintState: BlueprintToolViewProps['useBlueprintState']
  readonly setAutomationEnabled: BlueprintViewInjected['setAutomationEnabled']
  readonly runAutomationNow: BlueprintViewInjected['runAutomationNow']
  readonly t: (key: BlueprintLocaleKey, params?: Record<string, string | number>) => string
}

function BlueprintAutomationCard({
  automationId,
  fallbackTitle,
  fallbackEnabled,
  ruleSummary,
  fallbackLastStatus,
  useBlueprintState,
  setAutomationEnabled,
  runAutomationNow,
  t,
}: AutomationCardItemProps): ReactNode {
  const [busy, setBusy] = useState(false)
  const automations = useBlueprintState(s => s.catalog.automations)
  const bindings = useBlueprintState(s => s.catalog.bindings)
  const live = automations.find(a => a.id === automationId)

  const title = live?.title ?? fallbackTitle
  const enabled = live?.enabled ?? fallbackEnabled
  const isWidgetBound = bindings.some(
    b => (b.source.kind === 'automation' && b.source.id === automationId)
      || (b.target.kind === 'automation' && b.target.id === automationId),
  )
  const lastStatus = live?.lastRunStatus ?? fallbackLastStatus

  const onToggle = (): void => {
    if (!automationId || busy) return
    setBusy(true)
    void setAutomationEnabled(automationId, !enabled).finally(() => { setBusy(false) })
  }

  const onRunNow = (): void => {
    if (!automationId || busy) return
    setBusy(true)
    void runAutomationNow(automationId).finally(() => { setBusy(false) })
  }

  return (
    <div className={css.taskCard}>
      <div className={css.taskHeader}>
        <div className={css.taskTitleGroup}>
          <span className={css.taskBadge}>
            {isWidgetBound ? t('task.badge.widget') : t('task.badge.schedule')}
          </span>
          <span className={css.taskTitle}>{title}</span>
        </div>
        <span className={css.taskRule}>
          {enabled ? t('task.enabled') : t('task.disabled')}
        </span>
      </div>
      <div className={css.taskFooter}>
        <span className={css.taskRule}>
          {ruleSummary}
          {lastStatus === 'succeeded' ? ` · ${t('task.lastSucceeded')}` : lastStatus === 'failed' ? ` · ${t('task.lastFailed')}` : ''}
        </span>
        {automationId !== '' && (
          <div className={css.taskControls}>
            <button
              type="button"
              className={css.taskBtn}
              disabled={busy}
              onClick={onToggle}
            >
              {enabled ? t('task.toggleOff') : t('task.toggleOn')}
            </button>
            <button
              type="button"
              className={clsx(css.taskBtn, css.taskBtnPrimary)}
              disabled={busy || lastStatus === 'running'}
              onClick={onRunNow}
            >
              {busy || lastStatus === 'running' ? t('task.running') : t('task.runNow')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Keyed `AutomationCreate` / `AutomationUpdate` / `AutomationControl` Task Card
 * with live Enable/Disable switch and **Run now (`立即运行`)** button.
 * @param props - Tool view runtime props, Blueprint store hooks, and localized copy.
 * @returns Interactive Automation Task Card element.
 */
export function BlueprintAutomationToolView(props: BlueprintToolViewProps): ReactNode {
  const { phase, block, useBlueprintState, setAutomationEnabled, runAutomationNow, t } = props
  const meta = phase === 'result' ? asRecord(block.meta) : undefined
  const argId = block.args.text('id')
  const argTitle = block.args.text('title')
  const automationId = typeof meta?.automationId === 'string'
    ? meta.automationId
    : (argId ?? '')
  const fallbackTitle = typeof meta?.title === 'string'
    ? meta.title
    : (argTitle ?? (automationId || t('task.badge.schedule')))
  const fallbackEnabled = meta?.enabled === true
  const ruleSummary = typeof meta?.triggerSummary === 'string' ? meta.triggerSummary : ''
  const fallbackLastStatus = typeof meta?.lastRunStatus === 'string' ? meta.lastRunStatus : undefined

  return (
    <BlueprintAutomationCard
      automationId={automationId}
      fallbackTitle={fallbackTitle}
      fallbackEnabled={fallbackEnabled}
      ruleSummary={ruleSummary}
      fallbackLastStatus={fallbackLastStatus}
      useBlueprintState={useBlueprintState}
      setAutomationEnabled={setAutomationEnabled}
      runAutomationNow={runAutomationNow}
      t={t}
    />
  )
}

/**
 * Persistent Turn-tail renderer keeping interactive Blueprint Widgets and
 * Automation Task Cards visible inline after `ui-chat` collapses the Turn's
 * intermediate tool steps.
 * @param props - Closing Turn currency, Blueprint store hooks, and localized copy.
 * @returns Turn-tail Widget frames and Automation Task Cards, or `null` when none matched.
 */
export function BlueprintTurnTail(props: BlueprintTurnTailProps): ReactNode {
  const matched = selectBlueprintTurnCards(props)
  const bp = props.useBlueprintState(s => s)
  const theme = props.useBlueprintTheme(s => s)
  const pinnedIds = props.usePinnedWidgetIds(ids => ids)
  if (matched === null) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
      {matched.widgets.map((item) => {
        const detail = bp.widgetDetails[item.widgetId]
        return (
          <BlueprintWidgetFrame
            key={item.widgetId}
            widgetId={item.widgetId}
            title={item.title}
            fallbackHtml={item.assembledHtml}
            detail={detail}
            status={item.status}
            theme={theme}
            locale={props.localeCode}
            isPinned={pinnedIds.includes(item.widgetId)}
            onEnsureDetail={props.ensureWidget}
            onSaveInput={props.saveWidgetInput}
            onEmitEvent={props.emitWidgetEvent}
            onFilesCall={props.handleWidgetFilesCall}
            onTogglePinWindow={() => { void props.togglePinWindow(item.widgetId, item.title, item.assembledHtml) }}
            onPinToDashboard={() => { void props.pinWidgetToDashboard(item.widgetId, item.title) }}
            onOpenInRight={() => {
              if (typeof props.openWidgetInRight === 'function') props.openWidgetInRight(item.widgetId, item.title)
              else void props.pinWidgetToDashboard(item.widgetId, item.title, true)
            }}
            t={props.t}
          />
        )
      })}
      {matched.automations.map(auto => (
        <BlueprintAutomationCard
          key={auto.automationId}
          automationId={auto.automationId}
          fallbackTitle={auto.title}
          fallbackEnabled={auto.enabled}
          ruleSummary={auto.triggerSummary}
          fallbackLastStatus={auto.lastRunStatus}
          useBlueprintState={props.useBlueprintState}
          setAutomationEnabled={props.setAutomationEnabled}
          runAutomationNow={props.runAutomationNow}
          t={props.t}
        />
      ))}
    </div>
  )
}

/**
 * Keyed `Binding` tool view rendering a clean edge pill.
 */
export function BlueprintBindingToolView(props: BlueprintToolViewProps): ReactNode {
  const { phase, block, t } = props
  const meta = phase === 'result' ? asRecord(block.meta) : undefined
  const source = typeof meta?.sourceLabel === 'string' ? meta.sourceLabel : 'automation'
  const target = typeof meta?.targetLabel === 'string' ? meta.targetLabel : 'widget'
  return (
    <div className={css.compactRow}>
      <span>{t('binding.created', { source, target })}</span>
    </div>
  )
}

/**
 * Markdown `daimon-canvas` fence layer rendering Kimi's clickable Dashboard preview card.
 */
export function DaimonCanvasFenceLayer({
  code,
  streaming,
  children,
  openDashboardInRight,
  useBlueprintState,
  t,
}: DaimonCanvasFenceProps): ReactNode {
  const canvases = useBlueprintState(s => s.catalog.canvases)
  if (streaming) return children

  let parsedId = ''
  let parsedTitle = ''
  try {
    const obj = JSON.parse(code.trim()) as Record<string, unknown>
    if (typeof obj.canvasId === 'string') parsedId = obj.canvasId
    else if (typeof obj.id === 'string') parsedId = obj.id
    if (typeof obj.title === 'string') parsedTitle = obj.title
  } catch {
    parsedTitle = code.trim().split('\n')[0] ?? ''
  }

  const live = canvases.find(c => c.id === parsedId)
  const displayTitle = live?.title || parsedTitle || t('canvas.badge')
  const count = live?.placements.length ?? 0

  return (
    <button
      type="button"
      className={css.canvasCard}
      onClick={() => { openDashboardInRight(parsedId || undefined) }}
    >
      <div className={css.canvasLeft}>
        <span className={css.canvasGlyph}>
          <DashboardGlyph />
        </span>
        <div className={css.canvasMeta}>
          <span className={css.canvasTitle}>{displayTitle}</span>
          <span className={css.canvasSub}>
            {t('canvas.badge')} · {t('canvas.widgetCount', { count: String(count) })} · {t('canvas.subtitle')}
          </span>
        </div>
      </div>
      <span className={css.canvasAction}>{t('canvas.open')}</span>
    </button>
  )
}
