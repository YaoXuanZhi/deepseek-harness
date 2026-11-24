/**
 * Pure type declarations for Swarm collaboration mode, subagent live activity
 * projections, and `agent_swarm` multi-role batch synthesis.
 *
 * Free of Host-side Cordis service merges so both `./types` and `./client`
 * may import it safely across Host and Client compiler faces.
 *
 * @module @deepseek-ai/dsh-swarm-mode/types
 */

import type { CommandId } from '@deepseek-ai/dsh-commands/types'
import type {} from '@deepseek-ai/dsh-session-projection/types'

/** Client-visible wire projection of Swarm mode for one Session. */
export interface SwarmProjection {
  /** Whether Swarm mode is currently active for the Session. */
  readonly active: boolean
  /** Whether a `/swarm` command is currently running and changing mode. */
  readonly pending: boolean
}

/** Folded internal projection state of the `swarm` projection unit. */
export interface SwarmUnitState {
  readonly active: boolean
  readonly running: {
    readonly commandId: CommandId
    readonly wanted: boolean
  } | null
  readonly entered: boolean
}

/** Fine-grained live activity category reported for an active subagent cell. */
export type SubagentBusyKind =
  | 'thinking'
  | 'search'
  | 'read'
  | 'write'
  | 'run'
  | 'browse'
  | 'analyze'
  | 'work'

/** Summary-delivered live activity and conclusion digest for a subagent Session. */
export interface SubagentActivityProjection {
  /** Total tool calls invoked in this subagent's own turns. */
  readonly toolCallCount: number
  /** Current live activity while a turn is open, or `null` once idle. */
  readonly busyKind: SubagentBusyKind | null
  /** Concise 1-2 sentence executive takeaway from the latest assistant response, or `null`. */
  readonly summary: string | null
}

/** Internal fold state for `subagentActivityProjectionDefinition`. */
export interface SubagentActivityUnitState {
  readonly descriptorSeen: boolean
  readonly pendingTurnOpen: boolean
  readonly turnOpen: boolean
  readonly toolCallCount: number
  readonly openCalls: readonly {
    readonly callId: string
    readonly busyKind: SubagentBusyKind
  }[]
  readonly summary: string | null
}

/** Launch mode for one child entry inside an `agent_swarm` batch. */
export type SwarmChildMode = 'spawn' | 'fork' | 'resume'

/** Terminal outcome of one child entry inside an `agent_swarm` batch. */
export type SwarmChildOutcome = 'completed' | 'failed' | 'aborted'

/** Heterogeneous specialist role specification accepted by `agent_swarm.roles`. */
export interface SwarmRoleSpec {
  /** Display role title for this specialist (for example `架构师` or `安全审计`). */
  readonly role: string
  /** Specialist preset (`coder`, `explore`, or `plan`); defaults to `defaultPreset`. */
  readonly preset?: string
  /** Complete, self-contained task prompt assigned to this specialist role. */
  readonly prompt: string
}

/** One settled or in-flight child record returned by `agent_swarm`. */
export interface SwarmChildLaunch {
  /** Managed subagent handle name (for example `agent-1`). */
  readonly name: string
  /** Durable child Session id when resolvable. */
  readonly childId?: string
  /** Assigned item label or role task summary. */
  readonly item: string
  /** Explicit role perspective name when launched via `roles`. */
  readonly role?: string
  /** Specialist preset selected for this child (`coder`, `explore`, `plan`, `fork`, or `resume`). */
  readonly preset: string
  /** Execution mode (`spawn`, `fork`, or `resume`). */
  readonly mode?: SwarmChildMode
  /** Terminal outcome collected by `agent_swarm`. */
  readonly outcome?: SwarmChildOutcome
  /** Concise 1-2 sentence conclusion digest extracted from the child's response. */
  readonly summary?: string
  /** Total tool calls executed by this child. */
  readonly toolCallCount?: number
}

/** Structured output of one whole-batch `agent_swarm` invocation. */
export interface SwarmBatchOutput {
  readonly kind: 'swarm_batch'
  readonly description: string
  readonly preset: string
  readonly fork: boolean
  readonly count: number
  readonly completedCount: number
  readonly failedCount: number
  readonly abortedCount: number
  readonly xml: string
  readonly children: readonly SwarmChildLaunch[]
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Swarm collaboration mode folded from `/swarm` command execution. */
    swarm: SwarmProjection
    /** Live tool count, fine-grained activity, and conclusion digest for subagent sessions. */
    subagentActivity: SubagentActivityProjection | null
  }
}
