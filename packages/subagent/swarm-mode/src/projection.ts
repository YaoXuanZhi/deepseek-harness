/**
 * Swarm session projections (`swarm` and `subagentActivity`), template
 * expansion, conclusion digest extraction, and `<agent_swarm_result>` XML
 * synthesis helpers.
 *
 * @module @deepseek-ai/dsh-swarm-mode/projection
 */

import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {
  SubagentActivityProjection,
  SubagentActivityUnitState,
  SubagentBusyKind,
  SwarmChildOutcome,
  SwarmProjection,
  SwarmUnitState,
} from './types.ts'

/** Wire name of the parallel subagent fan-out and multi-role synthesis tool. */
export const AGENT_SWARM_TOOL = 'agent_swarm'

const swarmRunningSchema = zod.object({
  commandId: zod.custom<SwarmUnitState['running'] extends infer R ? R extends { commandId: infer C } ? C : never : never>(
    val => typeof val === 'string',
  ),
  wanted: zod.boolean(),
}).strict()

const swarmUnitStateSchema: ZodType<SwarmUnitState> = zod.object({
  active: zod.boolean(),
  running: swarmRunningSchema.nullable(),
  entered: zod.boolean(),
}).strict()

const swarmProjectionSchema: ZodType<SwarmProjection> = zod.object({
  active: zod.boolean(),
  pending: zod.boolean(),
})

/** Session projection folding `/swarm` command runs and completions. */
export const swarmProjectionDefinition = {
  key: 'swarm',
  stateVersion: 1,
  stateSchema: swarmUnitStateSchema,
  init: (): SwarmUnitState => ({ active: false, running: null, entered: false }),
  apply: (state, event): SwarmUnitState => {
    if (event.type === 'command/run' && event.data.name === 'swarm') {
      const raw = (event.data.args ?? '').trim()
      const wanted = raw !== 'off'
      return { ...state, running: { commandId: event.data.commandId, wanted } }
    }
    if (event.type === 'command/done' && state.running !== null && event.data.commandId === state.running.commandId) {
      if (event.data.kind !== 'success') {
        return { ...state, running: null }
      }
      const nextActive = state.running.wanted
      return {
        active: nextActive,
        running: null,
        entered: state.entered || nextActive,
      }
    }
    return state
  },
  wire: {
    viewSchema: swarmProjectionSchema,
    view: (state): SwarmProjection => ({
      active: state.active,
      pending: state.running !== null && state.running.wanted !== state.active,
    }),
  },
} satisfies ProjectionDefinition<'swarm', SwarmUnitState>

const busyKindSchema: ZodType<SubagentBusyKind> = zod.enum([
  'thinking',
  'search',
  'read',
  'write',
  'run',
  'browse',
  'analyze',
  'work',
])

const openCallSchema = zod.object({
  callId: zod.string(),
  busyKind: busyKindSchema,
}).strict()

const subagentActivityStateSchema: ZodType<SubagentActivityUnitState> = zod.object({
  descriptorSeen: zod.boolean(),
  pendingTurnOpen: zod.boolean(),
  turnOpen: zod.boolean(),
  toolCallCount: zod.number().int().nonnegative(),
  openCalls: zod.array(openCallSchema),
  summary: zod.string().nullable(),
}).strict()

const subagentActivityViewSchema: ZodType<SubagentActivityProjection | null> = zod.object({
  toolCallCount: zod.number().int().nonnegative(),
  busyKind: busyKindSchema.nullable(),
  summary: zod.string().nullable(),
}).strict().nullable()

/**
 * Map a tool name to Kimi Work's fine-grained subagent activity state.
 * @param toolName - Invoked tool wire name.
 * @returns Activity category for live matrix display.
 */
export function classifyToolBusyKind(toolName: string): SubagentBusyKind {
  switch (toolName) {
    case 'glob':
    case 'grep':
      return 'search'
    case 'read':
      return 'read'
    case 'write':
    case 'edit':
    case 'apply_patch':
    case 'todo_write':
      return 'write'
    case 'bash':
    case 'pwsh':
    case 'bash_persistent':
    case 'pwsh_persistent':
    case 'job_start':
    case 'job_wait':
    case 'job_output':
    case 'job_kill':
      return 'run'
    case 'web_search':
    case 'web_fetch':
    case 'browser_navigate':
    case 'browser_snapshot':
      return 'browse'
    case 'execute_code':
    case 'office':
    case 'blueprint':
    case 'lsp':
      return 'analyze'
    default:
      return 'work'
  }
}

/**
 * Extract a clean 1-2 sentence executive takeaway from a subagent's response text.
 * @param rawText - Assistant output markdown or plain text.
 * @param maxChars - Maximum summary length before ellipsis truncation.
 * @returns Normalized conclusion digest, or `null` when no substantive prose exists.
 */
export function extractSummaryDigest(rawText: string, maxChars = 160): string | null {
  const withoutFences = rawText
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, (_match, inner: string) => inner)
    .replace(/<\/?(?:agent_swarm_result|subagent|summary|resume_hint|git-context)(?:\s[^>]*)?>/g, match => match.replaceAll('<', '‹').replaceAll('>', '›'))
    .replace(/<\/?[a-zA-Z0-9_-]+(?:\s[^>]*)?>/g, ' ')
    .replaceAll('‹', '<')
    .replaceAll('›', '>')
  const candidateLines: string[] = []
  for (const rawLine of withoutFences.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (trimmed === '' || trimmed.startsWith('|') || /^[-=]{3,}$/.test(trimmed)) continue
    if (/^#{1,6}\s+/.test(trimmed)) continue
    const cleaned = trimmed
      .replace(/^(?:[-*+]\s+|\d+\.\s+)/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned.length > 0) {
      candidateLines.push(cleaned)
      if (candidateLines.join(' ').length >= maxChars) break
    }
  }
  const joined = candidateLines.join(' ').replace(/\s+/g, ' ').trim()
  if (joined.length === 0) return null
  if (joined.length <= maxChars) return joined
  return `${joined.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

/**
 * Session projection folding a subagent's post-descriptor tool call count,
 * fine-grained live activity (`thinking` / `search` / `read` / `write` / `run` /
 * `browse` / `analyze` / `work`), and latest conclusion digest.
 *
 * Ordinary root sessions never record `subagent/descriptor` and project `null`.
 */
export const subagentActivityProjectionDefinition = {
  key: 'subagentActivity',
  stateVersion: 1,
  stateSchema: subagentActivityStateSchema,
  init: (): SubagentActivityUnitState => ({
    descriptorSeen: false,
    pendingTurnOpen: false,
    turnOpen: false,
    toolCallCount: 0,
    openCalls: [],
    summary: null,
  }),
  apply: (state, event): SubagentActivityUnitState => {
    if (event.type === 'turn/start') {
      return state.descriptorSeen
        ? { ...state, turnOpen: true, openCalls: [] }
        : { ...state, pendingTurnOpen: true }
    }
    if (event.type === 'subagent/descriptor') {
      return {
        descriptorSeen: true,
        pendingTurnOpen: false,
        turnOpen: state.turnOpen || state.pendingTurnOpen,
        toolCallCount: 0,
        openCalls: [],
        summary: null,
      }
    }
    if (event.type === 'turn/end') {
      return state.descriptorSeen
        ? { ...state, turnOpen: false, openCalls: [] }
        : { ...state, pendingTurnOpen: false }
    }
    if (!state.descriptorSeen) return state

    if (event.type === 'tool/call') {
      const callId = String(event.data.callId)
      const busyKind = classifyToolBusyKind(event.data.name)
      return {
        ...state,
        toolCallCount: state.toolCallCount + 1,
        openCalls: [...state.openCalls.filter(entry => entry.callId !== callId), { callId, busyKind }],
      }
    }
    if (event.type === 'tool/result') {
      const callId = String(event.data.message.source.callId)
      const filtered = state.openCalls.filter(entry => entry.callId !== callId)
      return filtered.length === state.openCalls.length ? state : { ...state, openCalls: filtered }
    }
    if (event.type === 'assistant/message') {
      const text = event.data.message.content
        .flatMap(block => (block.type === 'text' ? [block.text] : []))
        .join('\n')
      const digest = extractSummaryDigest(text)
      return digest === null ? state : { ...state, summary: digest }
    }
    return state
  },
  wire: {
    viewSchema: subagentActivityViewSchema,
    view: (state): SubagentActivityProjection | null => {
      if (!state.descriptorSeen) return null
      const activeCall = state.openCalls.at(-1)
      const busyKind: SubagentBusyKind | null = !state.turnOpen
        ? null
        : (activeCall !== undefined ? activeCall.busyKind : 'thinking')
      return {
        toolCallCount: state.toolCallCount,
        busyKind,
        summary: state.summary,
      }
    },
  },
} satisfies ProjectionDefinition<'subagentActivity', SubagentActivityUnitState>

/**
 * Expand `{{item}}` placeholders inside a swarm prompt template.
 * @param template - Prompt template containing at least one `{{item}}` token.
 * @param item - Concrete item string for one child subagent.
 * @returns Expanded prompt string.
 */
export function expandSwarmTemplate(template: string, item: string): string {
  return template.replaceAll('{{item}}', () => item)
}

/** One settled child record formatted into `<agent_swarm_result>`. */
export interface SwarmRenderedChild {
  /** Assigned subagent handle (for example `agent-1`). */
  readonly name: string
  /** Item or role task label. */
  readonly item: string
  /** Optional explicit specialist role title. */
  readonly role?: string
  /** Specialist preset identifier. */
  readonly preset: string
  /** Terminal outcome (`completed`, `failed`, or `aborted`). */
  readonly outcome: SwarmChildOutcome
  /** Full final text or diagnostic message returned by the child. */
  readonly body: string
}

function escapeXmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeSubagentBody(value: string): string {
  return value.replaceAll('</subagent>', '&lt;/subagent&gt;')
}

/**
 * Render whole-batch subagent outcomes into Kimi Work's `<agent_swarm_result>`
 * XML synthesis envelope with `<summary>`, optional `<resume_hint>`, and
 * ordered `<subagent>` blocks.
 * @param children - Settled child records in input order.
 * @returns Well-formed `<agent_swarm_result>` XML document.
 */
export function renderSwarmResultsXml(children: readonly SwarmRenderedChild[]): string {
  let completed = 0
  let failed = 0
  let aborted = 0
  const unfinishedIds: string[] = []
  for (const child of children) {
    if (child.outcome === 'completed') {
      completed += 1
    } else if (child.outcome === 'aborted') {
      aborted += 1
      unfinishedIds.push(child.name)
    } else {
      failed += 1
      unfinishedIds.push(child.name)
    }
  }

  const summaryParts = [`completed: ${String(completed)}`, `failed: ${String(failed)}`]
  if (aborted > 0) {
    summaryParts.push(`aborted: ${String(aborted)}`)
  }
  const lines: string[] = [
    '<agent_swarm_result>',
    `  <summary>${summaryParts.join(', ')}</summary>`,
  ]
  if (unfinishedIds.length > 0) {
    lines.push(
      `  <resume_hint>Subagent(s) ${unfinishedIds.map(escapeXmlAttr).join(', ')} did not finish cleanly. `
      + 'Call agent_swarm with resume_agent_ids ({ "<agent_id>": "<follow-up prompt>" }) to continue from their preserved conversation context instead of restarting from scratch.</resume_hint>',
    )
  }
  for (const child of children) {
    const roleAttr = child.role !== undefined && child.role.trim() !== ''
      ? ` role="${escapeXmlAttr(child.role)}"`
      : ''
    const body = escapeSubagentBody(child.body.trim() || '(no output)')
    lines.push(
      `  <subagent agent_id="${escapeXmlAttr(child.name)}"${roleAttr} preset="${escapeXmlAttr(child.preset)}" item="${escapeXmlAttr(child.item)}" outcome="${child.outcome}">`,
      body,
      '  </subagent>',
    )
  }
  lines.push('</agent_swarm_result>')
  return lines.join('\n')
}
