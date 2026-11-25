import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import clsx from 'clsx'
import type {
  BlueprintCanvasPlacement,
  BlueprintGridRect,
} from '@deepseek-ai/dsh-blueprint/client'
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
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
  readonly embeddedInSidebar?: boolean | undefined
  readonly injected: InjectFace<BlueprintViewInjected>
  readonly t: BlueprintMainDashboardProps['t']
}

type ResizeAxis = 'e' | 's' | 'se'

interface BoardInteractionState {
  readonly pointerId: number
  readonly canvasId: string
  readonly tileId: string
  readonly kind: 'move' | 'resize'
  readonly resizeAxis?: ResizeAxis | undefined
  readonly startClientX: number
  readonly startClientY: number
  readonly startZoom: number
  readonly startRect: BlueprintGridRect
  readonly deltaDesignX: number
  readonly deltaDesignY: number
  readonly projectedRect: BlueprintGridRect
}

/**
 * Exact Kimi Work `CanvasBoard` 12-column design-space geometry constants
 * (`12 * 80 + 11 * 12 = 1092px` design width; `32px` row height; `12px` track gap).
 */
const GRID_COLS = 12
const COL_WIDTH_PX = 80
const ROW_HEIGHT_PX = 32
const GRID_GAP_PX = 12
const COL_PITCH_PX = COL_WIDTH_PX + GRID_GAP_PX // 92px
const ROW_PITCH_PX = ROW_HEIGHT_PX + GRID_GAP_PX // 44px
const DESIGN_BOARD_WIDTH_PX = GRID_COLS * COL_WIDTH_PX + (GRID_COLS - 1) * GRID_GAP_PX // 1092px
const BOARD_PADDING_X_PX = 32
const MIN_BOARD_ZOOM = 0.2
const MAX_BOARD_ZOOM = 3.0
const MIN_GRID_W = 2
const MIN_GRID_H = 2
const MAX_GRID_H = 120
const AUTO_HEIGHT_HYSTERESIS_PX = 8

function colsToDesignPx(w: number): number {
  const clamped = Math.max(1, Math.round(w))
  return clamped * COL_WIDTH_PX + (clamped - 1) * GRID_GAP_PX
}

function rowsToDesignPx(h: number): number {
  const clamped = Math.max(1, Math.round(h))
  return clamped * ROW_HEIGHT_PX + (clamped - 1) * GRID_GAP_PX
}

function heightPxToRows(px: number): number {
  return Math.min(MAX_GRID_H, Math.max(MIN_GRID_H, Math.ceil((Math.max(140, px) + GRID_GAP_PX) / ROW_PITCH_PX)))
}

function gridRectToDesignBox(rect: BlueprintGridRect): {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
} {
  return {
    x: rect.x * COL_PITCH_PX,
    y: rect.y * ROW_PITCH_PX,
    w: colsToDesignPx(rect.w),
    h: rowsToDesignPx(rect.h),
  }
}

function computeBoardZoom(boardDesignWidth: number, scrollClientWidth: number): number {
  if (boardDesignWidth <= 0 || scrollClientWidth <= 0) return 1
  const raw = (scrollClientWidth - BOARD_PADDING_X_PX) / boardDesignWidth
  return Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, raw))
}

function projectInteractionRect(
  start: BlueprintGridRect,
  deltaDesignX: number,
  deltaDesignY: number,
  kind: 'move' | 'resize',
  axis?: ResizeAxis,
): BlueprintGridRect {
  const dCols = Math.round(deltaDesignX / COL_PITCH_PX)
  const dRows = Math.round(deltaDesignY / ROW_PITCH_PX)
  if (kind === 'resize') {
    const resizeW = axis === 'e' || axis === 'se'
    const resizeH = axis === 's' || axis === 'se'
    const w = Math.min(GRID_COLS - start.x, Math.max(MIN_GRID_W, start.w + (resizeW ? dCols : 0)))
    const h = Math.min(MAX_GRID_H, Math.max(MIN_GRID_H, start.h + (resizeH ? dRows : 0)))
    return { x: start.x, y: start.y, w, h }
  }
  const x = Math.min(GRID_COLS - start.w, Math.max(0, start.x + dCols))
  const y = Math.max(0, start.y + dRows)
  return { x, y, w: start.w, h: start.h }
}

function DashboardBoardGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9.8" y="2.2" width="6" height="3.8" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9.8" y="7.6" width="6" height="8.2" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.2" y="9.8" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function ArrangeGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function RefreshGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.2 8a5.2 5.2 0 1 1-1.35-3.5M13.4 2.6v2.5h-2.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EnlargeGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.8 2.5h3.7v3.7M13.3 2.7 9.2 6.8M6.2 13.5H2.5V9.8M2.7 13.3l4.1-4.1"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MoreGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function PlusGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  )
}

function PlayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 3.5 12.2 8 5 12.5V3.5Z" fill="currentColor" />
    </svg>
  )
}

function DashboardBoardCore({ initialCanvasId, embeddedInSidebar, injected, t }: SharedBoardProps): ReactNode {
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
    arrangeCanvasById,
    refreshCatalog,
    removePlacementFromCanvas,
    deleteCanvasById,
    runAutomationNow,
  } = injected

  const bp = useBlueprintState(s => s)
  const theme = useBlueprintTheme(s => s)
  const pinnedIds = usePinnedWidgetIds(ids => ids)
  const canvases = bp.catalog.canvases
  const widgets = bp.catalog.widgets
  const bindings = bp.catalog.bindings

  const [selectedId, setSelectedId] = useState<string>(initialCanvasId ?? '')
  const [creating, setCreating] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [scrollClientWidth, setScrollClientWidth] = useState<number>(0)
  const [interaction, setInteraction] = useState<BoardInteractionState | null>(null)
  const [openTileMenuId, setOpenTileMenuId] = useState<string | null>(null)
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const [boardFullscreen, setBoardFullscreen] = useState(false)
  const [enlargedTileId, setEnlargedTileId] = useState<string | null>(null)
  const [refreshSeq, setRefreshSeq] = useState(0)

  const observerCleanupRef = useRef<(() => void) | null>(null)
  const interactionRef = useRef<BoardInteractionState | null>(null)
  interactionRef.current = interaction
  const pendingAutoRowsRef = useRef<Map<string, number>>(new Map())

  const bindScrollContainer = useCallback((el: HTMLDivElement | null) => {
    observerCleanupRef.current?.()
    observerCleanupRef.current = null
    if (!el) return
    const initialW = el.clientWidth
    if (initialW > 0) setScrollClientWidth(initialW)
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0]
        const w = entry?.contentRect.width ?? el.clientWidth
        if (w > 0) setScrollClientWidth(Math.round(w))
      })
      ro.observe(el)
      observerCleanupRef.current = () => { ro.disconnect() }
    }
  }, [])

  useEffect(() => () => {
    observerCleanupRef.current?.()
    observerCleanupRef.current = null
  }, [])

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return
      if (enlargedTileId !== null) {
        setEnlargedTileId(null)
      } else if (openTileMenuId !== null) {
        setOpenTileMenuId(null)
      } else if (boardMenuOpen) {
        setBoardMenuOpen(false)
      } else if (boardFullscreen) {
        setBoardFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [boardFullscreen, boardMenuOpen, enlargedTileId, openTileMenuId])

  const activeCanvas = canvases.find(c => c.id === selectedId)
    ?? (initialCanvasId ? canvases.find(c => c.id === initialCanvasId) : undefined)
    ?? canvases[0]

  // Compute full 12-column design bounding box (`>= 1092px` wide) and proportional `boardZoom`
  let maxRightPx = DESIGN_BOARD_WIDTH_PX
  let maxBottomPx = 280
  if (activeCanvas) {
    for (const tile of activeCanvas.placements) {
      const effectiveRect = interaction?.tileId === tile.id ? interaction.projectedRect : tile.rect
      const box = gridRectToDesignBox(effectiveRect)
      if (box.x + box.w > maxRightPx) maxRightPx = box.x + box.w
      if (box.y + box.h > maxBottomPx) maxBottomPx = box.y + box.h
    }
  }
  const boardDesignW = maxRightPx
  const boardDesignH = maxBottomPx + 16
  const boardZoom = computeBoardZoom(boardDesignW, scrollClientWidth)
  const counterScale = 1 / Math.max(0.05, boardZoom)

  const onSubmitCreate = (): void => {
    const trimmed = draftTitle.trim()
    if (!trimmed) return
    void createCanvas(trimmed).then((createdId) => {
      if (createdId) setSelectedId(createdId)
      setDraftTitle('')
      setCreating(false)
    })
  }

  const onRefreshBoard = (): void => {
    setBoardMenuOpen(false)
    setRefreshSeq(n => n + 1)
    void refreshCatalog()
  }

  const handleMeasuredHeight = (canvasId: string, tile: BlueprintCanvasPlacement, contentHeightPx: number): void => {
    if (interactionRef.current !== null) return
    if (tile.heightMode === 'fixed') return
    const currentDesignH = rowsToDesignPx(tile.rect.h)
    if (Math.abs(contentHeightPx - currentDesignH) < AUTO_HEIGHT_HYSTERESIS_PX) return
    const targetRows = heightPxToRows(contentHeightPx)
    if (targetRows === tile.rect.h) return
    const key = `${canvasId}:${tile.id}`
    if (pendingAutoRowsRef.current.get(key) === targetRows) return
    pendingAutoRowsRef.current.set(key, targetRows)
    void updatePlacementLayout(canvasId, tile.id, {
      rect: { h: targetRows },
      heightMode: 'auto',
      interaction: 'resize',
    }).finally(() => {
      if (pendingAutoRowsRef.current.get(key) === targetRows) {
        pendingAutoRowsRef.current.delete(key)
      }
    })
  }

  const startBoardInteraction = (
    ev: ReactPointerEvent<HTMLElement>,
    canvasId: string,
    tile: BlueprintCanvasPlacement,
    kind: 'move' | 'resize',
    resizeAxis?: ResizeAxis,
  ): void => {
    if (ev.button !== 0) return
    ev.preventDefault()
    ev.stopPropagation()
    setOpenTileMenuId(null)
    setBoardMenuOpen(false)
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId)
    } catch (_captureErr) {
      // Synthetic pointer events in unit tests do not register active pointer ids.
    }
    setInteraction({
      pointerId: ev.pointerId,
      canvasId,
      tileId: tile.id,
      kind,
      resizeAxis,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startZoom: Math.max(0.05, boardZoom),
      startRect: tile.rect,
      deltaDesignX: 0,
      deltaDesignY: 0,
      projectedRect: tile.rect,
    })
  }

  const moveBoardInteraction = (ev: ReactPointerEvent<HTMLElement>): void => {
    if (interaction === null || interaction.pointerId !== ev.pointerId) return
    const dx = (ev.clientX - interaction.startClientX) / interaction.startZoom
    const dy = (ev.clientY - interaction.startClientY) / interaction.startZoom
    const projected = projectInteractionRect(
      interaction.startRect,
      dx,
      dy,
      interaction.kind,
      interaction.resizeAxis,
    )
    setInteraction({
      ...interaction,
      deltaDesignX: dx,
      deltaDesignY: dy,
      projectedRect: projected,
    })
  }

  const finishBoardInteraction = (ev: ReactPointerEvent<HTMLElement>): void => {
    if (interaction === null || interaction.pointerId !== ev.pointerId) return
    try {
      if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
        ev.currentTarget.releasePointerCapture(ev.pointerId)
      }
    } catch (_releaseErr) {
      // Synthetic pointer events in unit tests do not register active pointer ids.
    }
    const dx = (ev.clientX - interaction.startClientX) / interaction.startZoom
    const dy = (ev.clientY - interaction.startClientY) / interaction.startZoom
    const finalRect = projectInteractionRect(
      interaction.startRect,
      dx,
      dy,
      interaction.kind,
      interaction.resizeAxis,
    )
    const changed = finalRect.x !== interaction.startRect.x
      || finalRect.y !== interaction.startRect.y
      || finalRect.w !== interaction.startRect.w
      || finalRect.h !== interaction.startRect.h
    const finished = interaction
    setInteraction(null)
    if (!changed) return

    if (finished.kind === 'move') {
      void updatePlacementLayout(finished.canvasId, finished.tileId, {
        rect: finalRect,
        interaction: 'move',
      })
    } else {
      const resizedHeight = finished.resizeAxis === 's' || finished.resizeAxis === 'se'
      void updatePlacementLayout(finished.canvasId, finished.tileId, {
        rect: finalRect,
        ...(resizedHeight ? { heightMode: 'fixed', pixelHeight: rowsToDesignPx(finalRect.h) } : {}),
        interaction: 'resize',
      })
    }
  }

  const cancelBoardInteraction = (ev: ReactPointerEvent<HTMLElement>): void => {
    if (interaction !== null && interaction.pointerId === ev.pointerId) {
      setInteraction(null)
    }
  }

  const enlargedTile = activeCanvas?.placements.find(p => p.id === enlargedTileId)
  const enlargedWidgetRecord = enlargedTile ? widgets.find(w => w.id === enlargedTile.widgetId) : undefined
  const enlargedDetail = enlargedTile ? bp.widgetDetails[enlargedTile.widgetId] : undefined
  const enlargedTitle = enlargedTile
    ? (enlargedTile.titleOverride ?? enlargedWidgetRecord?.title ?? enlargedTile.widgetId)
    : ''

  return (
    <div
      className={clsx(css.page, boardFullscreen && css.pageFullscreen)}
      onPointerDown={() => {
        if (openTileMenuId !== null) setOpenTileMenuId(null)
        if (boardMenuOpen) setBoardMenuOpen(false)
      }}
    >
      {/* Top Header: Canvas Tab Strip + Sidebar/Header Actions */}
      <div className={css.header} onPointerDown={(ev) => { ev.stopPropagation() }}>
        <div className={css.tabs} role="tablist">
          {canvases.map(canvas => (
            <button
              key={canvas.id}
              type="button"
              role="tab"
              aria-selected={activeCanvas?.id === canvas.id}
              className={clsx(css.tabBtn, activeCanvas?.id === canvas.id && css.tabBtnActive)}
              onClick={() => { setSelectedId(canvas.id) }}
            >
              <DashboardBoardGlyph />
              <span>{canvas.title}</span>
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
                  if (ev.key === 'Escape') setCreating(false)
                }}
              />
              <button type="button" className={css.outlineBtn} onClick={onSubmitCreate}>
                {t('canvas.createConfirm')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={css.tabAddBtn}
              aria-label={t('canvas.newButton')}
              title={t('canvas.newButton')}
              onClick={() => { setCreating(true) }}
            >
              <PlusGlyph />
            </button>
          )}
        </div>

        {activeCanvas !== undefined && embeddedInSidebar === true && (
          <div className={css.toolbarRight}>
            <button
              type="button"
              className={css.outlineBtn}
              disabled={activeCanvas.placements.length === 0}
              onClick={() => { void arrangeCanvasById(activeCanvas.id) }}
            >
              <ArrangeGlyph />
              <span>{t('canvas.arrange')}</span>
            </button>
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
            <div className={css.menuAnchor}>
              <button
                type="button"
                className={css.iconBtn}
                aria-label={t('canvas.moreActions')}
                aria-expanded={boardMenuOpen}
                onClick={() => { setBoardMenuOpen(v => !v) }}
              >
                <MoreGlyph />
              </button>
              {boardMenuOpen && (
                <MenuSurface className={css.dropdownMenu} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={css.menuItem}
                    onClick={onRefreshBoard}
                  >
                    <RefreshGlyph />
                    <span>{t('canvas.refresh')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={css.menuItem}
                    onClick={() => {
                      setBoardMenuOpen(false)
                      openDashboardInMain()
                    }}
                  >
                    <EnlargeGlyph />
                    <span>{t('canvas.openMain')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={clsx(css.menuItem, css.menuItemDanger)}
                    onClick={() => {
                      setBoardMenuOpen(false)
                      void deleteCanvasById(activeCanvas.id)
                    }}
                  >
                    <span>{t('canvas.deleteBoard')}</span>
                  </button>
                </MenuSurface>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Scroll Container + Proportionally-Scaled 1092px 12-Column CanvasBoard */}
      <div
        ref={bindScrollContainer}
        className={css.boardScroll}
        data-blueprint-board-scroll=""
        style={{ paddingBottom: embeddedInSidebar === true ? '24px' : '84px' }}
      >
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
            className={css.boardFrame}
            data-board-zoom={boardZoom.toFixed(4)}
            style={{
              width: `${String(Math.round(boardDesignW * boardZoom))}px`,
              height: `${String(Math.round(boardDesignH * boardZoom))}px`,
            }}
          >
            <div
              className={css.canvasBoard}
              style={{
                width: `${String(boardDesignW)}px`,
                height: `${String(boardDesignH)}px`,
                zoom: boardZoom === 1 ? undefined : boardZoom,
              }}
            >
              {interaction !== null && (
                <div
                  className={css.dropIndicator}
                  aria-hidden="true"
                  style={{
                    left: `${String(gridRectToDesignBox(interaction.projectedRect).x)}px`,
                    top: `${String(gridRectToDesignBox(interaction.projectedRect).y)}px`,
                    width: `${String(gridRectToDesignBox(interaction.projectedRect).w)}px`,
                    height: `${String(gridRectToDesignBox(interaction.projectedRect).h)}px`,
                  }}
                />
              )}

              {activeCanvas.placements.map((tile, idx) => {
                const widgetRecord = widgets.find(w => w.id === tile.widgetId)
                const detail = bp.widgetDetails[tile.widgetId]
                const displayTitle = tile.titleOverride ?? widgetRecord?.title ?? tile.widgetId
                const isPinned = pinnedIds.includes(tile.widgetId)
                const isMenuOpen = openTileMenuId === tile.id
                const isInteractingThis = interaction?.tileId === tile.id

                const baseBox = gridRectToDesignBox(tile.rect)
                const projectedBox = isInteractingThis
                  ? gridRectToDesignBox(interaction.projectedRect)
                  : baseBox

                const tileStyle = isInteractingThis && interaction.kind === 'move'
                  ? {
                    left: `${String(baseBox.x)}px`,
                    top: `${String(baseBox.y)}px`,
                    width: `${String(baseBox.w)}px`,
                    height: `${String(baseBox.h)}px`,
                    transform: `translate(${interaction.deltaDesignX.toFixed(1)}px, ${interaction.deltaDesignY.toFixed(1)}px)`,
                    zIndex: 1000,
                  }
                  : {
                    left: `${String(projectedBox.x)}px`,
                    top: `${String(projectedBox.y)}px`,
                    width: `${String(projectedBox.w)}px`,
                    height: `${String(projectedBox.h)}px`,
                    zIndex: isInteractingThis ? 1000 : (isMenuOpen ? 500 : (tile.zIndex ?? idx + 1)),
                  }

                const boundAutomation = bindings.find(
                  b => b.enabled && b.source.kind === 'automation' && b.target.kind === 'widget' && b.target.id === tile.widgetId,
                )

                return (
                  <article
                    key={tile.id}
                    data-blueprint-tile={tile.id}
                    className={clsx(
                      css.placement,
                      isInteractingThis && css.placementDragging,
                    )}
                    style={tileStyle}
                  >
                    {/* Top Drag-Move Strip (`.canvas-placement-draglayer`) */}
                    <div
                      className={css.tileDragLayer}
                      title={t('canvas.dragMoveHint')}
                      onPointerDown={(ev) => { startBoardInteraction(ev, activeCanvas.id, tile, 'move') }}
                      onPointerMove={moveBoardInteraction}
                      onPointerUp={finishBoardInteraction}
                      onPointerCancel={cancelBoardInteraction}
                    />

                    {/* Counter-scaled Hover Action Controls (`1 / boardZoom` so buttons stay crisp 30x30px) */}
                    <div
                      className={clsx(css.tileCtrl, isMenuOpen && css.tileCtrlOpen)}
                      style={{
                        zoom: counterScale === 1 ? undefined : counterScale,
                      }}
                      onPointerDown={(ev) => { ev.stopPropagation() }}
                    >
                      {boundAutomation !== undefined && (
                        <button
                          type="button"
                          className={css.tileCtrlBtn}
                          aria-label={t('task.runNow')}
                          title={t('task.runNow')}
                          onClick={() => { void runAutomationNow(boundAutomation.source.id) }}
                        >
                          <PlayGlyph />
                        </button>
                      )}
                      <button
                        type="button"
                        className={css.tileCtrlBtn}
                        aria-label={t('canvas.enlargeWidget')}
                        title={t('canvas.enlargeWidget')}
                        onClick={() => { setEnlargedTileId(tile.id) }}
                      >
                        <EnlargeGlyph />
                      </button>
                      <div className={css.menuAnchor}>
                        <button
                          type="button"
                          className={css.tileCtrlBtn}
                          aria-label={t('canvas.moreActions')}
                          aria-expanded={isMenuOpen}
                          onClick={() => {
                            setOpenTileMenuId(prev => (prev === tile.id ? null : tile.id))
                          }}
                        >
                          <MoreGlyph />
                        </button>
                        {isMenuOpen && (
                          <MenuSurface className={css.dropdownMenu} role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className={css.menuItem}
                              onClick={() => {
                                setOpenTileMenuId(null)
                                void togglePinWindow(tile.widgetId, displayTitle)
                              }}
                            >
                              <span>{isPinned ? t('widget.unpinWindow') : t('widget.pinWindow')}</span>
                            </button>
                            {tile.heightMode === 'fixed' && (
                              <button
                                type="button"
                                role="menuitem"
                                className={css.menuItem}
                                onClick={() => {
                                  setOpenTileMenuId(null)
                                  void updatePlacementLayout(activeCanvas.id, tile.id, {
                                    heightMode: 'auto',
                                    interaction: 'resize',
                                  })
                                }}
                              >
                                <span>{t('canvas.heightAuto')}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              className={clsx(css.menuItem, css.menuItemDanger)}
                              onClick={() => {
                                setOpenTileMenuId(null)
                                void removePlacementFromCanvas(activeCanvas.id, tile.id)
                              }}
                            >
                              <span>{t('canvas.removeTile')}</span>
                            </button>
                          </MenuSurface>
                        )}
                      </div>
                    </div>

                    {/* Chromeless Sandboxed Widget Filling Design-Space Tile */}
                    <div className={css.placementInner}>
                      <BlueprintWidgetFrame
                        widgetId={tile.widgetId}
                        title={displayTitle}
                        detail={detail}
                        status={widgetRecord?.status}
                        theme={theme}
                        locale={localeCode}
                        chromeless
                        refreshToken={refreshSeq}
                        fillHeight
                        interacting={interaction !== null}
                        isPinned={isPinned}
                        onMeasuredHeight={(h) => { handleMeasuredHeight(activeCanvas.id, tile, h) }}
                        onExpandWidget={() => { setEnlargedTileId(tile.id) }}
                        onEnsureDetail={ensureWidget}
                        onSaveInput={saveWidgetInput}
                        onEmitEvent={emitWidgetEvent}
                        onFilesCall={handleWidgetFilesCall}
                        t={t}
                      />
                    </div>

                    {/* East, South, and Southeast (Kimi Blue Corner) Resize Handles */}
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={t('canvas.resizeDragHint')}
                      title={t('canvas.resizeDragHint')}
                      className={clsx(css.resizeHandle, css.resizeE)}
                      onPointerDown={(ev) => { startBoardInteraction(ev, activeCanvas.id, tile, 'resize', 'e') }}
                      onPointerMove={moveBoardInteraction}
                      onPointerUp={finishBoardInteraction}
                      onPointerCancel={cancelBoardInteraction}
                    />
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label={t('canvas.resizeDragHint')}
                      title={t('canvas.resizeDragHint')}
                      className={clsx(css.resizeHandle, css.resizeS)}
                      onPointerDown={(ev) => { startBoardInteraction(ev, activeCanvas.id, tile, 'resize', 's') }}
                      onPointerMove={moveBoardInteraction}
                      onPointerUp={finishBoardInteraction}
                      onPointerCancel={cancelBoardInteraction}
                      onDoubleClick={() => {
                        void updatePlacementLayout(activeCanvas.id, tile.id, {
                          heightMode: 'auto',
                          interaction: 'resize',
                        })
                      }}
                    />
                    <div
                      role="separator"
                      aria-label={t('canvas.resizeDragHint')}
                      title={t('canvas.resizeDragHint')}
                      className={clsx(
                        css.resizeHandle,
                        css.resizeSe,
                        isInteractingThis && interaction.resizeAxis === 'se' && css.resizeSeActive,
                      )}
                      onPointerDown={(ev) => { startBoardInteraction(ev, activeCanvas.id, tile, 'resize', 'se') }}
                      onPointerMove={moveBoardInteraction}
                      onPointerUp={finishBoardInteraction}
                      onPointerCancel={cancelBoardInteraction}
                      onDoubleClick={() => {
                        void updatePlacementLayout(activeCanvas.id, tile.id, {
                          heightMode: 'auto',
                          interaction: 'resize',
                        })
                      }}
                    />
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Page Bottom Floating Action Bar (`CanvasView .canvas-actions`) */}
      {activeCanvas !== undefined && embeddedInSidebar !== true && (
        <div className={css.floatingActions} onPointerDown={(ev) => { ev.stopPropagation() }}>
          <button
            type="button"
            className={css.iconBtn}
            aria-label={t('canvas.arrange')}
            title={t('canvas.arrange')}
            disabled={activeCanvas.placements.length === 0}
            onClick={() => { void arrangeCanvasById(activeCanvas.id) }}
          >
            <ArrangeGlyph />
          </button>
          <button
            type="button"
            className={css.iconBtn}
            aria-label={t('canvas.refresh')}
            title={t('canvas.refresh')}
            onClick={onRefreshBoard}
          >
            <RefreshGlyph />
          </button>
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
            className={css.iconBtn}
            aria-label={boardFullscreen ? t('canvas.exitFullscreen') : t('canvas.fullscreen')}
            title={boardFullscreen ? t('canvas.exitFullscreen') : t('canvas.fullscreen')}
            onClick={() => { setBoardFullscreen(v => !v) }}
          >
            <EnlargeGlyph />
          </button>
          <div className={css.menuAnchor}>
            <button
              type="button"
              className={css.iconBtn}
              aria-label={t('canvas.moreActions')}
              aria-expanded={boardMenuOpen}
              onClick={() => { setBoardMenuOpen(v => !v) }}
            >
              <MoreGlyph />
            </button>
            {boardMenuOpen && (
              <MenuSurface className={clsx(css.dropdownMenu, css.dropdownMenuUp)} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={clsx(css.menuItem, css.menuItemDanger)}
                  onClick={() => {
                    setBoardMenuOpen(false)
                    void deleteCanvasById(activeCanvas.id)
                  }}
                >
                  <span>{t('canvas.deleteBoard')}</span>
                </button>
              </MenuSurface>
            )}
          </div>
        </div>
      )}

      {/* Kimi Work Single-Widget Enlarge Fullscreen Modal (`CanvasPlacementFullscreen`) */}
      {enlargedTile !== undefined && activeCanvas !== undefined && (
        <div
          className={css.enlargeBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={enlargedTitle}
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) setEnlargedTileId(null)
          }}
        >
          <div className={css.enlargePanel}>
            <header className={css.enlargeBar}>
              <span className={css.enlargeTitle}>{enlargedTitle}</span>
              <div className={css.enlargeActions}>
                <button
                  type="button"
                  className={css.outlineBtn}
                  onClick={() => { void togglePinWindow(enlargedTile.widgetId, enlargedTitle) }}
                >
                  {pinnedIds.includes(enlargedTile.widgetId) ? t('widget.unpinWindow') : t('widget.pinWindow')}
                </button>
                <button
                  type="button"
                  className={css.outlineBtn}
                  onClick={() => {
                    const removingId = enlargedTile.id
                    setEnlargedTileId(null)
                    void removePlacementFromCanvas(activeCanvas.id, removingId)
                  }}
                >
                  {t('canvas.removeTile')}
                </button>
                <button
                  type="button"
                  className={css.iconBtn}
                  aria-label={t('canvas.closeModal')}
                  title={t('canvas.closeModal')}
                  onClick={() => { setEnlargedTileId(null) }}
                >
                  <CloseGlyph />
                </button>
              </div>
            </header>
            <div className={css.enlargeBody}>
              <BlueprintWidgetFrame
                widgetId={enlargedTile.widgetId}
                title={enlargedTitle}
                detail={enlargedDetail}
                status={enlargedWidgetRecord?.status}
                theme={theme}
                locale={localeCode}
                chromeless
                refreshToken={refreshSeq}
                fillHeight
                isPinned={pinnedIds.includes(enlargedTile.widgetId)}
                onEnsureDetail={ensureWidget}
                onSaveInput={saveWidgetInput}
                onEmitEvent={emitWidgetEvent}
                onFilesCall={handleWidgetFilesCall}
                t={t}
              />
            </div>
          </div>
        </div>
      )}
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
  return <DashboardBoardCore initialCanvasId={canvasId} embeddedInSidebar injected={injected} t={t} />
}
