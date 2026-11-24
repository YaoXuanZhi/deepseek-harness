/**
 * Reactive Browser catalog source over `ctx.remote.blueprint` and
 * `blueprint/changed` SSE notifications.
 */

import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type {
  BlueprintCatalogSnapshot,
  BlueprintWidgetDetail,
} from '@deepseek-ai/dsh-blueprint/client'

/** Snapshot exposed to Blueprint UI components via framework-bound hooks. */
export interface BlueprintClientState {
  readonly loaded: boolean
  readonly catalog: BlueprintCatalogSnapshot
  readonly widgetDetails: Readonly<Record<string, BlueprintWidgetDetail>>
}

const EMPTY_CATALOG: BlueprintCatalogSnapshot = {
  revision: 0,
  widgets: [],
  canvases: [],
  automations: [],
  bindings: [],
}

/** Remote client subset consumed by the Blueprint catalog source. */
export interface BlueprintRemoteDriver {
  catalog: () => Promise<{ readonly ok: boolean; readonly value?: BlueprintCatalogSnapshot }>
  getWidget: (id: string) => Promise<{ readonly ok: boolean; readonly value?: BlueprintWidgetDetail }>
}

/** Managed Blueprint client state source. */
export interface BlueprintCatalogController {
  readonly source: ObservableSnapshot<BlueprintClientState>
  refresh: () => Promise<void>
  ensureWidget: (id: string) => Promise<void>
}

/**
 * Create one shared reactive Blueprint catalog source for the plugin fiber.
 * @param driver - Remote blueprint RPC methods.
 * @returns Observable source plus refresh and widget-detail fetch actions.
 */
export function createBlueprintCatalogController(driver: BlueprintRemoteDriver): BlueprintCatalogController {
  const store = createSnapshotStore<BlueprintClientState>({
    loaded: false,
    catalog: EMPTY_CATALOG,
    widgetDetails: {},
  })
  const inflightWidgets = new Set<string>()

  const ensureWidget = async (id: string): Promise<void> => {
    const trimmed = id.trim()
    if (!trimmed || inflightWidgets.has(trimmed)) return
    inflightWidgets.add(trimmed)
    try {
      let res: Awaited<ReturnType<BlueprintRemoteDriver['getWidget']>> | undefined
      try {
        res = await driver.getWidget(trimmed)
      } catch (error) {
        // Offline or unmounted Host keeps existing cached or meta-provided HTML.
        void error
      }
      if (res?.ok && res.value !== undefined) {
        const detail = res.value
        const prev = store.getSnapshot()
        store.set({
          ...prev,
          widgetDetails: {
            ...prev.widgetDetails,
            [trimmed]: detail,
          },
        })
      }
    } finally {
      inflightWidgets.delete(trimmed)
    }
  }

  const refresh = async (): Promise<void> => {
    let res: Awaited<ReturnType<BlueprintRemoteDriver['catalog']>> | undefined
    try {
      res = await driver.catalog()
    } catch (error) {
      // Retain last known snapshot across transient transport reconnects.
      void error
    }
    if (!res?.ok || res.value === undefined) return
    const catalog = res.value
    const prev = store.getSnapshot()
    store.set({
      loaded: true,
      catalog,
      widgetDetails: prev.widgetDetails,
    })
    // Refresh already-loaded widget details so live Binding updates push into open iframes
    for (const id of Object.keys(prev.widgetDetails)) {
      void ensureWidget(id)
    }
  }

  return {
    source: store,
    refresh,
    ensureWidget,
  }
}
