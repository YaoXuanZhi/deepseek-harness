/**
 * Browser Swarm mode surface (`@deepseek-ai/dsh-client-ui-swarm/client`).
 *
 * Registers:
 * 1. The `集群` (`Swarm`) composer toggle chip in `conversation.input.left`.
 * 2. The Swarm-active empty-editor placeholder in `conversation.input.placeholder`.
 * 3. The Parallel Assistant Matrix Card for `agent_swarm` in `tool.call.toolview`.
 *
 * @module @deepseek-ai/dsh-client-ui-swarm/client
 */

import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { } from '@deepseek-ai/dsh-api-remotes/client'
import type { } from '@deepseek-ai/dsh-api-session-controller/client'
import type { } from '@deepseek-ai/dsh-client-locale/client'
import type { } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputPlaceholderOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { } from '@deepseek-ai/dsh-client-ui-session/client'
import type { } from '@deepseek-ai/dsh-client-ui-session-status/client'
import type { } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
import type { } from '@deepseek-ai/dsh-swarm-mode/client'
import { de, en, es, fr, ja, NS, pt, ru, zh, type SwarmLocaleKey } from './locales.ts'
import { SwarmModeControl } from './SwarmModeControl.tsx'
import { SwarmToolView, SwarmTurnTail } from './SwarmToolView.tsx'
import { swarmTurnCardsDefinition } from './turn-swarm.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Swarm mode chip and parallel assistant matrix copy. */
    swarm: SwarmLocaleKey
  }
}

/** Injected callbacks for the Composer Swarm toggle chip. */
export interface SwarmControlInjected {
  /**
   * Execute `/swarm` (`nextActive === true`) or `/swarm off` (`nextActive === false`).
   * @param nextActive - Target Swarm mode state.
   * @returns Null on accepted command execution, or an error string on failure.
   */
  toggleSwarmMode: (nextActive: boolean) => Promise<string | null>
}

/** Injected callbacks for the `agent_swarm` matrix card. */
export interface SwarmBatchInjected {
  /**
   * Open one child assistant's live conversation inside the Right Sidebar.
   * @param address - Direct-parent subagent address.
   */
  openChildAside: (address: SubagentAddress) => void
  /**
   * Request projection hydration when `subagentCatalog` has not been fetched yet,
   * or force a catalog refresh while an in-flight batch is spawning children.
   * @param parentSessionId - Parent session owning the Swarm batch.
   * @param force - When true, refreshes projections even if an earlier snapshot exists.
   */
  ensureParentCatalog?: (parentSessionId: SessionId, force?: boolean) => void
}

export type { SwarmChipProps } from './SwarmModeControl.tsx'
export type { SwarmToolViewProps, SwarmTurnTailProps } from './SwarmToolView.tsx'
export type { SwarmTurnBatchItem, SwarmTurnChildItem, SwarmTurnData } from './turn-swarm.ts'

function subagentChatResourceUri(address: SubagentAddress): string {
  const query = new URLSearchParams({
    parent: address.parentSessionId,
    mode: address.mode,
  })
  return `dsh-resource://subagentchat/session/${encodeURIComponent(address.childSessionId)}?${query.toString()}`
}

function SwarmPlaceholder({ t }: PropsRuntime<'conversation.input.placeholder'> & PropsLocale<'swarm'>): ReactNode {
  return t('placeholder.active')
}

/** Required browser services for Swarm mode controls and matrix cards. */
export const inject = [
  'slots',
  'locale',
  'uiConversation',
  'remote',
  'remote.commands',
  'sessions',
  'sidebarRight',
  'uiSession.sessionStatus',
]

/**
 * Register the Swarm composer toggle, placeholder, and `agent_swarm` tool view.
 * @param ctx - Client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(swarmTurnCardsDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-swarm: dictionaries')

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'swarm-mode',
    order: 20,
    locale: NS,
    inject: (sessionId: SessionId): SwarmControlInjected => ({
      async toggleSwarmMode(nextActive: boolean): Promise<string | null> {
        const line = nextActive ? '/swarm' : '/swarm off'
        const outcome = await ctx.remote.commands.execute(sessionId, line, [])
        if (!outcome.ok) return `${outcome.error.message} (${outcome.error.code})`
        if (outcome.value === undefined) return `unknown command: ${line}`
        await ctx.sessions.refreshProjections(sessionId)
        return null
      },
    }),
  }, SwarmModeControl))

  ctx.slots.inject('conversation.input.placeholder', () => ctx.slots.register({
    name: 'conversation.input.placeholder',
    priority: 5,
    locale: NS,
    select: ({ sessionId }: InputPlaceholderOwnerProps) => {
      const proj = ctx.sessions.list.getSnapshot().projectionsBySession[sessionId]
      if (proj?.state !== 'ready') return null
      const swarm = proj.values.swarm
      if (swarm === undefined) return null
      const active = swarm.pending ? !swarm.active : swarm.active
      return active ? {} : null
    },
  }, SwarmPlaceholder))

  const buildBatchInjected = (): SwarmBatchInjected => ({
    openChildAside(address: SubagentAddress) {
      ctx.sidebarRight.openResource(subagentChatResourceUri(address), {
        kind: 'subagentchat',
        preferNewPane: true,
      })
    },
    ensureParentCatalog(parentSessionId: SessionId, force = false) {
      const snap = ctx.sessions.list.getSnapshot().projectionsBySession[parentSessionId]
      if ((force || snap?.values.subagentCatalog === undefined) && snap?.state !== 'loading') {
        void ctx.sessions.refreshProjections(parentSessionId)
      }
    },
  })

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'agent_swarm',
    locale: NS,
    inject: buildBatchInjected,
  }, SwarmToolView))

  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: '@deepseek-ai/dsh-client-ui-swarm/turn-tail',
    locale: NS,
    inject: buildBatchInjected,
  }, SwarmTurnTail))
}
