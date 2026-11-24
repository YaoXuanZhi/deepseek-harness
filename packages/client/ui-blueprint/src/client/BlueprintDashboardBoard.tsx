import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { BlueprintWidgetFrame } from './BlueprintWidgetFrame.tsx'
import type { BlueprintViewInjected } from './index.ts'
import css from './BlueprintDashboardBoard.module.css'

/** Props of the Left-Sidebar `看板` (`Dashboards`) main panel. */
export type BlueprintMainDashboardProps =
  PropsRuntime<'main'> & InjectFace<BlueprintViewInjected> & PropsLocale<'blueprint'>

/** Props of the Right-Sidebar Dashboard tab body. */
export type BlueprintRightTabProps =
  PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<BlueprintViewInjected> & PropsLocale<'blueprint'>

interface SharedBoardProps {
  readonly initialCanvasId?: string | undefined
  readonly compact?: boolean | undefined
  readonly injected: InjectFace<BlueprintViewInjected>
  readonly t: BlueprintMainDashboardProps['t']
}

function DashboardBoardCore({ initialCanvasId, compact, injected, t }: SharedBoardProps): ReactNode {
  const {
    useBlueprintState,
    useBlueprintTheme,
    usePinnedWidgetIds,
    localeCode,
    ensureWidget,
    saveWidgetInput,
    emitWidgetEvent,
    handleWidgetFilesCall,
    togglePinWindow,
    createCanvas,
    placeWidgetOnCanvas,
    resizePlacementWidth,
    removePlacementFromCanvas,
    deleteCanvasById,
  } = injected

  const bp = useBlueprintState(s => s)
  const theme = useBlueprintTheme(s => s)
  const pinnedIds = usePinnedWidgetIds(ids => ids)
  const canvases = bp.catalog.canvases
  const widgets = bp.catalog.widgets

  const [selectedId, setSelectedId] = useState<string>(initialCanvasId ?? '')
  const [creating, setCreating] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  const activeCanvas = canvases.find(c => c.id === selectedId)
    ?? (initialCanvasId ? canvases.find(c => c.id === initialCanvasId) : undefined)
    ?? canvases[0]

  const onSubmitCreate = (): void => {
    const trimmed = draftTitle.trim()
    if (!trimmed) return
    void createCanvas(trimmed).then((createdId) => {
      if (createdId) setSelectedId(createdId)
      setDraftTitle('')
      setCreating(false)
    })
  }

  return (
    <div className={css.page}>
      <div className={css.header}>
        <div className={css.tabs}>
          {canvases.map(canvas => (
            <button
              key={canvas.id}
              type="button"
              className={clsx(css.tabBtn, activeCanvas?.id === canvas.id && css.tabBtnActive)}
              onClick={() =>{  setSelectedId(canvas.id) }}
            >
              {canvas.title}
            </button>
          ))}
          {creating ? (
            <>
              <input
                type="text"
                className={css.controlInput}
                placeholder={t('canvas.newPlaceholder')}
                value={draftTitle}
                onChange={(ev) =>{  setDraftTitle(ev.target.value) }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') onSubmitCreate()
                }}
              />
              <button type="button" className={clsx(css.tabBtn, css.tabBtnActive)} onClick={onSubmitCreate}>
                {t('canvas.createConfirm')}
              </button>
            </>
          ) : (
            <button type="button" className={css.tabBtn} onClick={() =>{  setCreating(true) }}>
              + {t('canvas.newButton')}
            </button>
          )}
        </div>

        {activeCanvas !== undefined && (
          <div className={css.toolbarRight}>
            {widgets.length > 0 && (
              <select
                className={css.controlSelect}
                aria-label={t('canvas.addWidget')}
                value=""
                onChange={(ev) => {
                  const wid = ev.target.value
                  if (wid) void placeWidgetOnCanvas(activeCanvas.id, wid)
                }}
              >
                <option value="">+ {t('canvas.addWidget')}</option>
                {widgets.map(w => (
                  <option key={w.id} value={w.id}>{w.title}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              className={css.tabBtn}
              onClick={() => { void deleteCanvasById(activeCanvas.id) }}
            >
              {t('canvas.deleteBoard')}
            </button>
          </div>
        )}
      </div>

      <div className={css.body}>
        {activeCanvas === undefined ? (
          <div className={css.emptyState}>
            <div className={css.emptyTitle}>{t('canvas.emptyTitle')}</div>
            <div className={css.emptyHint}>{t('canvas.emptyHint')}</div>
          </div>
        ) : activeCanvas.placements.length === 0 ? (
          <div className={css.emptyState}>
            <div className={css.emptyHint}>{t('canvas.noWidgets')}</div>
          </div>
        ) : (
          <div className={compact ? css.gridCompact : css.grid}>
            {activeCanvas.placements.map((tile) => {
              const widgetRecord = widgets.find(w => w.id === tile.widgetId)
              const detail = bp.widgetDetails[tile.widgetId]
              const displayTitle = tile.titleOverride ?? widgetRecord?.title ?? tile.widgetId
              const isFullWidth = tile.rect.w >= 12
              return (
                <div
                  key={tile.id}
                  className={css.tileCell}
                  style={
                    compact
                      ? { minHeight: `${String(Math.max(220, tile.rect.h * 34))}px` }
                      : {
                        gridColumn: `${String(tile.rect.x + 1)} / span ${String(tile.rect.w)}`,
                        gridRow: `${String(tile.rect.y + 1)} / span ${String(tile.rect.h)}`,
                      }
                  }
                >
                  <BlueprintWidgetFrame
                    widgetId={tile.widgetId}
                    title={displayTitle}
                    detail={detail}
                    status={widgetRecord?.status}
                    theme={theme}
                    locale={localeCode}
                    fillHeight
                    isPinned={pinnedIds.includes(tile.widgetId)}
                    onEnsureDetail={ensureWidget}
                    onSaveInput={saveWidgetInput}
                    onEmitEvent={emitWidgetEvent}
                    onFilesCall={handleWidgetFilesCall}
                    onTogglePinWindow={() => { void togglePinWindow(tile.widgetId, displayTitle) }}
                    extraActions={(
                      <>
                        {!compact && (
                          <button
                            type="button"
                            className={css.tileMiniBtn}
                            onClick={() => {
                              void resizePlacementWidth(activeCanvas.id, tile.id, isFullWidth ? 6 : 12)
                            }}
                          >
                            {isFullWidth ? t('canvas.resizeCompact') : t('canvas.resizeFull')}
                          </button>
                        )}
                        <button
                          type="button"
                          className={css.tileMiniBtn}
                          onClick={() => { void removePlacementFromCanvas(activeCanvas.id, tile.id) }}
                        >
                          {t('canvas.removeTile')}
                        </button>
                      </>
                    )}
                    t={t}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Full-page `看板` (`Dashboards`) surface registered under `main` (`key: 'dashboards'`).
 */
export function BlueprintMainDashboardPage(props: BlueprintMainDashboardProps): ReactNode {
  const { t, ...injected } = props
  return <DashboardBoardCore injected={injected} t={t} />
}

/**
 * Right-Sidebar Dashboard tab registered under `sidebar.right.pane.tab`.
 */
export function BlueprintRightDashboardTab(props: BlueprintRightTabProps): ReactNode {
  const { useTabInfo, t, ...injected } = props
  const { tab } = useTabInfo()
  const params = tab.navigation.params as { readonly canvasId?: string } | undefined
  const canvasId = typeof params?.canvasId === 'string' ? params.canvasId : undefined
  return <DashboardBoardCore initialCanvasId={canvasId} compact injected={injected} t={t} />
}
