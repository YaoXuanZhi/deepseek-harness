/**
 * Browser Blueprint surface (`@deepseek-ai/dsh-client-ui-blueprint/client`).
 *
 * Registers:
 * 1. Left Sidebar `看板` (`Dashboards`) navigation item (`sidebar.panellist`) and full-page board (`main`).
 * 2. Right Sidebar Dashboard tab (`ctx.sidebarRightTabs` + `sidebar.right.pane.tab` + `sidebar.right.pane.tab.title`).
 * 3. Keyed Tool Views (`tool.call.toolview`) for `Widget`, `Canvas`, `Binding`,
 *    `AutomationCreate`, `AutomationUpdate`, and `AutomationControl`.
 * 4. Markdown `daimon-canvas` fence layer (`conversation.chat.markdown.fence`).
 *
 * @module @deepseek-ai/dsh-client-ui-blueprint/client
 */

import { createElement, type ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BlueprintGridRect, BlueprintPlacementHeightMode } from '@deepseek-ai/dsh-blueprint/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { createBlueprintCatalogController, type BlueprintClientState } from './catalog-source.ts'
import { BlueprintMainDashboardPage, BlueprintRightDashboardTab } from './BlueprintDashboardBoard.tsx'
import {
  BlueprintAutomationToolView,
  BlueprintBindingToolView,
  BlueprintCanvasToolView,
  BlueprintTurnTail,
  BlueprintWidgetToolView,
  DaimonCanvasFenceLayer,
} from './BlueprintToolViews.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type BlueprintLocaleKey } from './locales.ts'
import { blueprintTurnCardsDefinition } from './turn-blueprint.ts'
import { createBlueprintFilesDispatcher, type WidgetFilesCallOutcome } from './widget-files-host.ts'
import { createWidgetPinController } from './widget-pin-host.ts'

/** Sidebar panel id for the global `看板` (`Dashboards`) page. */
export const DASHBOARDS_PANEL_ID = 'dashboards' as MainPanelId
/** Right-Sidebar tab implementation id for Blueprint Dashboards. */
export const BLUEPRINT_DASHBOARD_TAB_ID = '@deepseek-ai/dsh-client-ui-blueprint/dashboard'
/** Right-Sidebar tab kind for Blueprint Dashboards. */
export const BLUEPRINT_DASHBOARD_TAB_KIND = 'blueprintDashboard'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Blueprint widgets, dashboards, and automation task cards copy. */
    blueprint: BlueprintLocaleKey
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** Optional target Canvas id opened in the Right Sidebar. */
    blueprintDashboard: { readonly canvasId?: string }
  }
}

/** Layout patch accepted by `updatePlacementLayout` for interactive Dashboard resizing and moving. */
export interface BlueprintPlacementLayoutPatch {
  readonly rect?: Partial<BlueprintGridRect> | undefined
  readonly heightMode?: BlueprintPlacementHeightMode | undefined
  readonly pixelHeight?: number | undefined
  readonly interaction?: 'move' | 'resize' | undefined
}

/** Shared injected face across Blueprint tool views, fences, and Dashboard pages. */
export interface BlueprintViewInjected {
  readonly hooks: {
    readonly blueprintState: HostObservable<BlueprintClientState>
    readonly blueprintTheme: HostObservable<'light' | 'dark'>
    readonly pinnedWidgetIds: HostObservable<readonly string[]>
  }
  readonly localeCode: string
  readonly ensureWidget: (widgetId: string) => void
  readonly saveWidgetInput: (widgetId: string, input: Readonly<Record<string, JsonValue>>) => void
  readonly emitWidgetEvent: (widgetId: string, event: string, data: JsonValue) => void
  readonly handleWidgetFilesCall: (widgetId: string, method: string, args: unknown) => Promise<WidgetFilesCallOutcome>
  readonly togglePinWindow: (widgetId: string, title: string, fallbackHtml?: string) => Promise<void>
  readonly pinWidgetToDashboard: (widgetId: string, title: string, openAside?: boolean) => Promise<void>
  readonly openDashboardInRight: (canvasId?: string) => void
  readonly openDashboardInMain: () => void
  readonly createCanvas: (title: string) => Promise<string | undefined>
  readonly placeWidgetOnCanvas: (canvasId: string, widgetId: string) => Promise<void>
  readonly resizePlacementWidth: (canvasId: string, placementId: string, w: number) => Promise<void>
  readonly updatePlacementLayout: (canvasId: string, placementId: string, patch: BlueprintPlacementLayoutPatch) => Promise<void>
  readonly arrangeCanvasById: (canvasId: string) => Promise<void>
  readonly refreshCatalog: () => Promise<void>
  readonly setCanvasZoom: (canvasId: string, zoom: number) => Promise<void>
  readonly removePlacementFromCanvas: (canvasId: string, placementId: string) => Promise<void>
  readonly deleteCanvasById: (canvasId: string) => Promise<void>
  readonly setAutomationEnabled: (automationId: string, enabled: boolean) => Promise<void>
  readonly runAutomationNow: (automationId: string) => Promise<void>
}

export type { BlueprintMainDashboardProps, BlueprintRightTabProps } from './BlueprintDashboardBoard.tsx'
export type { BlueprintToolViewProps, BlueprintTurnTailProps, DaimonCanvasFenceProps } from './BlueprintToolViews.tsx'
export type { BlueprintTileControlsProps, BlueprintWidgetFrameProps } from './BlueprintWidgetFrame.tsx'
export type { BlueprintTurnAutomationItem, BlueprintTurnData, BlueprintTurnWidgetItem } from './turn-blueprint.ts'
export type { BlueprintFilesDispatcher, WidgetFilesCallOutcome, WidgetFilesHostError } from './widget-files-host.ts'
export type { WidgetPinController, WidgetPinControllerDeps } from './widget-pin-host.ts'

function DashboardsNavIcon(props: { readonly className?: string | undefined }): ReactNode {
  return createElement(
    'svg',
    {
      width: '16',
      height: '16',
      viewBox: '0 0 18 18',
      fill: 'none',
      'aria-hidden': 'true',
      ...(props.className === undefined ? {} : { className: props.className }),
    },
    createElement('rect', { x: '2.2', y: '2.2', width: '6', height: '6', rx: '1.5', stroke: 'currentColor', strokeWidth: '1.4' }),
    createElement('rect', { x: '9.8', y: '2.2', width: '6', height: '3.8', rx: '1.3', stroke: 'currentColor', strokeWidth: '1.4' }),
    createElement('rect', { x: '9.8', y: '7.6', width: '6', height: '8.2', rx: '1.5', stroke: 'currentColor', strokeWidth: '1.4' }),
    createElement('rect', { x: '2.2', y: '9.8', width: '6', height: '6', rx: '1.5', stroke: 'currentColor', strokeWidth: '1.4' }),
  )
}

type DashboardTabTitleProps =
  PropsRuntime<'sidebar.right.pane.tab.title'>
  & InjectFace<{ readonly hooks: { readonly blueprintState: HostObservable<BlueprintClientState> } }>
  & PropsLocale<'blueprint'>

function BlueprintDashboardTabTitle({ useTabInfo, useBlueprintState, t }: DashboardTabTitleProps): ReactNode {
  const { tab } = useTabInfo()
  const params = tab.navigation.params as { readonly canvasId?: string } | undefined
  const canvases = useBlueprintState(s => s.catalog.canvases)
  const matched = params?.canvasId ? canvases.find(c => c.id === params.canvasId) : canvases[0]
  return matched?.title ?? t('tab.dashboard')
}

/** Required browser services for Blueprint UI surfaces. */
export const inject = [
  'slots',
  'locale',
  'uiConversation',
  'remote',
  'remote.blueprint',
  'layout',
  'sidebarRightTabs',
  'sidebarRight',
  'theme',
]

/**
 * Register all Browser Blueprint surfaces, tool views, and Markdown fences.
 * @param ctx - Client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(blueprintTurnCardsDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-blueprint: dictionaries')
  const t = ctx.locale.bind(NS)

  const controller = createBlueprintCatalogController({
    catalog: () => ctx.remote.blueprint.catalog(),
    getWidget: id => ctx.remote.blueprint.getWidget(id),
  })
  void controller.refresh()

  ctx.effect(() => ctx.remote.$on('blueprint/changed', () => {
    void controller.refresh()
  }), 'ui-blueprint: catalog sse sync')

  const themeStore = createSnapshotStore<'light' | 'dark'>(ctx.theme.getTheme().active.colorScheme)
  const filesDispatcher = createBlueprintFilesDispatcher(ctx.remote.blueprint)

  const openDashboardInRight = (canvasId?: string): void => {
    try {
      ctx.sidebarRight.openTab(BLUEPRINT_DASHBOARD_TAB_KIND, {
        params: canvasId ? { canvasId } : {},
      })
    } catch (_openErr) {
      ctx.layout.selectPanel(DASHBOARDS_PANEL_ID)
    }
  }

  const openDashboardInMain = (): void => {
    ctx.layout.selectPanel(DASHBOARDS_PANEL_ID)
  }

  const saveWidgetInput = (widgetId: string, input: Readonly<Record<string, JsonValue>>): void => {
    void ctx.remote.blueprint.saveWidgetInput({ widgetId, input }).then(() => controller.refresh(), () => {})
  }

  const emitWidgetEvent = (widgetId: string, event: string, data: JsonValue): void => {
    void ctx.remote.blueprint.emitWidgetEvent({ widgetId, event, data }).then(() => controller.refresh(), () => {})
  }

  const pinController = createWidgetPinController({
    getState: () => controller.source.getSnapshot(),
    getTheme: () => themeStore.getSnapshot(),
    getLocale: () => ctx.locale.getLocale().active,
    getLabels: () => ({
      alwaysOnTopOn: t('widget.pinAlwaysOnTop'),
      alwaysOnTopOff: t('widget.pinUnpinTop'),
      focusWorkspace: t('widget.pinFocusWorkspace'),
      close: t('widget.pinClose'),
    }),
    ensureWidget: id => controller.ensureWidget(id),
    onSaveInput: saveWidgetInput,
    onEmitEvent: emitWidgetEvent,
    onOpenCanvas: (canvasId) => { openDashboardInRight(canvasId) },
    filesDispatcher,
  })
  ctx.effect(() => () => { pinController.dispose() }, 'ui-blueprint: widget pin windows')
  ctx.effect(() => controller.source.subscribe(() => { pinController.syncAll() }), 'ui-blueprint: pin state sync')

  ctx.on('theme/change', (snapshot) => {
    themeStore.set(snapshot.active.colorScheme)
    pinController.syncAll()
  })

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: BLUEPRINT_DASHBOARD_TAB_ID,
    kind: BLUEPRINT_DASHBOARD_TAB_KIND,
    priority: 'builtin',
    title: () => t('tab.dashboard'),
    guide: [{
      id: 'dashboard',
      order: 30,
      title: () => t('tab.dashboard'),
      description: () => t('canvas.subtitle'),
      icon: DashboardsNavIcon,
    }],
  }), 'ui-blueprint: right tab definition')

  const updatePlacementLayout = async (
    canvasId: string,
    placementId: string,
    patch: BlueprintPlacementLayoutPatch,
  ): Promise<void> => {
    await ctx.remote.blueprint.updatePlacement({
      canvasId,
      placementId,
      ...(patch.rect === undefined ? {} : { rect: patch.rect }),
      ...(patch.heightMode === undefined ? {} : { heightMode: patch.heightMode }),
      ...(patch.pixelHeight === undefined ? {} : { pixelHeight: patch.pixelHeight }),
      ...(patch.interaction === undefined ? {} : { interaction: patch.interaction }),
      reflow: true,
    }).catch(() => {})
    await controller.refresh()
  }

  const buildInjected = (): BlueprintViewInjected => ({
    hooks: {
      blueprintState: controller.source,
      blueprintTheme: themeStore,
      pinnedWidgetIds: pinController.pinnedIds,
    },
    localeCode: ctx.locale.getLocale().active,
    ensureWidget: (widgetId) => {
      void controller.ensureWidget(widgetId)
    },
    saveWidgetInput,
    emitWidgetEvent,
    handleWidgetFilesCall: (widgetId, method, args) => filesDispatcher.dispatch(widgetId, method, args),
    togglePinWindow: (widgetId, title, fallbackHtml) => pinController.togglePin(widgetId, title, fallbackHtml),
    pinWidgetToDashboard: async (widgetId, title, openAside = true) => {
      const snap = controller.source.getSnapshot().catalog
      const firstCanvas = snap.canvases[0]
      let targetCanvasId = firstCanvas?.id
      const isEmptyCanvas = !firstCanvas || firstCanvas.placements.length === 0
      if (!targetCanvasId) {
        const created = await ctx.remote.blueprint.createCanvas({ title: t('nav.dashboards') })
        if (created.ok) targetCanvasId = created.value.id
      }
      if (targetCanvasId) {
        await ctx.remote.blueprint.placeWidget({
          canvasId: targetCanvasId,
          widgetId,
          titleOverride: title,
          rect: { w: isEmptyCanvas ? 12 : 6, h: 10 },
          heightMode: 'auto',
        }).catch(() => {})
        await controller.refresh()
        if (openAside) {
          openDashboardInRight(targetCanvasId)
        }
      }
    },
    openDashboardInRight,
    openDashboardInMain,
    createCanvas: async (title) => {
      const res = await ctx.remote.blueprint.createCanvas({ title })
      await controller.refresh()
      return res.ok ? res.value.id : undefined
    },
    placeWidgetOnCanvas: async (canvasId, widgetId) => {
      const targetCanvas = controller.source.getSnapshot().catalog.canvases.find(c => c.id === canvasId)
      const isEmptyCanvas = !targetCanvas || targetCanvas.placements.length === 0
      await ctx.remote.blueprint.placeWidget({
        canvasId,
        widgetId,
        rect: { w: isEmptyCanvas ? 12 : 6, h: 10 },
        heightMode: 'auto',
      }).catch(() => {})
      await controller.refresh()
    },
    resizePlacementWidth: async (canvasId, placementId, w) => {
      await updatePlacementLayout(canvasId, placementId, { rect: { w }, interaction: 'resize' })
    },
    updatePlacementLayout,
    arrangeCanvasById: async (canvasId) => {
      await ctx.remote.blueprint.arrangeCanvas(canvasId).catch(() => {})
      await controller.refresh()
    },
    refreshCatalog: () => controller.refresh(),
    setCanvasZoom: async (canvasId, zoom) => {
      const current = controller.source.getSnapshot().catalog.canvases.find(c => c.id === canvasId)?.viewState
      await ctx.remote.blueprint.setCanvasViewState({
        canvasId,
        viewState: {
          zoom,
          panX: current?.panX ?? 0,
          panY: current?.panY ?? 0,
        },
      }).catch(() => {})
      await controller.refresh()
    },
    removePlacementFromCanvas: async (canvasId, placementId) => {
      await ctx.remote.blueprint.removePlacement({ canvasId, placementId }).catch(() => {})
      await controller.refresh()
    },
    deleteCanvasById: async (canvasId) => {
      await ctx.remote.blueprint.deleteCanvas(canvasId).catch(() => {})
      await controller.refresh()
    },
    setAutomationEnabled: async (automationId, enabled) => {
      await ctx.remote.blueprint.setAutomationEnabled({ id: automationId, enabled }).catch(() => {})
      await controller.refresh()
    },
    runAutomationNow: async (automationId) => {
      await ctx.remote.blueprint.runAutomation({ id: automationId, triggeredBy: 'manual' }).catch(() => {})
      await controller.refresh()
    },
  })

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: DASHBOARDS_PANEL_ID,
    order: 8,
    locale: NS,
    label: () => t('nav.dashboards'),
  }, DashboardsNavIcon))

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: DASHBOARDS_PANEL_ID,
    locale: NS,
    inject: buildInjected,
  }, BlueprintMainDashboardPage))

  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: BLUEPRINT_DASHBOARD_TAB_ID,
    locale: NS,
    inject: buildInjected,
  }, BlueprintRightDashboardTab))

  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: BLUEPRINT_DASHBOARD_TAB_ID,
    locale: NS,
    inject: () => ({ hooks: { blueprintState: controller.source } }),
  }, BlueprintDashboardTabTitle))

  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({
      name: 'tool.call.toolview',
      key: 'Widget',
      locale: NS,
      inject: buildInjected,
    }, BlueprintWidgetToolView)
    yield ctx.slots.register({
      name: 'tool.call.toolview',
      key: 'Canvas',
      locale: NS,
      inject: buildInjected,
    }, BlueprintCanvasToolView)
    yield ctx.slots.register({
      name: 'tool.call.toolview',
      key: 'Binding',
      locale: NS,
      inject: buildInjected,
    }, BlueprintBindingToolView)
    yield ctx.slots.register({
      name: 'tool.call.toolview',
      key: 'AutomationCreate',
      locale: NS,
      inject: buildInjected,
    }, BlueprintAutomationToolView)
    yield ctx.slots.register({
      name: 'tool.call.toolview',
      key: 'AutomationUpdate',
      locale: NS,
      inject: buildInjected,
    }, BlueprintAutomationToolView)
    yield ctx.slots.register({
      name: 'tool.call.toolview',
      key: 'AutomationControl',
      locale: NS,
      inject: buildInjected,
    }, BlueprintAutomationToolView)
  })

  ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register({
    name: 'conversation.chat.markdown.fence',
    key: 'daimon-canvas',
    id: '@deepseek-ai/dsh-client-ui-blueprint/fence/daimon-canvas',
    locale: NS,
    inject: buildInjected,
  }, DaimonCanvasFenceLayer))

  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: '@deepseek-ai/dsh-client-ui-blueprint/turn-tail',
    locale: NS,
    inject: buildInjected,
  }, BlueprintTurnTail))
}
