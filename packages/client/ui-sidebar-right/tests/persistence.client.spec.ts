/** Per-Session layout recovery precedes resource-body rendering. */
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { createSidebarRightStore } from '../src/client/stores.ts'
import { createSidebarRightController } from '../src/client/service.ts'
import { SidebarRightTabRegistry } from '../src/client/tab-registry.ts'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function storage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  })
  return values
}

const sessionId = 'first' as SessionId
const seed = () => ({ kind: 'guide', title: 'Start' })

it('restores current layout independently by Session with a fresh undo history', () => {
  storage()
  const handle = createSidebarRightStore(seed)
  const first = handle.create(sessionId)
  let file!: TabId
  first.actions.openContent(sessionId, { kind: 'text', contentId: 'file:a', title: 'a' }, (id) => { file = id })
  let floating!: TabId
  first.actions.openContent(sessionId, { kind: 'text', contentId: 'file:b', title: 'b' }, (id) => { floating = id })
  first.actions.floatTab(sessionId, floating, { x: 20, y: 30, width: 480, height: 320 })
  first.actions.focusTab(sessionId, file)
  first.actions.setMode(sessionId, 'fullscreen')
  const second = handle.create('second')
  second.actions.open('second')
  const saved = first.getSnapshot()
  const restored = createSidebarRightStore(seed).create(sessionId)
  const recovered = { bySession: { [sessionId]: { ...saved.bySession[sessionId], history: { entries: [], cursor: 0 } } } }
  expect(restored.getSnapshot()).toEqual(recovered)
  expect(createSidebarRightStore(seed).create('second').getSnapshot()).toEqual(second.getSnapshot())
  expect(createSidebarRightStore(seed).create('new').getSnapshot()).toEqual({ bySession: {} })
  restored.actions.undo(sessionId)
  restored.actions.redo(sessionId)
  expect(restored.getSnapshot()).toEqual(recovered)
  restored.actions.setExpanded(sessionId, false)
  expect(createSidebarRightStore(seed).create(sessionId).getSnapshot().bySession[sessionId]!.layout.expanded).toBe(false)
  restored.clearPersisted()
  expect(createSidebarRightStore(seed).create(sessionId).getSnapshot()).toEqual({ bySession: {} })
  expect(createSidebarRightStore(seed).create('second').getSnapshot()).toEqual(second.getSnapshot())
})

it('removes transient occurrences from docked and floating layouts before restoring a Session', () => {
  storage()
  const first = createSidebarRightStore(seed).create(sessionId)
  const open = (contentId: string, destination: 'sidebar' | 'float') => {
    first.actions.openContent(sessionId, { kind: 'preview', contentId, title: contentId, destination }, () => {})
  }
  open('sidebar://preview', 'sidebar')
  open('sidebar://preview/content/summary', 'sidebar')
  open('sidebar://preview/content/diagram', 'float')
  const restored = createSidebarRightStore(seed).create(sessionId).getSnapshot().bySession[sessionId]!.layout
  expect(Object.values(restored.tabs).map(tab => tab.contentId)).toEqual(['sidebar://preview'])
  expect(restored.floats).toEqual([])
  expect(restored.expanded).toBe(true)
  const active = restored.nodes[restored.activePaneId]
  expect(active?.kind === 'pane' && active.activeTabId).toBe(Object.values(restored.tabs)[0]!.id)
})

it('collapses a restored sidebar whose only tab was transient', () => {
  storage()
  const first = createSidebarRightStore(seed).create(sessionId)
  first.actions.openContent(sessionId, { kind: 'preview', contentId: 'sidebar://preview/content/1', title: 'Summary', destination: 'sidebar' }, () => {})
  first.actions.setMode(sessionId, 'fullscreen')
  const restored = createSidebarRightStore(seed).create(sessionId).getSnapshot().bySession[sessionId]!
  expect(restored.layout).toMatchObject({ expanded: false, mode: 'push', tabs: {}, floats: [] })
  expect(restored.history.entries).toHaveLength(0)
})

it('pins restored records during adoption before the first render or store mutation', async () => {
  storage()
  const first = createSidebarRightStore(seed).create(sessionId)
  let file!: TabId
  const address = 'dsh-resource://file/session/first/a.txt'
  first.actions.openContent(sessionId, { kind: 'text', contentId: address, title: 'a' }, (id) => { file = id })
  const ctx = new Context()
  const pin = vi.fn()
  const { controller, adopt } = createSidebarRightController(new SidebarRightTabRegistry(ctx), pin, {
    autoFullscreen: () => false,
    openWithFocus: (_sessionId, open) => { open() },
    closeWithFocus: (_sessionId, _paneId, close) => { close() },
  })
  expect(controller.tabsIn(sessionId)).toEqual([])
  const restored = createSidebarRightStore(seed).create(sessionId)
  const release = adopt(sessionId, restored)
  try {
    const occurrence = controller.tabDomain.occurrence(sessionId, { id: file })
    expect(controller.tabsIn(sessionId)).toEqual([{ id: file, kind: 'text', contentId: address, title: 'a' }])
    expect(pin).toHaveBeenCalledWith(address, occurrence.signal)
    expect(occurrence.navigation.getSnapshot().address).toBe(address)
    restored.actions.closeTab(sessionId, file)
    expect(occurrence.signal.aborted).toBe(true)
  } finally {
    release()
    controller.tabDomain.dispose()
    await ctx.fiber.dispose()
  }
})

it('merges legacy saved two-pane split layouts into a single docked pane and deduplicates pages', () => {
  const values = storage()
  const writeSplit = (activePaneId: string, leftActive: string, rightActive: string, floats: readonly string[] = []) => {
    values.set(`dsh.sidebar-right.v1.${sessionId}`, JSON.stringify({
      bySession: {
        [sessionId]: {
          minted: 8,
          layout: {
            rootId: 'split3',
            floats,
            activePaneId,
            expanded: true,
            mode: 'push',
            nodes: {
              split3: { kind: 'split', id: 'split3', axis: 'row', children: ['pane1', 'pane4'], sizes: [0.5, 0.5] },
              pane1: { kind: 'pane', id: 'pane1', host: 'dock', tabs: ['tab2', 'tab5'], activeTabId: leftActive },
              pane4: { kind: 'pane', id: 'pane4', host: 'dock', tabs: ['tab6', 'tab7'], activeTabId: rightActive },
              ...(floats.length === 0 ? {} : {
                float8: { kind: 'pane', id: 'float8', host: 'float', tabs: ['tab8'], activeTabId: 'tab8', rect: { x: 10, y: 20, width: 320, height: 240 } },
              }),
            },
            tabs: {
              tab2: { id: 'tab2', kind: 'guide', contentId: 'sidebar://guide', title: 'Start' },
              tab5: { id: 'tab5', kind: 'text', contentId: 'file:a', title: 'a' },
              tab6: { id: 'tab6', kind: 'guide', contentId: 'sidebar://guide', title: 'Start' },
              tab7: { id: 'tab7', kind: 'text', contentId: 'file:b', title: 'b' },
              ...(floats.length === 0 ? {} : {
                tab8: { id: 'tab8', kind: 'files', contentId: 'sidebar://files', title: 'Files' },
              }),
            },
          },
        },
      },
    }))
  }

  writeSplit('pane4', 'tab5', 'tab6')
  const rightGuideActive = createSidebarRightStore(seed).create(sessionId).getSnapshot().bySession[sessionId]!.layout
  expect(rightGuideActive.rootId).toBe('pane1')
  expect(Object.keys(rightGuideActive.nodes)).toEqual(['pane1'])
  expect(rightGuideActive.nodes[rightGuideActive.rootId]).toMatchObject({ tabs: ['tab2', 'tab5', 'tab7'], activeTabId: 'tab2' })

  writeSplit('pane1', 'tab5', 'tab6')
  const leftFileActive = createSidebarRightStore(seed).create(sessionId).getSnapshot().bySession[sessionId]!.layout
  expect(leftFileActive.nodes[leftFileActive.rootId]).toMatchObject({ tabs: ['tab2', 'tab5', 'tab7'], activeTabId: 'tab5' })

  writeSplit('float8', 'tab5', 'tab7', ['float8'])
  const floatActive = createSidebarRightStore(seed).create(sessionId).getSnapshot().bySession[sessionId]!.layout
  expect(floatActive.rootId).toBe('pane1')
  expect(floatActive.activePaneId).toBe('float8')
  expect(floatActive.floats).toEqual(['float8'])
})

it('starts from an empty layout when stored JSON is corrupt and keeps working when storage rejects writes', () => {
  const values = storage()
  values.set(`dsh.sidebar-right.v1.${sessionId}`, '{broken')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const instance = createSidebarRightStore(seed).create(sessionId)
  expect(instance.getSnapshot()).toEqual({ bySession: {} })
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
  instance.actions.setExpanded(sessionId, true)
  expect(instance.getSnapshot().bySession[sessionId]!.layout.expanded).toBe(true)
})
