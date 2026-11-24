/**
 * Turn-scoped Blueprint Widget & Automation card accumulator for persistent
 * `conversation.chat.turnTail` presentation.
 *
 * When a Turn finishes, `ui-chat` collapses intermediate `tool.call.toolview`
 * steps inside the process disclosure. This Definition collects settled
 * non-error `Widget` (`show` or validated single/pair creation) and
 * `AutomationCreate` / `AutomationUpdate` results per Turn so interactive
 * Widgets and Automation Task Cards remain visible inline below the closing
 * assistant message, matching Kimi Work.
 *
 * @module @deepseek-ai/dsh-client-ui-blueprint/client/turn-blueprint
 */

import type { BlueprintWidgetStatus } from '@deepseek-ai/dsh-blueprint/client'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Settled Widget preview item recorded on a Turn. */
export interface BlueprintTurnWidgetItem {
  readonly widgetId: string
  readonly title: string
  readonly explicitShow: boolean
  readonly status?: BlueprintWidgetStatus
  readonly assembledHtml?: string
}

/** Settled Automation Task Card item recorded on a Turn. */
export interface BlueprintTurnAutomationItem {
  readonly automationId: string
  readonly title: string
  readonly enabled: boolean
  readonly triggerSummary: string
  readonly lastRunStatus?: string
}

/** Immutable Blueprint cards published against one Turn. */
export interface BlueprintTurnData {
  readonly widgets: readonly BlueprintTurnWidgetItem[]
  readonly automations: readonly BlueprintTurnAutomationItem[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Settled Widget previews and Automation Task Cards accumulated in this Turn. */
    blueprintCards: BlueprintTurnData
  }
}

interface BlueprintTurnState extends BlueprintTurnData {
  readonly turn: number
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWidgetStatus(value: unknown): value is BlueprintWidgetStatus {
  return value === 'idle'
    || value === 'running'
    || value === 'error'
    || value === 'degraded'
    || value === 'needs_input'
}

/**
 * Select Blueprint Widget and Automation cards to display in `conversation.chat.turnTail`.
 *
 * If the Turn includes any explicit `Widget` `show` calls, only those explicitly
 * shown Widgets are rendered; otherwise up to two validated Widgets built in the
 * Turn are rendered so single-widget dashboard turns still surface an inline
 * interactive preview without flooding multi-widget board builds.
 *
 * @param owner - Turn-tail owner currency for the closing Turn.
 * @returns Matched Widget and Automation items, or `null` when the Turn produced none.
 */
export function selectBlueprintTurnCards(owner: TurnTailOwnerProps): BlueprintTurnData | null {
  const data = owner.turn.data.get('blueprintCards')
  if (data === undefined) return null
  const explicitWidgets = data.widgets.filter(item => item.explicitShow)
  const widgets = explicitWidgets.length > 0
    ? explicitWidgets
    : (data.widgets.length <= 2 ? data.widgets : [])
  if (widgets.length === 0 && data.automations.length === 0) return null
  return { widgets, automations: data.automations }
}

/** Turn-local Blueprint card accumulator; publishes Turn Location data only. */
export const blueprintTurnCardsDefinition: ConversationNodeDefinition<BlueprintTurnState> = {
  kind: 'blueprintCards',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/result' && event.surfaceOp === 'append') {
      return { id: String(event.data.turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('blueprintCards start requires turn/start')
    return { turn: match.event.data.turn, widgets: [], automations: [] }
  },
  update: (context, match) => {
    if (match.event.type !== 'tool/result') return context.state
    if (match.event.data.message.isError === true) return context.state
    const meta = match.event.data.meta
    if (!isPlainRecord(meta)) return context.state

    if (meta.kind === 'widget' && typeof meta.widgetId === 'string' && meta.widgetId.length > 0) {
      const isShow = meta.action === 'show'
      const isValid = meta.action === 'validate' && meta.valid === true
      const isMetaUpdate = meta.action === 'create' || meta.action === 'update'
      const existingIdx = context.state.widgets.findIndex(item => item.widgetId === meta.widgetId)
      if (!isShow && !isValid && existingIdx === -1) return context.state
      if (isMetaUpdate && existingIdx === -1) return context.state

      const prev = existingIdx >= 0 ? context.state.widgets[existingIdx] : undefined
      const nextItem: BlueprintTurnWidgetItem = {
        widgetId: meta.widgetId,
        title: typeof meta.title === 'string' && meta.title.length > 0
          ? meta.title
          : (prev?.title ?? meta.widgetId),
        explicitShow: (prev?.explicitShow ?? false) || isShow,
        ...(isWidgetStatus(meta.status)
          ? { status: meta.status }
          : (prev?.status === undefined ? {} : { status: prev.status })),
        ...(typeof meta.assembledHtml === 'string'
          ? { assembledHtml: meta.assembledHtml }
          : (prev?.assembledHtml === undefined ? {} : { assembledHtml: prev.assembledHtml })),
      }
      const nextWidgets = [...context.state.widgets]
      if (existingIdx >= 0) nextWidgets[existingIdx] = nextItem
      else nextWidgets.push(nextItem)
      return { ...context.state, widgets: nextWidgets }
    }

    if (
      meta.kind === 'automation'
      && (meta.action === 'create' || meta.action === 'update')
      && typeof meta.automationId === 'string'
      && meta.automationId.length > 0
    ) {
      const existingIdx = context.state.automations.findIndex(item => item.automationId === meta.automationId)
      const prev = existingIdx >= 0 ? context.state.automations[existingIdx] : undefined
      const nextAuto: BlueprintTurnAutomationItem = {
        automationId: meta.automationId,
        title: typeof meta.title === 'string' && meta.title.length > 0
          ? meta.title
          : (prev?.title ?? meta.automationId),
        enabled: typeof meta.enabled === 'boolean' ? meta.enabled : (prev?.enabled ?? false),
        triggerSummary: typeof meta.triggerSummary === 'string'
          ? meta.triggerSummary
          : (prev?.triggerSummary ?? ''),
        ...(typeof meta.lastRunStatus === 'string'
          ? { lastRunStatus: meta.lastRunStatus }
          : (prev?.lastRunStatus === undefined ? {} : { lastRunStatus: prev.lastRunStatus })),
      }
      const nextAutomations = [...context.state.automations]
      if (existingIdx >= 0) nextAutomations[existingIdx] = nextAuto
      else nextAutomations.push(nextAuto)
      return { ...context.state, automations: nextAutomations }
    }

    return context.state
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    if (
      previous?.kind === 'turn'
      && previous.turn === context.state.turn
      && previous.key === 'blueprintCards'
      && previous.value.widgets === context.state.widgets
      && previous.value.automations === context.state.automations
    ) {
      return previous
    }
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'blueprintCards',
      value: {
        widgets: context.state.widgets,
        automations: context.state.automations,
      },
    }
  },
}
