// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { BlueprintWidgetFrame } from '../src/client/BlueprintWidgetFrame.tsx'
import {
  BlueprintAutomationToolView,
  BlueprintTurnTail,
  DaimonCanvasFenceLayer,
  type BlueprintToolViewProps,
  type BlueprintTurnTailProps,
  type DaimonCanvasFenceProps,
} from '../src/client/BlueprintToolViews.tsx'
import {
  BlueprintMainDashboardPage,
  BlueprintRightDashboardTab,
  type BlueprintMainDashboardProps,
  type BlueprintRightTabProps,
} from '../src/client/BlueprintDashboardBoard.tsx'
import { zh, type BlueprintLocaleKey } from '../src/client/locales.ts'
import { blueprintTurnCardsDefinition } from '../src/client/turn-blueprint.ts'
import { createBlueprintFilesDispatcher } from '../src/client/widget-files-host.ts'
import { createWidgetPinController } from '../src/client/widget-pin-host.ts'
import type { BlueprintClientState } from '../src/client/catalog-source.ts'
import type { DesktopWidgetPinEvent, DesktopWidgetPinsBridge } from '@deepseek-ai/dsh-blueprint/client'

function makeT() {
  return (key: BlueprintLocaleKey, params?: Record<string, string | number>): string => {
    let text = zh[key]
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v))
      }
    }
    return text
  }
}

describe('@deepseek-ai/dsh-client-ui-blueprint', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders sandboxed BlueprintWidgetFrame and dispatches Desktop Pin, Pin to dashboard, Open in right panel, and files-call', async () => {
    const onPinWindow = vi.fn()
    const onPin = vi.fn()
    const onOpenRight = vi.fn()
    const onFilesCall = vi.fn().mockResolvedValue({ ok: true, result: 'a,b\n1,2' })

    render(
      <BlueprintWidgetFrame
        widgetId="roi-card"
        title="ROI 测算器"
        fallbackHtml="<!DOCTYPE html><html><body><div>42%</div></body></html>"
        status="running"
        theme="light"
        locale="zh-CN"
        isPinned={false}
        onEnsureDetail={() => { }}
        onSaveInput={() => { }}
        onEmitEvent={() => { }}
        onFilesCall={onFilesCall}
        onTogglePinWindow={onPinWindow}
        onPinToDashboard={onPin}
        onOpenInRight={onOpenRight}
        t={makeT()}
      />,
    )

    expect(screen.getByText('ROI 测算器')).toBeTruthy()
    expect(screen.getByText('正在刷新数据…')).toBeTruthy()
    const iframe = screen.getByTitle('ROI 测算器') as HTMLIFrameElement
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')

    const pinWindowBtn = screen.getByRole('button', { name: '桌面置顶' })
    expect(pinWindowBtn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(pinWindowBtn)
    expect(onPinWindow).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '放入看板' }))
    expect(onPin).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '在侧边栏打开' }))
    expect(onOpenRight).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: {
        channel: 'daimon-widget',
        widgetId: 'roi-card',
        type: 'files-call',
        payload: {
          requestId: 'f1',
          method: 'readText',
          args: { workspacePath: 'workspace/data.csv' },
        },
      },
    }))
    await waitFor(() => {
      expect(onFilesCall).toHaveBeenCalledWith('roi-card', 'readText', { workspacePath: 'workspace/data.csv' })
    })
  })

  it('renders Automation Task Card with disabled-by-default badge, Enable toggle, and Run now button', async () => {
    const setAutomationEnabled = vi.fn().mockResolvedValue(undefined)
    const runAutomationNow = vi.fn().mockResolvedValue(undefined)
    const sampleState: BlueprintClientState = {
      loaded: true,
      catalog: {
        revision: 1,
        widgets: [],
        canvases: [],
        automations: [],
        bindings: [],
      },
      widgetDetails: {},
    }

    render(
      <BlueprintAutomationToolView
        {...({
          phase: 'result',
          callId: 'c1',
          toolName: 'AutomationCreate',
          openFile: () => { },
          loadImage: async () => '',
          useDisclosure: () => ({ expanded: true, setExpanded: () => { }, toggle: () => { } }),
          block: {
            kind: 'tool-result',
            seq: 1,
            time: 1,
            callId: 'c1',
            name: 'AutomationCreate',
            args: PartialArguments.fromObject({ title: '每日晨报抓取' }),
            call: null,
            callTime: null,
            isError: false,
            content: [],
            subCalls: [],
            meta: {
              kind: 'automation',
              action: 'create',
              automationId: 'morning-task',
              title: '每日晨报抓取',
              enabled: false,
              triggerSummary: 'cron 0 9 * * *',
            },
          },
          useBlueprintState: (sel: (s: BlueprintClientState) => unknown) => sel(sampleState),
          useBlueprintTheme: (sel: (th: 'light' | 'dark') => unknown) => sel('light'),
          usePinnedWidgetIds: (sel: (ids: readonly string[]) => unknown) => sel([]),
          handleWidgetFilesCall: vi.fn(),
          togglePinWindow: vi.fn(),
          setAutomationEnabled,
          runAutomationNow,
          t: makeT(),
        } as Partial<BlueprintToolViewProps> as BlueprintToolViewProps)}
      />,
    )

    expect(screen.getByText('每日晨报抓取')).toBeTruthy()
    expect(screen.getByText('默认关闭 · 点击开启')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '开启' }))
    await waitFor(() => { expect(setAutomationEnabled).toHaveBeenCalledWith('morning-task', true) })

    fireEvent.click(screen.getByRole('button', { name: '立即运行' }))
    await waitFor(() => { expect(runAutomationNow).toHaveBeenCalledWith('morning-task') })
  })

  it('renders daimon-canvas Markdown fence card and 12-column Dashboard board', async () => {
    const openDashboardInRight = vi.fn()
    const stateWithBoard: BlueprintClientState = {
      loaded: true,
      catalog: {
        revision: 2,
        widgets: [{
          id: 'w1' as never,
          title: '核心指标卡',
          slots: {},
          events: {},
          latestData: {},
          savedInput: {},
          status: 'idle',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }],
        canvases: [{
          id: 'board-1' as never,
          title: '经营分析看板',
          layoutMode: 'grid',
          placements: [{
            id: 'tile-1' as never,
            widgetId: 'w1' as never,
            rect: { x: 0, y: 0, w: 6, h: 8 },
          }],
          viewState: { zoom: 1, panX: 0, panY: 0 },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }],
        automations: [],
        bindings: [],
      },
      widgetDetails: {},
    }

    render(
      <DaimonCanvasFenceLayer
        {...({
          lang: 'daimon-canvas',
          code: '{"canvasId":"board-1","title":"经营分析看板"}',
          streaming: false,
          children: null,
          openDashboardInRight,
          useBlueprintState: (sel: (s: BlueprintClientState) => unknown) => sel(stateWithBoard),
          t: makeT(),
        } as Partial<DaimonCanvasFenceProps> as DaimonCanvasFenceProps)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /经营分析看板/ }))
    expect(openDashboardInRight).toHaveBeenCalledWith('board-1')

    cleanup()
    const updatePlacementLayout = vi.fn().mockResolvedValue(undefined)
    const setCanvasZoom = vi.fn().mockResolvedValue(undefined)
    const openDashboardInMain = vi.fn()
    const stateWithDetail: BlueprintClientState = {
      ...stateWithBoard,
      widgetDetails: {
        w1: {
          id: 'w1' as never,
          title: '核心指标卡',
          slots: {},
          events: {},
          latestData: {},
          savedInput: {},
          status: 'idle',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          rawHtml: '<div>Tall Overview</div>',
          assembledHtml: '<!DOCTYPE html><html><body><div>Tall Overview</div></body></html>',
        },
      },
    }

    render(
      <BlueprintRightDashboardTab
        {...({
          useTabInfo: (() => ({ tab: { id: 't1', kind: 'blueprintDashboard', navigation: { params: { canvasId: 'board-1' } } } })) as never,
          useBlueprintState: (sel: (s: BlueprintClientState) => unknown) => sel(stateWithDetail),
          useBlueprintTheme: (sel: (th: 'light' | 'dark') => unknown) => sel('light'),
          usePinnedWidgetIds: (sel: (ids: readonly string[]) => unknown) => sel([]),
          localeCode: 'zh-CN',
          ensureWidget: () => { },
          saveWidgetInput: () => { },
          emitWidgetEvent: () => { },
          handleWidgetFilesCall: vi.fn(),
          togglePinWindow: vi.fn(),
          openDashboardInMain,
          createCanvas: async () => undefined,
          placeWidgetOnCanvas: async () => { },
          resizePlacementWidth: async () => { },
          updatePlacementLayout,
          setCanvasZoom,
          removePlacementFromCanvas: async () => { },
          deleteCanvasById: async () => { },
          t: makeT(),
        } as Partial<BlueprintRightTabProps> as BlueprintRightTabProps)}
      />,
    )

    expect(screen.getAllByText('核心指标卡').length).toBeGreaterThanOrEqual(2)
    const boardIframe = screen.getByTitle('核心指标卡') as HTMLIFrameElement

    // Auto-fit tall widget height beyond 720px without clipping in Right Sidebar
    window.dispatchEvent(new MessageEvent('message', {
      source: boardIframe.contentWindow,
      data: {
        channel: 'daimon-widget',
        widgetId: 'w1',
        type: 'resize',
        payload: { height: 960 },
      },
    }))
    await waitFor(() => {
      expect(boardIframe.parentElement?.style.height).toBe('960px')
    })

    // Toggle Fill panel, Toggle Width, Zoom In, and Open Full Page
    fireEvent.click(screen.getByRole('button', { name: '铺满面板' }))
    expect(updatePlacementLayout).toHaveBeenCalledWith('board-1', 'tile-1', { heightMode: 'fill' })

    fireEvent.click(screen.getByRole('button', { name: '通栏（12 列）' }))
    expect(updatePlacementLayout).toHaveBeenCalledWith('board-1', 'tile-1', { rect: { w: 12 } })

    fireEvent.click(screen.getByRole('button', { name: '放大显示比例' }))
    expect(setCanvasZoom).toHaveBeenCalledWith('board-1', 1.1)

    fireEvent.click(screen.getByRole('button', { name: '全屏看板页' }))
    expect(openDashboardInMain).toHaveBeenCalledTimes(1)

    // Interactive bottom drag resize + double-click reset to auto height
    const separators = screen.getAllByRole('separator', { name: /拖拽调节显示区域/ })
    const bottomHandle = separators[0]
    if (!bottomHandle) throw new Error('Expected bottom resize handle')
    fireEvent.pointerDown(bottomHandle, { button: 0, pointerId: 7, clientX: 200, clientY: 300 })
    fireEvent.pointerMove(bottomHandle, { pointerId: 7, clientX: 200, clientY: 480 })
    fireEvent.pointerUp(bottomHandle, { pointerId: 7, clientX: 200, clientY: 480 })
    expect(updatePlacementLayout).toHaveBeenCalledWith(
      'board-1',
      'tile-1',
      expect.objectContaining({ heightMode: 'fixed' }),
    )

    fireEvent.doubleClick(bottomHandle)
    expect(updatePlacementLayout).toHaveBeenCalledWith('board-1', 'tile-1', { heightMode: 'auto' })

    cleanup()
    render(
      <BlueprintMainDashboardPage
        {...({
          useBlueprintState: (sel: (s: BlueprintClientState) => unknown) => sel(stateWithBoard),
          useBlueprintTheme: (sel: (th: 'light' | 'dark') => unknown) => sel('dark'),
          usePinnedWidgetIds: (sel: (ids: readonly string[]) => unknown) => sel([]),
          localeCode: 'zh-CN',
          ensureWidget: () => { },
          saveWidgetInput: () => { },
          emitWidgetEvent: () => { },
          handleWidgetFilesCall: vi.fn(),
          togglePinWindow: vi.fn(),
          openDashboardInMain: () => { },
          createCanvas: async () => undefined,
          placeWidgetOnCanvas: async () => { },
          resizePlacementWidth: async () => { },
          updatePlacementLayout: async () => { },
          setCanvasZoom: async () => { },
          removePlacementFromCanvas: async () => { },
          deleteCanvasById: async () => { },
          t: makeT(),
        } as Partial<BlueprintMainDashboardProps> as BlueprintMainDashboardProps)}
      />,
    )
    expect(screen.getAllByText('核心指标卡').length).toBeGreaterThanOrEqual(2)
  })

  it('accumulates settled Turn Widget & Automation cards and renders BlueprintTurnTail inline', () => {
    const startMatch = {
      event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 0 } },
      role: 'start' as const,
      location: { kind: 'session' as const },
    }
    const s0 = blueprintTurnCardsDefinition.start({} as never, startMatch as never, {} as never)
    const s1 = blueprintTurnCardsDefinition.update({ state: s0 } as never, {
      role: 'update',
      location: { kind: 'session' },
      event: {
        type: 'tool/result',
        seq: 2,
        time: 2,
        surfaceOp: 'append',
        data: {
          turn: 0,
          message: { isError: false },
          meta: {
            kind: 'widget',
            action: 'validate',
            widgetId: 'calc-1',
            valid: true,
            title: '推理成本计算器',
            assembledHtml: '<!DOCTYPE html><html><body>OK</body></html>',
          },
        },
      },
    } as never)
    const s2 = blueprintTurnCardsDefinition.update({ state: s1 } as never, {
      role: 'update',
      location: { kind: 'session' },
      event: {
        type: 'tool/result',
        seq: 3,
        time: 3,
        surfaceOp: 'append',
        data: {
          turn: 0,
          message: { isError: false },
          meta: {
            kind: 'automation',
            action: 'create',
            automationId: 'price-watch',
            title: '模型价格巡检',
            enabled: false,
            triggerSummary: 'cron 0 9 * * 1',
          },
        },
      },
    } as never)
    const loc = blueprintTurnCardsDefinition.buildLocationData?.({ state: s2 } as never, 'turn', null)
    expect(loc?.key).toBe('blueprintCards')

    const emptyState: BlueprintClientState = {
      loaded: true,
      catalog: { revision: 1, widgets: [], canvases: [], automations: [], bindings: [] },
      widgetDetails: {},
    }
    render(
      <BlueprintTurnTail
        {...({
          turn: {
            turn: 0,
            start: undefined,
            end: undefined,
            status: 'closed',
            steps: [],
            data: {
              get: (k: string) => (k === 'blueprintCards' ? loc?.value : undefined),
              source: () => ({ getSnapshot: () => undefined, subscribe: () => () => { } }),
            },
          },
          seq: 4,
          openFile: () => { },
          useBlueprintState: (sel: (s: BlueprintClientState) => unknown) => sel(emptyState),
          useBlueprintTheme: (sel: (th: 'light' | 'dark') => unknown) => sel('light'),
          usePinnedWidgetIds: (sel: (ids: readonly string[]) => unknown) => sel(['calc-1']),
          localeCode: 'zh-CN',
          ensureWidget: () => { },
          saveWidgetInput: () => { },
          emitWidgetEvent: () => { },
          handleWidgetFilesCall: vi.fn(),
          togglePinWindow: vi.fn(),
          pinWidgetToDashboard: async () => { },
          setAutomationEnabled: async () => { },
          runAutomationNow: async () => { },
          t: makeT(),
        } as Partial<BlueprintTurnTailProps> as BlueprintTurnTailProps)}
      />,
    )

    expect(screen.getByTitle('推理成本计算器')).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消置顶' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('模型价格巡检')).toBeTruthy()
    expect(screen.getByRole('button', { name: '开启' })).toBeTruthy()
  })

  it('dispatches DaimonWidget.files write/readText/download and manages Desktop + Web floating Pin Windows', async () => {
    const fakeRef = {
      kind: 'file' as const,
      fileId: 'file-1' as never,
      name: 'report.csv',
      mimeType: 'text/csv',
      sizeBytes: 12,
      sha256: '0'.repeat(64),
      source: 'widget-output' as const,
      createdAt: '2026-01-01T00:00:00Z',
    }
    const mockRemote = {
      writeManagedFile: vi.fn().mockResolvedValue({ ok: true, value: fakeRef }),
      readFileText: vi.fn().mockResolvedValue({ ok: true, value: { text: 'col1,col2\n1,2' } }),
      createFileResourceUrl: vi.fn().mockResolvedValue({ ok: true, value: { url: '/blueprint/resources/blob/file-1?token=abc' } }),
    }
    const dispatcher = createBlueprintFilesDispatcher(mockRemote as never)

    const writeOutcome = await dispatcher.dispatch('w1', 'write', {
      name: 'report.csv',
      mimeType: 'text/csv',
      encoding: 'utf8',
      data: 'col1,col2\n1,2',
    })
    expect(writeOutcome).toEqual({ ok: true, result: fakeRef })

    const desktopSaveMock = vi.fn().mockResolvedValue({ status: 'cancelled' })
    const winWithDesktop = window as Window & {
      dshDesktop?: {
        fileActions?: { save: typeof desktopSaveMock }
        widgetPins?: DesktopWidgetPinsBridge
      }
    }
    winWithDesktop.dshDesktop = { fileActions: { save: desktopSaveMock } }

    const dlCancelled = await dispatcher.dispatch('w1', 'download', {
      fileRef: fakeRef,
      suggestedFilename: 'custom.csv',
    })
    expect(desktopSaveMock).toHaveBeenCalledTimes(1)
    expect(dlCancelled).toEqual({
      ok: true,
      result: { cancelled: true, reasonCode: 'download_cancelled' },
    })

    // Verify Electron Desktop floating Pin Window bridge
    let upstreamListener: ((ev: DesktopWidgetPinEvent) => void) | undefined
    const openSpy = vi.fn().mockResolvedValue({ pinned: true, alwaysOnTop: true })
    const closeSpy = vi.fn().mockResolvedValue(true)
    const replyFilesSpy = vi.fn().mockResolvedValue(undefined)
    winWithDesktop.dshDesktop = {
      widgetPins: {
        open: openSpy,
        sync: vi.fn().mockResolvedValue(true),
        close: closeSpy,
        list: vi.fn().mockResolvedValue([]),
        replyFilesCall: replyFilesSpy,
        subscribe: (listener) => {
          upstreamListener = listener
          return () => { upstreamListener = undefined }
        },
      },
    }

    const baseState: BlueprintClientState = {
      loaded: true,
      catalog: { revision: 1, widgets: [], canvases: [], automations: [], bindings: [] },
      widgetDetails: {},
    }
    const onSaveInput = vi.fn()
    const desktopPinCtrl = createWidgetPinController({
      getState: () => baseState,
      getTheme: () => 'light',
      getLocale: () => 'zh-CN',
      getLabels: () => ({
        alwaysOnTopOn: '置顶窗口',
        alwaysOnTopOff: '取消窗口置顶',
        focusWorkspace: '回到主界面',
        close: '关闭悬浮窗',
      }),
      ensureWidget: async () => undefined,
      onSaveInput,
      onEmitEvent: () => { },
      onOpenCanvas: () => { },
      filesDispatcher: dispatcher,
    })

    await desktopPinCtrl.togglePin('w1', '测试小组件', '<!DOCTYPE html><html><body>Pinned</body></html>')
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(desktopPinCtrl.pinnedIds.getSnapshot()).toEqual(['w1'])

    upstreamListener?.({ kind: 'save-input', widgetId: 'w1', input: { k: 1 } })
    expect(onSaveInput).toHaveBeenCalledWith('w1', { k: 1 })

    upstreamListener?.({
      kind: 'files-call',
      widgetId: 'w1',
      requestId: 'req-9',
      method: 'readText',
      args: { fileId: 'file-1' },
    })
    await waitFor(() => {
      expect(replyFilesSpy).toHaveBeenCalledWith({
        widgetId: 'w1',
        requestId: 'req-9',
        ok: true,
        result: 'col1,col2\n1,2',
      })
    })

    await desktopPinCtrl.togglePin('w1', '测试小组件')
    expect(closeSpy).toHaveBeenCalledWith('w1')
    expect(desktopPinCtrl.pinnedIds.getSnapshot()).toEqual([])
    desktopPinCtrl.dispose()
    delete winWithDesktop.dshDesktop
  })
})
