/**
 * Turn-scoped parallel assistant accumulator for persistent
 * `conversation.chat.turnTail` presentation.
 *
 * Publishes:
 * 1. Settled `agent_swarm` batches (`meta.kind === 'swarm_batch'`), preserving
 *    each child's role, preset, outcome, tool count, and conclusion summary.
 * 2. Grouped parallel `subagent` / `subagent_fork` delegations whenever 2 or
 *    more standalone subagents are launched within the same Turn.
 *
 * @module @deepseek-ai/dsh-client-ui-swarm/client/turn-swarm
 */

import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SwarmChildMode, SwarmChildOutcome } from '@deepseek-ai/dsh-swarm-mode/client'

/** One child handle inside a settled `agent_swarm` or grouped `subagent` batch. */
export interface SwarmTurnChildItem {
  readonly name?: string
  readonly childId?: string
  readonly item: string
  readonly role?: string
  readonly preset: string
  readonly mode?: SwarmChildMode
  readonly outcome?: SwarmChildOutcome
  readonly summary?: string
  readonly toolCallCount?: number
}

/** One settled parallel assistant batch recorded on a Turn. */
export interface SwarmTurnBatchItem {
  readonly callId: string
  readonly description: string
  readonly isRoleGroup?: boolean
  readonly preset: string
  readonly children: readonly SwarmTurnChildItem[]
}

/** Immutable Swarm batches published against one Turn. */
export interface SwarmTurnData {
  readonly batches: readonly SwarmTurnBatchItem[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Settled `agent_swarm` and parallel `subagent` batches accumulated in this Turn. */
    swarmBatches: SwarmTurnData
  }
}

interface PendingSubagentCall {
  readonly callId: string
  readonly toolName: string
  readonly description: string
  readonly preset: string
  readonly requestedName?: string
}

interface SwarmTurnState {
  readonly turn: number
  readonly explicitBatches: readonly SwarmTurnBatchItem[]
  readonly pendingSubagentCalls: Readonly<Record<string, PendingSubagentCall>>
  readonly settledSubagents: readonly SwarmTurnChildItem[]
  readonly cachedPublished: readonly SwarmTurnBatchItem[]
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isChildMode(value: unknown): value is SwarmChildMode {
  return value === 'spawn' || value === 'fork' || value === 'resume'
}

function isChildOutcome(value: unknown): value is SwarmChildOutcome {
  return value === 'completed' || value === 'failed' || value === 'aborted'
}

function buildPublishedBatches(
  turn: number,
  explicitBatches: readonly SwarmTurnBatchItem[],
  settledSubagents: readonly SwarmTurnChildItem[],
): readonly SwarmTurnBatchItem[] {
  if (settledSubagents.length < 2) {
    return explicitBatches
  }
  const groupedBatch: SwarmTurnBatchItem = {
    callId: `turn-subagents-${String(turn)}`,
    description: '',
    isRoleGroup: true,
    preset: 'roles',
    children: settledSubagents,
  }
  return [...explicitBatches, groupedBatch]
}

function parseSubagentCallArgs(toolName: string, rawArgs: string): Omit<PendingSubagentCall, 'callId' | 'toolName'> {
  const defaultPreset = toolName === 'subagent_fork' ? 'fork' : 'coder'
  try {
    const parsed: unknown = JSON.parse(rawArgs)
    if (!isPlainRecord(parsed)) {
      return { description: toolName, preset: defaultPreset }
    }
    const description = typeof parsed.description === 'string' && parsed.description.trim() !== ''
      ? parsed.description.trim()
      : toolName
    const preset = toolName === 'subagent_fork'
      ? 'fork'
      : (typeof parsed.agent_preset === 'string' && parsed.agent_preset.trim() !== ''
        ? parsed.agent_preset.trim()
        : defaultPreset)
    const requestedName = typeof parsed.name === 'string' && parsed.name.trim() !== ''
      ? parsed.name.trim()
      : undefined
    return {
      description,
      preset,
      ...(requestedName === undefined ? {} : { requestedName }),
    }
  } catch (_err) {
    // Malformed model JSON falls back to tool-name defaults without throwing in conversation fold.
    return { description: toolName, preset: defaultPreset }
  }
}

/**
 * Select settled parallel assistant batches for `conversation.chat.turnTail`.
 * @param owner - Closing Turn currency.
 * @returns Non-empty batch list, or `null` when the Turn ran no parallel batches.
 */
export function selectSwarmTurnBatches(owner: TurnTailOwnerProps): readonly SwarmTurnBatchItem[] | null {
  const batches = owner.turn.data.get('swarmBatches')?.batches
  return batches === undefined || batches.length === 0 ? null : batches
}

/** Turn-local parallel assistant accumulator; publishes Turn Location data only. */
export const swarmTurnCardsDefinition: ConversationNodeDefinition<SwarmTurnState> = {
  kind: 'swarmBatches',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (
      event.type === 'tool/call'
      && (event.data.name === 'subagent' || event.data.name === 'subagent_fork')
    ) {
      return { id: String(event.data.turn), role: 'update' }
    }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
      return { id: String(event.data.turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('swarmBatches start requires turn/start')
    return {
      turn: match.event.data.turn,
      explicitBatches: [],
      pendingSubagentCalls: {},
      settledSubagents: [],
      cachedPublished: [],
    }
  },
  update: (context, match) => {
    const state = context.state
    if (match.event.type === 'tool/call') {
      const callId = String(match.event.data.callId)
      const parsed = parseSubagentCallArgs(match.event.data.name, match.event.data.arguments)
      return {
        ...state,
        pendingSubagentCalls: {
          ...state.pendingSubagentCalls,
          [callId]: {
            callId,
            toolName: match.event.data.name,
            ...parsed,
          },
        },
      }
    }
    if (match.event.type !== 'tool/result') return state
    if (match.event.data.message.isError === true) return state
    const callId = String(match.event.data.message.source.callId)
    const meta = match.event.data.meta
    if (!isPlainRecord(meta)) return state

    if (meta.kind === 'swarm_batch' && Array.isArray(meta.children)) {
      if (state.explicitBatches.some(b => b.callId === callId)) return state
      const fallbackPreset = typeof meta.preset === 'string' ? meta.preset : 'coder'
      const children: SwarmTurnChildItem[] = []
      for (const raw of meta.children) {
        if (!isPlainRecord(raw) || typeof raw.item !== 'string') continue
        children.push({
          ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
          ...(typeof raw.childId === 'string' ? { childId: raw.childId } : {}),
          item: raw.item,
          ...(typeof raw.role === 'string' ? { role: raw.role } : {}),
          preset: typeof raw.preset === 'string' ? raw.preset : fallbackPreset,
          ...(isChildMode(raw.mode) ? { mode: raw.mode } : {}),
          ...(isChildOutcome(raw.outcome) ? { outcome: raw.outcome } : {}),
          ...(typeof raw.summary === 'string' ? { summary: raw.summary } : {}),
          ...(typeof raw.toolCallCount === 'number' ? { toolCallCount: raw.toolCallCount } : {}),
        })
      }
      if (children.length === 0) return state
      const batch: SwarmTurnBatchItem = {
        callId,
        description: typeof meta.description === 'string' && meta.description.trim() !== ''
          ? meta.description
          : fallbackPreset,
        preset: fallbackPreset,
        children,
      }
      const explicitBatches = [...state.explicitBatches, batch]
      return {
        ...state,
        explicitBatches,
        cachedPublished: buildPublishedBatches(state.turn, explicitBatches, state.settledSubagents),
      }
    }

    if (meta.kind === 'activation' && typeof meta.name === 'string') {
      const pending = state.pendingSubagentCalls[callId]
      if (!pending) return state
      if (state.settledSubagents.some(child => child.name === meta.name)) return state
      const child: SwarmTurnChildItem = {
        name: meta.name,
        item: pending.description,
        preset: pending.preset,
        mode: pending.toolName === 'subagent_fork' ? 'fork' : 'spawn',
      }
      const settledSubagents = [...state.settledSubagents, child]
      return {
        ...state,
        settledSubagents,
        cachedPublished: buildPublishedBatches(state.turn, state.explicitBatches, settledSubagents),
      }
    }

    return state
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    if (
      previous?.kind === 'turn'
      && previous.turn === context.state.turn
      && previous.key === 'swarmBatches'
      && previous.value.batches === context.state.cachedPublished
    ) {
      return previous
    }
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'swarmBatches',
      value: { batches: context.state.cachedPublished },
    }
  },
}
