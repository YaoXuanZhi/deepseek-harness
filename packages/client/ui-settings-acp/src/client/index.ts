/**
 * Browser ACP Models Settings surface (`@deepseek-ai/dsh-client-ui-settings-acp/client`).
 *
 * Registers the ACP subscription providers manager into `settings.models.footer`
 * inside Settings -> Models.
 *
 * @module @deepseek-ai/dsh-client-ui-settings-acp/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  AcpSettingsFooter,
  type AcpSettingsClientState,
  type AcpSettingsFooterProps,
  type AcpSettingsInjected,
} from './AcpSettingsFooter.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type AcpSettingsLocaleKey } from './locales.ts'

export { AcpSettingsFooter }
export type { AcpSettingsClientState, AcpSettingsFooterProps, AcpSettingsInjected, AcpSettingsLocaleKey }

/** Required browser services for `ui-settings-acp`. */
export const inject = [
  'slots',
  'locale',
  'remote',
  'remote.llmAcp',
]

/**
 * Register the ACP subscription providers section inside Settings -> Models.
 * @param ctx - Client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-settings-acp: dictionaries')

  const store = createSnapshotStore<AcpSettingsClientState>({
    loaded: false,
    catalog: {
      revision: 0,
      providers: [],
      authFlows: [],
    },
  })

  const refresh = async (): Promise<void> => {
    const res = await ctx.remote.llmAcp.catalog()
    if (res.ok) {
      store.set({
        loaded: true,
        catalog: res.value,
      })
    }
  }
  void refresh()

  ctx.effect(() => ctx.remote.$on('llm-acp/changed', () => {
    void refresh()
  }), 'ui-settings-acp: remote sse sync')

  const buildInjected = (): AcpSettingsInjected => ({
    hooks: {
      acpState: store,
    },
    searchRegistry: async (query, forceRefresh) => {
      const res = await ctx.remote.llmAcp.searchRegistry({
        query,
        ...(forceRefresh === undefined ? {} : { forceRefresh }),
      })
      if (!res.ok) throw new Error(res.error.message)
      return res.value.agents
    },
    upsertProvider: async (input) => {
      const res = await ctx.remote.llmAcp.upsertProvider(input)
      if (!res.ok) throw new Error(res.error.message)
      await refresh()
      return res.value
    },
    removeProvider: async (providerId) => {
      const res = await ctx.remote.llmAcp.removeProvider(providerId)
      if (!res.ok) throw new Error(res.error.message)
      await refresh()
    },
    probeProvider: async (providerId) => {
      const res = await ctx.remote.llmAcp.probeProvider(providerId)
      if (!res.ok) throw new Error(res.error.message)
      await refresh()
      return res.value.provider
    },
    startAuth: async (providerId, methodId) => {
      const res = await ctx.remote.llmAcp.startAuth({
        providerId,
        ...(methodId === undefined ? {} : { methodId }),
      })
      if (!res.ok) throw new Error(res.error.message)
      await refresh()
      return res.value
    },
    launchTerminalLogin: async (providerId, commandLine) => {
      const res = await ctx.remote.llmAcp.launchTerminalLogin({
        providerId,
        ...(commandLine === undefined ? {} : { commandLine }),
      })
      if (!res.ok) throw new Error(res.error.message)
      return res.value.commandLine
    },
    startTerminalAuth: async (providerId, commandLine, cols, rows) => {
      const res = await ctx.remote.llmAcp.startTerminalAuth({
        providerId,
        ...(commandLine === undefined ? {} : { commandLine }),
        ...(cols === undefined ? {} : { cols }),
        ...(rows === undefined ? {} : { rows }),
      })
      if (!res.ok) throw new Error(res.error.message)
      await refresh()
      return res.value
    },
    writeTerminalAuth: async (sessionId, data, cols, rows) => {
      const res = await ctx.remote.llmAcp.writeTerminalAuth({
        sessionId,
        ...(data === undefined ? {} : { data }),
        ...(cols === undefined ? {} : { cols }),
        ...(rows === undefined ? {} : { rows }),
      })
      if (!res.ok) throw new Error(res.error.message)
    },
    stopTerminalAuth: async (sessionId) => {
      const res = await ctx.remote.llmAcp.stopTerminalAuth({ sessionId })
      if (!res.ok) throw new Error(res.error.message)
      await refresh()
    },
  })

  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: '@deepseek-ai/dsh-client-ui-settings-acp/footer',
    locale: NS,
    inject: buildInjected,
  }, AcpSettingsFooter))
}
