/** Validated current-layout snapshots; undo history belongs to the live window. */
import { z } from 'zod'
import {
  applyOp, createIdMinter, dockPaneIds, EMPTY_HISTORY, findPaneContentTab,
  getPane, getTab, planPlaceTab, planSettle, replay, type LayoutState,
} from '@deepseek-ai/dsh-client-ui-dockkit'
import { isContentTab, pageAddress } from './contract/seed.ts'
import type { SurfaceState } from './stores.ts'

/** Persistence namespace shared by scoped stores and startup discovery. */
export const sidebarPersistence = 'dsh.sidebar-right.v1'

const paneId = z.string().regex(/^(?:pane|float)[1-9][0-9]*$/u)
const splitId = z.string().regex(/^split[1-9][0-9]*$/u)
const tabId = z.string().regex(/^tab[1-9][0-9]*$/u)
const nodeId = z.union([paneId, splitId])
const rectangle = z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() })
const node = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pane'), id: paneId, host: z.enum(['dock', 'float']), tabs: z.array(tabId), activeTabId: tabId.optional(), rect: rectangle.optional() }),
  z.object({ kind: z.literal('split'), id: splitId, axis: z.enum(['row', 'column']), children: z.array(nodeId).min(2), sizes: z.array(z.number().positive()).min(2) }),
])
const layout = z.object({
  nodes: z.record(nodeId, node),
  tabs: z.record(tabId, z.object({ id: tabId, kind: z.string().min(1), contentId: z.string().min(1), title: z.string() })),
  rootId: nodeId, floats: z.array(paneId), activePaneId: paneId,
  expanded: z.boolean(), mode: z.enum(['push', 'fullscreen']),
})
const surface = z.object({ layout, minted: z.int().nonnegative() })
const envelope = z.object({ bySession: z.record(z.string(), z.unknown()) })

function validateReferences(value: z.infer<typeof surface>): void {
  const { layout, minted } = value
  const reject: () => never = () => { throw new Error('Invalid saved sidebar layout references') }
  const visited = new Set<string>()
  const usedTabs = new Set<string>()
  const pending = [{ id: layout.rootId, host: 'dock' }, ...layout.floats.map(id => ({ id, host: 'float' }))]
  for (const [id, entry] of [...Object.entries(layout.nodes), ...Object.entries(layout.tabs)]) {
    if (entry.id !== id || Number(id.replace(/^[a-z]+/u, '')) > minted) reject()
  }
  for (const { id, host } of pending) {
    const entry = layout.nodes[id]
    if (visited.has(id) || entry === undefined) reject()
    visited.add(id)
    if (entry.kind === 'split') {
      if (host !== 'dock' || id !== layout.rootId || entry.axis !== 'row' || entry.children.length !== 2
        || entry.children.length !== entry.sizes.length
        || Math.abs(entry.sizes.reduce((sum, size) => sum + size, 0) - 1) > 1e-9) reject()
      pending.push(...entry.children.map(id => ({ id, host })))
    } else {
      if (entry.host !== host || (host === 'float' ? entry.rect === undefined || entry.tabs.length !== 1 : entry.rect !== undefined)) reject()
      if (entry.tabs.length === 0 ? entry.activeTabId !== undefined : !entry.tabs.includes(entry.activeTabId ?? '')) reject()
      for (const tab of entry.tabs) {
        if (usedTabs.has(tab) || layout.tabs[tab] === undefined) reject()
        usedTabs.add(tab)
      }
    }
  }
  if (visited.size !== Object.keys(layout.nodes).length || usedTabs.size !== Object.keys(layout.tabs).length
    || layout.nodes[layout.activePaneId]?.kind !== 'pane') reject()
}

function collapseSplitPanes(layout: LayoutState, minted: number): LayoutState {
  const [primary, ...secondary] = dockPaneIds(layout)
  /* v8 ignore next -- validated layouts always hold at least one docked pane. */
  if (primary === undefined || secondary.length === 0) return layout
  const activePane = getPane(layout, layout.activePaneId)
  let activeTabId = activePane.host === 'dock' ? activePane.activeTabId : undefined
  let merged = layout
  for (const paneId of secondary) {
    for (const tabId of [...getPane(merged, paneId).tabs]) {
      const tab = getTab(merged, tabId)
      const duplicate = tab.contentId === pageAddress(tab.kind)
        ? findPaneContentTab(merged, primary, tab.contentId, tab.kind)
        : undefined
      if (duplicate !== undefined) {
        if (activeTabId === tabId) activeTabId = duplicate
        merged = applyOp(merged, { type: 'closeTab', tabId }).state
      } else {
        merged = replay(merged, planPlaceTab(merged, tabId, primary, getPane(merged, primary).tabs.length))
      }
    }
  }
  merged = replay(merged, planSettle(merged, createIdMinter(minted).next))
  return activeTabId !== undefined
    ? applyOp(merged, { type: 'focusTab', tabId: activeTabId }).state
    : applyOp(merged, { type: 'focusPane', paneId: activePane.id }).state
}

function restoredLayout(layout: LayoutState, minted: number): LayoutState {
  const transient = Object.values(layout.tabs).filter(isContentTab)
  if (transient.length === 0 && dockPaneIds(layout).length <= 1) return layout
  let restored = layout
  for (const tab of transient) restored = applyOp(restored, { type: 'closeTab', tabId: tab.id }).state
  if (transient.length > 0) restored = replay(restored, planSettle(restored, createIdMinter(minted).next))
  restored = collapseSplitPanes(restored, minted)
  if (getPane(restored, restored.rootId).tabs.length === 0) {
    return { ...restored, expanded: false, mode: 'push' }
  }
  return restored
}

/**
 * Restore one validated Session layout with a fresh in-window undo history.
 * @param sessionId - storage scope.
 * @returns the saved surface, or undefined when absent, inaccessible or invalid.
 */
export function readSidebarLayout(sessionId: string): SurfaceState | undefined {
  if (typeof localStorage === 'undefined') return undefined
  let raw: string | null
  try { raw = localStorage.getItem(`${sidebarPersistence}.${sessionId}`) }
  catch (_storageUnavailable) { return undefined }
  if (raw === null) return undefined
  try {
    const saved = envelope.parse(JSON.parse(raw)).bySession[sessionId]
    if (saved === undefined) return undefined
    const parsed = surface.parse(saved)
    validateReferences(parsed)
    return { layout: restoredLayout(parsed.layout as unknown as LayoutState, parsed.minted), minted: parsed.minted, history: EMPTY_HISTORY }
  } catch (_invalidLayout) {
    clearSidebarLayout(sessionId)
    return undefined
  }
}

/**
 * Persist current layout and identity allocation without retaining undo entries.
 * @param sessionId - storage scope.
 * @param surface - current in-memory surface.
 */
export function writeSidebarLayout(sessionId: string, surface: SurfaceState): void {
  if (typeof localStorage === 'undefined') return
  const saved = { bySession: { [sessionId]: { layout: surface.layout, minted: surface.minted } } }
  try { localStorage.setItem(`${sidebarPersistence}.${sessionId}`, JSON.stringify(saved)) }
  catch (error) { console.error('Sidebar layout persistence failed:', error) }
}

/**
 * Remove only one Session's persisted layout.
 * @param sessionId - storage scope to discard.
 */
export function clearSidebarLayout(sessionId: string): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.removeItem(`${sidebarPersistence}.${sessionId}`) }
  catch (_storageUnavailable) { /* The invalid layout is still excluded from this window. */ }
}
