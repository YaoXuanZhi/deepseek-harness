import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import clsx from 'clsx'
import type { BlueprintCanvasPlacement, BlueprintPlacementHeightMode } from '@deepseek-ai/dsh-blueprint/client'
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

interface ActiveResizeGesture {
  readonly pointerId: number
  readonly canvasId: string
  readonly tileId: string
  readonly axis: 'height' | 'width' | 'corner'
  readonly startX: number
  readonly startY: number
  readonly startW: number
  readonly startHeightPx: number
  readonly gridWidthPx: number
  readonly liveW: number
  readonly liveHeightPx: number
}

const MIN_DRAG_HEIGHT_PX = 180
const MAX_DRAG_HEIGHT_PX = 2_600
const DASHBOARD_MAX_AUTO_HEIGHT_PX = 2_600
const GRID_ROW_UNIT_PX = 36

function clampZoom(zoom: number): number {
  return Math.round(Math.min(1.5, Math.max(0.6, zoom)) * 100) / 100
}

function resolveEffectiveHeightMode(tile: BlueprintCanvasPlacement): BlueprintPlacementHeightMode {
  return tile.heightMode ?? 'auto'
}

function resolveStoredHeightPx(tile: BlueprintCanvasPlacement, measured: number | undefined, zoom: number): number {
  if (tile.heightMode === 'fixed' && tile.pixelHeight !== undefined) {
    return tile.pixelHeight
  }
  if (measured !== undefined && measured > 0) {
    return Math.max(MIN_DRAG_HEIGHT_PX, Math.ceil(measured * zoom))
  }
  return Math.max(280, tile.rect.h * GRID_ROW_UNIT_PX)
}

function ResizeCornerGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M9 2L2 9M9 5.5L5.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
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
    openDashboardInMain,
    createCanvas,
    placeWidgetOnCanvas,
    updatePlacementLayout,
    setCanvasZoom,
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
  const [drag, setDrag] = useState<ActiveResizeGesture | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const measuredHeightsRef = useRef<Record<string, number>>({})

  const activeCanvas = canvases.find(c => c.id === selectedId)
    ?? (initialCanvasId ? canvases.find(c => c.id === initialCanvasId) : undefined)
    ?? canvases[0]

  const activeZoom = clampZoom(activeCanvas?.viewState.zoom ?? 1)
  const zoomPercent = Math.round(activeZoom * 100)

  const onSubmitCreate = (): void => {
    const trimmed = draftTitle.trim()
    if (!trimmed) return
    void createCanvas(trimmed).then((createdId) => {
      if (createdId) setSelectedId(createdId)
      setDraftTitle('')
      setCreating(false)
    })
  }

  const startResize = (
    ev: ReactPointerEvent<HTMLElement>,
    canvasId: string,
    tile: BlueprintCanvasPlacement,
    axis: 'height' | 'width' | 'corner',
  ): void => {
    if (ev.button !== 0) return
    ev.preventDefault()
    ev.stopPropagation()
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId)
    } catch (_captureErr) {
      // Synthetic pointer events in unit tests do not register active pointer ids.
    }
    const gridWidthPx = Math.max(240, gridRef.current?.getBoundingClientRect().width ?? 720)
    const cardEl = ev.currentTarget.closest('[data-blueprint-tile]')
    const viewportEl = cardEl?.querySelector('iframe')?.parentElement
    const domHeight = viewportEl ? Math.round(viewportEl.getBoundingClientRect().height) : 0
    const startHeightPx = domHeight > 0
      ? domHeight
      : resolveStoredHeightPx(tile, measuredHeightsRef.current[tile.widgetId], activeZoom)
    setDrag({
      pointerId: ev.pointerId,
      canvasId,
      tileId: tile.id,
      axis,
      startX: ev.clientX,
      startY: ev.clientY,
      startW: tile.rect.w,
      startHeightPx,
      gridWidthPx,
      liveW: tile.rect.w,
      liveHeightPx: startHeightPx,
    })
  }

  const moveResize = (ev: ReactPointerEvent<HTMLElement>): void => {
    if (drag === null || drag.pointerId !== ev.pointerId) return
    const dx = ev.clientX - drag.startX
    const dy = ev.clientY - drag.startY
    const colPx = drag.gridWidthPx / 12
    const nextW = (drag.axis === 'width' || drag.axis === 'corner')
      ? Math.min(12, Math.max(2, Math.round(drag.startW + dx / colPx)))
      : drag.startW
    const nextH = (drag.axis === 'height' || drag.axis === 'corner')
      ? Math.min(MAX_DRAG_HEIGHT_PX, Math.max(MIN_DRAG_HEIGHT_PX, Math.round(drag.startHeightPx + dy)))
      : drag.startHeightPx
    if (nextW !== drag.liveW || nextH !== drag.liveHeightPx) {
      setDrag({ ...drag, liveW: nextW, liveHeightPx: nextH })
    }
  }

  const finishResize = (ev: ReactPointerEvent<HTMLElement>): void => {
    if (drag === null || drag.pointerId !== ev.pointerId) return
    try {
      if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
        ev.currentTarget.releasePointerCapture(ev.pointerId)
      }
    } catch (_releaseErr) {
      // Synthetic pointer events in unit tests do not register active pointer ids.
    }
    const dx = ev.clientX - drag.startX
    const dy = ev.clientY - drag.startY
    const colPx = drag.gridWidthPx / 12
    const finalW = (drag.axis === 'width' || drag.axis === 'corner')
      ? Math.min(12, Math.max(2, Math.round(drag.startW + dx / colPx)))
      : drag.startW
    const finalHeightPx = (drag.axis === 'height' || drag.axis === 'corner')
      ? Math.min(MAX_DRAG_HEIGHT_PX, Math.max(MIN_DRAG_HEIGHT_PX, Math.round(drag.startHeightPx + dy)))
      : drag.startHeightPx
    const movedEnough = Math.abs(dx) >= 3 || Math.abs(dy) >= 3
    const finished = drag
    setDrag(null)
    if (!movedEnough) return

    const gridRows = Math.max(4, Math.min(120, Math.round((finalHeightPx + 40) / GRID_ROW_UNIT_PX)))
    if (finished.axis === 'width') {
      void updatePlacementLayout(finished.canvasId, finished.tileId, {
        rect: { w: finalW },
      })
    } else {
      void updatePlacementLayout(finished.canvasId, finished.tileId, {
        rect: { w: finalW, h: gridRows },
        heightMode: 'fixed',
        pixelHeight: finalHeightPx,
      })
    }
  }

  const cancelResize = (ev: ReactPointerEvent<HTMLElement>): void => {
    if (drag !== null && drag.pointerId === ev.pointerId) {
      setDrag(null)
    }
  }

  const firstPlacement = activeCanvas?.placements[0]
  const singleFillBoard = activeCanvas !== undefined
    && activeCanvas.placements.length === 1
    && firstPlacement !== undefined
    && resolveEffectiveHeightMode(firstPlacement) === 'fill'

  return (
    <div className={css.page}>
      <div className={css.header}>
        <div className={css.tabs}>
          {canvases.map(canvas => (
            <button
              key={canvas.id}
              type="button"
              className={clsx(css.tabBtn, activeCanvas?.id === canvas.id && css.tabBtnActive)}
              onClick={() => { setSelectedId(canvas.id) }}
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
                onChange={(ev) => { setDraftTitle(ev.target.value) }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') onSubmitCreate()
                }}
              />
              <button type="button" className={clsx(css.tabBtn, css.tabBtnActive)} onClick={onSubmitCreate}>
                {t('canvas.createConfirm')}
              </button>
            </>
          ) : (
            <button type="button" className={css.tabBtn} onClick={() => { setCreating(true) }}>
              + {t('canvas.newButton')}
            </button>
          )}
        </div>

        {activeCanvas !== undefined && (
          <div className={css.toolbarRight}>
            <div className={css.zoomGroup}>
              <button
                type="button"
                className={css.zoomStepBtn}
                aria-label={t('canvas.zoomOut')}
                title={t('canvas.zoomOut')}
                onClick={() => { void setCanvasZoom(activeCanvas.id, clampZoom(activeZoom - 0.1)) }}
              >
                −
              </button>
              <button
                type="button"
                className={css.zoomValueBtn}
                aria-label={t('canvas.zoomReset')}
                title={t('canvas.zoomReset')}
                onClick={() => { void setCanvasZoom(activeCanvas.id, 1) }}
              >
                {String(zoomPercent)}%
              </button>
              <button
                type="button"
                className={css.zoomStepBtn}
                aria-label={t('canvas.zoomIn')}
                title={t('canvas.zoomIn')}
                onClick={() => { void setCanvasZoom(activeCanvas.id, clampZoom(activeZoom + 0.1)) }}
              >
                +
              </button>
            </div>
            {compact === true && (
              <button
                type="button"
                className={css.tabBtn}
                onClick={() => { openDashboardInMain() }}
              >
                {t('canvas.openMain')}
              </button>
            )}
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
          <div
            ref={gridRef}
            className={clsx(css.grid, singleFillBoard && css.gridSingleFill)}
          >
            {activeCanvas.placements.map((tile) => {
              const widgetRecord = widgets.find(w => w.id === tile.widgetId)
              const detail = bp.widgetDetails[tile.widgetId]
              const displayTitle = tile.titleOverride ?? widgetRecord?.title ?? tile.widgetId
              const isDraggingThis = drag?.tileId === tile.id
              const effectiveW = isDraggingThis ? drag.liveW : tile.rect.w
              const isFullWidth = effectiveW >= 12
              const heightMode: BlueprintPlacementHeightMode = isDraggingThis && (drag.axis === 'height' || drag.axis === 'corner')
                ? 'fixed'
                : resolveEffectiveHeightMode(tile)
              const explicitHeight = isDraggingThis && (drag.axis === 'height' || drag.axis === 'corner')
                ? drag.liveHeightPx
                : (heightMode === 'fixed'
                  ? (tile.pixelHeight ?? Math.max(260, tile.rect.h * GRID_ROW_UNIT_PX))
                  : undefined)
              const minAutoHeight = activeCanvas.placements.length === 1 ? 300 : 220

              return (
                <div
                  key={tile.id}
                  data-blueprint-tile={tile.id}
                  className={clsx(
                    css.tileCell,
                    heightMode === 'fill' && (singleFillBoard ? css.tileCellFill : css.tileCellMultiFill),
                  )}
                  style={{
                    gridColumn: `span ${String(effectiveW)}`,
                  }}
                >
                  <BlueprintWidgetFrame
                    widgetId={tile.widgetId}
                    title={displayTitle}
                    detail={detail}
                    status={widgetRecord?.status}
                    theme={theme}
                    locale={localeCode}
                    fillHeight={heightMode === 'fill'}
                    explicitHeight={explicitHeight}
                    minAutoHeight={minAutoHeight}
                    maxAutoHeight={DASHBOARD_MAX_AUTO_HEIGHT_PX}
                    contentZoom={activeZoom}
                    interacting={drag !== null}
                    isPinned={pinnedIds.includes(tile.widgetId)}
                    onMeasuredHeight={(h) => {
                      measuredHeightsRef.current[tile.widgetId] = h
                    }}
                    onEnsureDetail={ensureWidget}
                    onSaveInput={saveWidgetInput}
                    onEmitEvent={emitWidgetEvent}
                    onFilesCall={handleWidgetFilesCall}
                    onTogglePinWindow={() => { void togglePinWindow(tile.widgetId, displayTitle) }}
                    tileControls={{
                      heightMode,
                      isFullWidth,
                      showWidthToggle: true,
                      onToggleHeightMode: () => {
                        const nextMode: BlueprintPlacementHeightMode = heightMode === 'auto' ? 'fill' : 'auto'
                        void updatePlacementLayout(activeCanvas.id, tile.id, { heightMode: nextMode })
                      },
                      onToggleWidth: () => {
                        void updatePlacementLayout(activeCanvas.id, tile.id, {
                          rect: { w: isFullWidth ? 6 : 12 },
                        })
                      },
                      onRemoveTile: () => {
                        void removePlacementFromCanvas(activeCanvas.id, tile.id)
                      },
                    }}
                    t={t}
                  />

                  <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label={t('canvas.resizeDragHint')}
                    title={t('canvas.resizeDragHint')}
                    className={clsx(css.resizeBarBottom, isDraggingThis && css.resizeBarBottomActive)}
                    onPointerDown={(ev) => { startResize(ev, activeCanvas.id, tile, 'height') }}
                    onPointerMove={moveResize}
                    onPointerUp={finishResize}
                    onPointerCancel={cancelResize}
                    onDoubleClick={() => {
                      void updatePlacementLayout(activeCanvas.id, tile.id, { heightMode: 'auto' })
                    }}
                  >
                    <span className={css.resizeGrip} />
                  </div>

                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t('canvas.resizeDragHint')}
                    title={t('canvas.resizeDragHint')}
                    className={css.resizeBarRight}
                    onPointerDown={(ev) => { startResize(ev, activeCanvas.id, tile, 'width') }}
                    onPointerMove={moveResize}
                    onPointerUp={finishResize}
                    onPointerCancel={cancelResize}
                  />

                  <div
                    role="separator"
                    aria-label={t('canvas.resizeDragHint')}
                    title={t('canvas.resizeDragHint')}
                    className={css.resizeCorner}
                    onPointerDown={(ev) => { startResize(ev, activeCanvas.id, tile, 'corner') }}
                    onPointerMove={moveResize}
                    onPointerUp={finishResize}
                    onPointerCancel={cancelResize}
                    onDoubleClick={() => {
                      void updatePlacementLayout(activeCanvas.id, tile.id, { heightMode: 'auto' })
                    }}
                  >
                    <ResizeCornerGlyph />
                  </div>

                  {isDraggingThis && (
                    <span className={css.resizeBadge}>
                      {t('canvas.sizeReadout', {
                        cols: String(drag.liveW),
                        height: String(drag.liveHeightPx),
                      })}
                    </span>
                  )}
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
 * @param props - Main panel runtime props, Blueprint store hooks, and localized copy.
 * @returns Full-page Dashboard board element.
 */
export function BlueprintMainDashboardPage(props: BlueprintMainDashboardProps): ReactNode {
  const { t, ...injected } = props
  return <DashboardBoardCore injected={injected} t={t} />
}

/**
 * Right-Sidebar Dashboard tab registered under `sidebar.right.pane.tab`.
 * @param props - Right-Sidebar tab runtime props, Blueprint store hooks, and localized copy.
 * @returns Right-Sidebar Dashboard board element.
 */
export function BlueprintRightDashboardTab(props: BlueprintRightTabProps): ReactNode {
  const { useTabInfo, t, ...injected } = props
  const { tab } = useTabInfo()
  const params = tab.navigation.params as { readonly canvasId?: string } | undefined
  const canvasId = typeof params?.canvasId === 'string' ? params.canvasId : undefined
  return <DashboardBoardCore initialCanvasId={canvasId} compact injected={injected} t={t} />
}
