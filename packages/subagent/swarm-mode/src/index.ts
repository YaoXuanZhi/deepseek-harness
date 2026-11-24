/**
 * Swarm collaboration mode (`/swarm`), subagent live activity projection, and
 * the `agent_swarm` multi-role fan-out & whole-batch `<agent_swarm_result>`
 * synthesis tool.
 *
 * Swarm mode folds `/swarm` command execution from the Session log through the
 * `swarm` session projection so resume, reload, and fork preserve mode state
 * without introducing incompatible session event types. `agent_swarm` supports
 * homogeneous `items` + `prompt_template` (`{{item}}`), heterogeneous multi-role
 * specialist panels (`roles`), and preserved-context recovery (`resume_agent_ids`),
 * collecting every child's result in bounded concurrency and returning one
 * unified `<agent_swarm_result>` XML synthesis block.
 *
 * @module @deepseek-ai/dsh-swarm-mode
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import {
  delegationDepthOf,
  parentAgentOptionsForDelegation,
  type SubagentRunEndInfo,
  type SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'
import { defineTool, ToolArgsError, ToolContextUnavailableError } from '@deepseek-ai/dsh-tools'
import { SwarmModeError } from './error.ts'
import {
  AGENT_SWARM_TOOL,
  expandSwarmTemplate,
  extractSummaryDigest,
  renderSwarmResultsXml,
  subagentActivityProjectionDefinition,
  swarmProjectionDefinition,
  type SwarmRenderedChild,
} from './projection.ts'
import type {
  SubagentActivityUnitState,
  SwarmChildLaunch,
  SwarmChildMode,
  SwarmChildOutcome,
  SwarmUnitState,
} from './types.ts'

export type * from './types.ts'
export { SwarmModeError, type SwarmModeErrorCode } from './error.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    swarmMode: SwarmModeController
  }
}

const DEFAULT_SWARM_SECTION = [
  'You are in Swarm mode (`集群` / multi-role parallel assistant orchestration).',
  '1. **Orient lightly first**: inspect key entrypoints or run a narrow search so scope boundaries are accurate; do not read every target file yourself before delegating.',
  '2. **Fan out independent work via `agent_swarm` (up to 128 assistants)**:',
  '   - **Homogeneous fan-out (`items` + `prompt_template`)**: when applying the same audit, exploration, or scoped change across 2+ modules, files, or competitors, pass `items`, `prompt_template` (with `{{item}}`), and `agent_preset` (`explore`, `plan`, or `coder`).',
  '   - **Multi-role specialist panel (`roles`)**: when evaluating a complex design, trade-off, review, or multi-perspective investigation, pass `roles` (`[{ role, preset, prompt }, ...]`) to consult distinct specialists in parallel (for example `架构规划` with `plan`, `代码与事实取证` with `explore`, `风险与边界审计` with `explore`, or `实现验证` with `coder`).',
  '3. **Self-contained role contracts**: give each assistant explicit scope boundaries, non-overlapping file ownership whenever `coder` edits files, and require a 1-2 sentence executive takeaway followed by verified file paths, line ranges, or concrete facts.',
  '4. **Recover instead of restarting**: `agent_swarm` collects the entire batch and returns one `<agent_swarm_result>` XML block. If any `<subagent>` reports `outcome="failed"` or `outcome="aborted"`, call `agent_swarm` with `resume_agent_ids` (`{ "<agent_id>": "<follow-up instruction>" }`) to continue from its preserved context.',
  '5. **Companion Information Synthesis (`配套信息汇总`)**: never dump or narrate raw subagent outputs sequentially (`助手 1 认为……助手 2 认为……`). Reconcile all `<subagent>` findings into ONE cohesive synthesis: lead with the integrated conclusion, present cross-role or cross-item comparisons in a centralized Markdown table with exact evidence/citations, highlight consensus vs trade-offs, and close with actionable next steps.',
].join('\n')

/** Configuration accepted by `SwarmModeController`. */
export interface SwarmModeConfig {
  /** Guidance rendered in `swarm:policy` while Swarm mode is active. */
  section: string
  /** Default specialist preset for `spawn` batches. */
  defaultPreset: string
  /** Allowed specialist presets selectable by `agent_swarm`. */
  allowedPresets: string[]
  /** Maximum parallel subagents accepted in one `agent_swarm` call. */
  maxItems: number
  /** Provider name used when `fork` is false. */
  spawnProvider: string
  /** Provider name used when `fork` is true. */
  forkProvider: string
}

interface PlannedSwarmTask {
  readonly kind: SwarmChildMode
  readonly item: string
  readonly role?: string
  readonly preset: string
  readonly prompt: string
  readonly resumeAgentId?: string
}

function blocksToText(blocks: readonly ContentBlock[] | undefined): string {
  if (!blocks || blocks.length === 0) return ''
  return blocks
    .flatMap(block => (block.type === 'text' ? [block.text] : []))
    .join('\n')
    .trim()
}

function mapStopReasonToOutcome(stopReason: SubagentStopReason): SwarmChildOutcome {
  if (stopReason === 'completed') return 'completed'
  if (stopReason === 'aborted') return 'aborted'
  return 'failed'
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const laneCount = Math.max(1, Math.min(limit, items.length))
  const lanes = Array.from({ length: laneCount }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const item = items[index]
      if (item !== undefined) {
        results[index] = await worker(item, index)
      }
    }
  })
  await Promise.all(lanes)
  return results
}

/**
 * Service owning Swarm mode state, `/swarm` command, prompt guidance,
 * `subagentActivity` live projection, and the `agent_swarm` batch synthesis tool.
 */
export class SwarmModeController extends Service {
  static inject = ['tools', 'subagents', 'systemPrompt', 'sessionProjections']

  static Config: z<SwarmModeConfig> = z.object({
    section: z.string().default(DEFAULT_SWARM_SECTION).description('Prompt policy rendered while Swarm mode is active.'),
    defaultPreset: z.string().default('coder').description('Default child agent preset for spawned swarm assistants.'),
    allowedPresets: z.array(z.string().min(1)).default(['coder', 'explore', 'plan']).description('Allowed child agent presets for `agent_swarm`.'),
    maxItems: z.natural().min(1).max(128).default(128).description('Maximum parallel subagents allowed in a single `agent_swarm` batch.'),
    spawnProvider: z.string().default('spawn').description('Subagent provider name for fresh specialist children.'),
    forkProvider: z.string().default('fork').description('Subagent provider name for context-inheriting forked children.'),
  })

  private projectionHandle: ProjectionHandle<SwarmUnitState> | undefined
  private activityHandle: ProjectionHandle<SubagentActivityUnitState> | undefined
  private readonly overrides = new WeakMap<Session, boolean>()

  constructor(ctx: Context, public readonly config: SwarmModeConfig) {
    super(ctx, 'swarmMode')
  }

  protected async [Service.init](): Promise<void> {
    const ctx = this.ctx
    const swarmHandle = await ctx.sessionProjections.register(swarmProjectionDefinition)
    const activityHandle = await ctx.sessionProjections.register(subagentActivityProjectionDefinition)
    this.projectionHandle = swarmHandle
    this.activityHandle = activityHandle

    const baseOrder = ctx.systemPrompt.getSectionOrder('PLAN_POLICY') + 10
    ctx.systemPrompt.section({
      name: 'swarm:policy',
      interpolate: false,
      retirement: 'Swarm mode is no longer available. Its instructions no longer apply.',
      order: baseOrder,
      text: (context) => {
        const session = context.agent?.session ?? context.session
        if (session === undefined) return ''
        const state = this.readUnitState(session)
        const active = this.isActive(session)
        return state.entered || active
          ? `The following instructions apply only while Swarm mode is active.\n\n${this.config.section}`
          : ''
      },
    })

    ctx.systemPrompt.section({
      name: 'swarm:status',
      interpolate: false,
      retirement: 'Swarm mode is inactive.',
      order: baseOrder + 1,
      replacement: '',
      text: (context) => {
        const session = context.agent?.session ?? context.session
        if (session === undefined) return ''
        const state = this.readUnitState(session)
        const active = this.isActive(session)
        if (!state.entered && !active) return ''
        return active
          ? 'Swarm mode is active. Follow the Swarm mode instructions: use `agent_swarm` (`items` or `roles`) for parallelizable sub-tasks and synthesize all `<subagent>` findings into one unified response.'
          : 'Swarm mode is inactive. Do not fan out subagents unless explicitly requested by the user or an active skill.'
      },
    })

    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        definitionId: brandString<CommandDefinitionId>('@deepseek-ai/dsh-swarm-mode'),
        name: 'swarm',
        description: 'Enter or leave swarm mode for parallel multi-assistant execution',
        input: { hint: '[off|message]', attachments: true },
        handler: ({ agent, rawInput, attachments }) => {
          const message = rawInput.trim()
          if (message === 'off' && attachments.length > 0) {
            return { kind: 'error', text: 'Attachments cannot accompany /swarm off.' }
          }
          if (message === 'off') {
            this.overrides.delete(agent.session)
            return {
              kind: 'success',
              text: this.isActive(agent.session)
                ? 'Swarm mode off.'
                : 'Swarm mode is already inactive.',
            }
          }
          this.overrides.delete(agent.session)
          if (message !== '' || attachments.length > 0) {
            agent.steer(createUserMessage({
              content: [
                ...attachments,
                ...(message === '' ? [] : [{ type: 'text' as const, text: message }]),
              ],
              source: { kind: 'user' },
            }))
          }
          return {
            kind: 'success',
            text: 'Swarm mode on. Parallel tasks will fan out through agent_swarm. Use /swarm off to leave.',
          }
        },
      })
    })

    const presetChoices = [...new Set(this.config.allowedPresets)]
    ctx.tools.register(defineTool({
      name: AGENT_SWARM_TOOL,
      description:
        'Run a parallel batch of specialist role subagents (`coder`, `explore`, `plan`) or homogeneous work items, '
        + 'wait for all assistants in the batch to finish, and return a single `<agent_swarm_result>` XML synthesis block '
        + 'containing `<summary>`, optional `<resume_hint>`, and each assistant\'s `<subagent>` output. '
        + 'Supports homogeneous `items` + `prompt_template` (`{{item}}`), heterogeneous multi-role `roles` (`[{ role, preset, prompt }]`), '
        + 'and continuing failed/aborted or follow-up assistants via `resume_agent_ids`.',
      parameters: {
        description: {
          type: 'string',
          required: true,
          description: 'Short 3-8 word title for this parallel batch, in the language of the user request.',
        },
        prompt_template: {
          type: 'string',
          description: 'Complete task template containing `{{item}}` for homogeneous `items` batches.',
        },
        items: {
          type: 'array',
          items: { type: 'string' },
          description: `List of 2 to ${String(this.config.maxItems)} distinct work items to expand with \`prompt_template\` in parallel.`,
        },
        roles: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              role: {
                type: 'string',
                required: true,
                description: 'Distinct specialist role label (for example `架构规划`, `代码取证`, `安全审计`).',
              },
              preset: {
                type: 'string',
                enum: presetChoices,
                description: `Specialist role preset (\`${presetChoices.join('`, `')}\`); defaults to \`agent_preset\` or \`${this.config.defaultPreset}\`.`,
              },
              prompt: {
                type: 'string',
                required: true,
                description: 'Complete, self-contained task prompt for this specialist role.',
              },
            },
          },
          description: 'Heterogeneous specialist role panel where each assistant investigates or executes from its own named role perspective in parallel.',
        },
        agent_preset: {
          type: 'string',
          enum: presetChoices,
          description: `Default specialist role preset for spawned assistants (\`${this.config.defaultPreset}\`). Ignored when \`fork\` is true.`,
        },
        subagent_type: {
          type: 'string',
          enum: presetChoices,
          description: 'Alias for `agent_preset` selecting the specialist subagent preset (`coder`, `explore`, or `plan`).',
        },
        resume_agent_ids: {
          type: 'object',
          additionalProperties: true,
          description: 'Map of existing `agent_id` (such as `agent-1`) to a follow-up prompt string to resume from preserved subagent context.',
        },
        fork: {
          type: 'boolean',
          description: 'Set true only when every spawned child needs this conversation\'s prior history; defaults to false (clean specialist context).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', required: true, const: 'swarm_batch' },
            description: { type: 'string', required: true },
            preset: { type: 'string', required: true },
            fork: { type: 'boolean', required: true },
            count: { type: 'number', required: true },
            completedCount: { type: 'number', required: true },
            failedCount: { type: 'number', required: true },
            abortedCount: { type: 'number', required: true },
            xml: { type: 'string', required: true },
            children: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', required: true },
                  childId: { type: 'string' },
                  item: { type: 'string', required: true },
                  role: { type: 'string' },
                  preset: { type: 'string', required: true },
                  mode: { type: 'string', enum: ['spawn', 'fork', 'resume'] },
                  outcome: { type: 'string', enum: ['completed', 'failed', 'aborted'] },
                  summary: { type: 'string' },
                  toolCallCount: { type: 'number' },
                },
              },
            },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: value.xml,
        }],
        presentationMeta: (_args, value) => ({
          kind: value.kind,
          description: value.description,
          preset: value.preset,
          fork: value.fork,
          count: value.count,
          completedCount: value.completedCount,
          failedCount: value.failedCount,
          abortedCount: value.abortedCount,
          children: value.children.map(child => ({
            name: child.name,
            ...(child.childId === undefined ? {} : { childId: child.childId }),
            item: child.item,
            ...(child.role === undefined ? {} : { role: child.role }),
            preset: child.preset,
            ...(child.mode === undefined ? {} : { mode: child.mode }),
            ...(child.outcome === undefined ? {} : { outcome: child.outcome }),
            ...(child.summary === undefined ? {} : { summary: child.summary }),
            ...(child.toolCallCount === undefined ? {} : { toolCallCount: child.toolCallCount }),
          })),
        }),
      },
      isConcurrencySafe: () => true,
      execute: async (args, exec) => {
        const parent = exec.agent
        if (!parent) {
          throw new ToolContextUnavailableError(`${AGENT_SWARM_TOOL} requires a calling agent`)
        }
        const description = args.description.trim()
        if (!description) {
          throw new ToolArgsError(['`description` must be a non-empty string'])
        }

        const fork = args.fork === true
        if (args.agent_preset !== undefined && args.subagent_type !== undefined && args.agent_preset !== args.subagent_type) {
          throw new ToolArgsError([
            `\`agent_preset\` ("${args.agent_preset}") and \`subagent_type\` ("${args.subagent_type}") must match when both are supplied`,
          ])
        }
        const requestedPreset = args.agent_preset ?? args.subagent_type ?? this.config.defaultPreset
        if (!fork && !presetChoices.includes(requestedPreset)) {
          throw new ToolArgsError([
            `\`agent_preset\` must be one of ${presetChoices.join(', ')} (received "${requestedPreset}")`,
          ])
        }

        const plannedTasks: PlannedSwarmTask[] = []

        if (args.items !== undefined && args.items.length > 0) {
          const template = args.prompt_template ?? ''
          if (!template.includes('{{item}}')) {
            throw new ToolArgsError(['`prompt_template` must include the `{{item}}` placeholder when `items` is provided'])
          }
          const cleanedItems = args.items.map(raw => raw.trim())
          if (cleanedItems.some(item => item.length === 0)) {
            throw new ToolArgsError(['every entry in `items` must be non-empty'])
          }
          if (new Set(cleanedItems).size !== cleanedItems.length) {
            throw new ToolArgsError(['`items` must not contain duplicate entries'])
          }
          for (const item of cleanedItems) {
            plannedTasks.push({
              kind: fork ? 'fork' : 'spawn',
              item,
              preset: fork ? 'fork' : requestedPreset,
              prompt: expandSwarmTemplate(template, item),
            })
          }
        }

        if (args.roles !== undefined && args.roles.length > 0) {
          const seenRoles = new Set<string>()
          for (const entry of args.roles) {
            const roleName = entry.role.trim()
            const rolePrompt = entry.prompt.trim()
            if (!roleName) {
              throw new ToolArgsError(['every entry in `roles` must have a non-empty `role` title'])
            }
            if (!rolePrompt) {
              throw new ToolArgsError([`role "${roleName}" must have a non-empty \`prompt\``])
            }
            if (seenRoles.has(roleName)) {
              throw new ToolArgsError([`\`roles\` must not contain duplicate role "${roleName}"`])
            }
            seenRoles.add(roleName)
            const rolePreset = fork ? 'fork' : (entry.preset ?? requestedPreset)
            if (!fork && !presetChoices.includes(rolePreset)) {
              throw new ToolArgsError([
                `role "${roleName}" \`preset\` must be one of ${presetChoices.join(', ')} (received "${rolePreset}")`,
              ])
            }
            plannedTasks.push({
              kind: fork ? 'fork' : 'spawn',
              item: roleName,
              role: roleName,
              preset: rolePreset,
              prompt: rolePrompt,
            })
          }
        }

        const resumeRaw = args.resume_agent_ids
        if (resumeRaw !== undefined) {
          for (const [rawId, rawPrompt] of Object.entries(resumeRaw)) {
            const agentId = rawId.trim()
            if (!agentId) {
              throw new ToolArgsError(['`resume_agent_ids` keys must be non-empty agent ids'])
            }
            if (typeof rawPrompt !== 'string' || rawPrompt.trim() === '') {
              throw new ToolArgsError([`\`resume_agent_ids["${agentId}"]\` must be a non-empty prompt string`])
            }
            plannedTasks.push({
              kind: 'resume',
              item: agentId,
              preset: 'resume',
              prompt: rawPrompt.trim(),
              resumeAgentId: agentId,
            })
          }
        }

        if (plannedTasks.length === 0) {
          throw new ToolArgsError(['provide `items` + `prompt_template`, `roles`, or `resume_agent_ids`'])
        }
        const hasResume = plannedTasks.some(task => task.kind === 'resume')
        if (!hasResume && plannedTasks.length < 2) {
          throw new ToolArgsError([
            `parallel batches require at least 2 tasks in \`items\` or \`roles\` (received ${String(plannedTasks.length)}); use \`subagent\` for a single task`,
          ])
        }
        if (plannedTasks.length > this.config.maxItems) {
          throw new ToolArgsError([
            `batch size ${String(plannedTasks.length)} exceeds maximum ${String(this.config.maxItems)}`,
          ])
        }

        const needsFreshStart = plannedTasks.some(task => task.kind !== 'resume')
        const providerName = fork ? this.config.forkProvider : this.config.spawnProvider
        const provider = needsFreshStart ? ctx.subagents.getProvider(providerName) : undefined
        if (needsFreshStart && !provider) {
          throw new SwarmModeError(
            `subagent provider "${providerName}" is not registered`,
            'SWARM_PROVIDER_UNAVAILABLE',
          )
        }
        const maxDepth = ctx.subagents.resolveMaxDepth(undefined)
        if (needsFreshStart && maxDepth !== undefined && delegationDepthOf(parent) >= maxDepth) {
          throw new SwarmModeError(
            `cannot call ${AGENT_SWARM_TOOL} at delegation depth ${String(delegationDepthOf(parent))} (max ${String(maxDepth)})`,
            'SWARM_DEPTH_EXCEEDED',
          )
        }

        const parentOptions = parentAgentOptionsForDelegation(parent)
        const concurrencyLimit = Math.max(1, ctx.subagents.maxActiveSubagents || 8)

        const settled = await runWithConcurrency(
          plannedTasks,
          concurrencyLimit,
          async (task, index): Promise<{ launch: SwarmChildLaunch; rendered: SwarmRenderedChild }> => {
            if (task.kind === 'resume') {
              return this.executeResumeTask(parent, task.resumeAgentId ?? task.item, task.prompt, exec.signal)
            }
            if (!provider) {
              throw new SwarmModeError(`subagent provider "${providerName}" is not registered`, 'SWARM_PROVIDER_UNAVAILABLE')
            }
            const canSelectPreset = task.kind === 'spawn'
              && provider.capabilities.agentPreset
              && !provider.inheritsParentContext
            const effectivePreset = task.kind === 'fork'
              ? 'fork'
              : (canSelectPreset ? task.preset : 'default')
            const label = `${description}: ${task.item}`.slice(0, 80)

            let childName = `agent-pending-${String(index + 1)}`
            let childIdStr: string | undefined
            let outcome: SwarmChildOutcome = 'completed'
            let body = ''
            let activity: SubagentActivityUnitState | undefined
            try {
              exec.signal.throwIfAborted()
              const started = await ctx.subagents.startActivation({
                provider: providerName,
                label,
                prompt: [{ type: 'text', text: task.prompt }] satisfies ContentBlock[],
                parent,
                ...(canSelectPreset ? { agentPreset: task.preset } : {}),
                ...(provider.capabilities.agentOptions ? { agentOptions: parentOptions } : {}),
                ...(maxDepth !== undefined && provider.capabilities.depthLimit ? { maxDepth } : {}),
                signal: exec.signal,
                delivery: 'caller',
              })
              childName = started.name
              childIdStr = String(started.childId)
              const result = await started.result
              outcome = mapStopReasonToOutcome(result.stopReason)
              const outputText = blocksToText(result.output)
              body = outputText !== ''
                ? outputText
                : (result.diagnostic ?? `Subagent ended with stopReason "${result.stopReason}".`)
              activity = this.readChildActivity(started.childId)
            } catch (error: unknown) {
              outcome = exec.signal.aborted ? 'aborted' : 'failed'
              body = error instanceof Error ? error.message : String(error)
            }

            const summary = activity?.summary ?? extractSummaryDigest(body) ?? undefined
            const toolCallCount = activity?.toolCallCount

            const launch: SwarmChildLaunch = {
              name: childName,
              ...(childIdStr === undefined ? {} : { childId: childIdStr }),
              item: task.item,
              ...(task.role === undefined ? {} : { role: task.role }),
              preset: effectivePreset,
              mode: task.kind,
              outcome,
              ...(summary === undefined ? {} : { summary }),
              ...(toolCallCount === undefined ? {} : { toolCallCount }),
            }
            return {
              launch,
              rendered: {
                name: childName,
                item: task.item,
                ...(task.role === undefined ? {} : { role: task.role }),
                preset: effectivePreset,
                outcome,
                body,
              },
            }
          },
        )

        const children = settled.map(entry => entry.launch)
        const renderedChildren = settled.map(entry => entry.rendered)
        const xml = renderSwarmResultsXml(renderedChildren)
        const completedCount = children.filter(child => child.outcome === 'completed').length
        const abortedCount = children.filter(child => child.outcome === 'aborted').length
        const failedCount = children.length - completedCount - abortedCount
        const batchPreset = fork
          ? 'fork'
          : (args.roles !== undefined && args.roles.length > 0 ? 'roles' : requestedPreset)

        return {
          kind: 'swarm_batch' as const,
          description,
          preset: batchPreset,
          fork,
          count: children.length,
          completedCount,
          failedCount,
          abortedCount,
          xml,
          children,
        }
      },
      presentCall: (args) => {
        const previewLines = [
          ...(args.items ?? []),
          ...(args.roles?.map(role => `[${role.role}] ${role.preset ?? ''}`.trim()) ?? []),
          ...Object.keys(args.resume_agent_ids ?? {}).map(id => `resume ${id}`),
        ]
        return {
          card: 'generic',
          title: args.description,
          kind: 'other',
          content: [{ type: 'text', text: previewLines.join('\n') }],
        }
      },
      presentResult: (args, result) => ({
        card: 'generic',
        title: args.description,
        content: result.content,
      }),
    }))
  }

  private async executeResumeTask(
    parent: Agent,
    agentId: string,
    prompt: string,
    signal: AbortSignal,
  ): Promise<{ launch: SwarmChildLaunch; rendered: SwarmRenderedChild }> {
    const ctx = this.ctx
    let targetId: SessionId
    try {
      targetId = await ctx.subagents.resolveName(parent, agentId, signal)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      const failDigest = extractSummaryDigest(msg)
      return {
        launch: {
          name: agentId,
          item: agentId,
          preset: 'resume',
          mode: 'resume',
          outcome: 'failed',
          ...(failDigest === null ? {} : { summary: failDigest }),
        },
        rendered: {
          name: agentId,
          item: agentId,
          preset: 'resume',
          outcome: 'failed',
          body: msg,
        },
      }
    }

    let disposeEndListener: (() => void) | undefined
    let onAbort: (() => void) | undefined
    const endPromise = new Promise<SubagentRunEndInfo>((resolve, reject) => {
      disposeEndListener = ctx.on('subagent/end', (info) => {
        if (info.id === targetId) {
          resolve(info)
        }
      })
      onAbort = () => {
        reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'))
      }
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })

    let outcome: SwarmChildOutcome = 'completed'
    let body = ''
    try {
      await ctx.subagents.sendMessage(
        parent,
        targetId,
        [{ type: 'text', text: prompt }],
        { signal },
      )
      const endInfo = await endPromise
      outcome = mapStopReasonToOutcome(endInfo.stopReason)
      const text = blocksToText(endInfo.lastAssistantMessage)
      body = text !== '' ? text : `Resumed subagent ${agentId} ended with stopReason "${endInfo.stopReason}".`
    } catch (error: unknown) {
      outcome = signal.aborted ? 'aborted' : 'failed'
      body = error instanceof Error ? error.message : String(error)
    } finally {
      disposeEndListener?.()
      if (onAbort !== undefined) {
        signal.removeEventListener('abort', onAbort)
      }
    }

    const activity = this.readChildActivity(targetId)
    const summary = activity?.summary ?? extractSummaryDigest(body) ?? undefined
    const toolCallCount = activity?.toolCallCount

    return {
      launch: {
        name: agentId,
        childId: String(targetId),
        item: agentId,
        preset: 'resume',
        mode: 'resume',
        outcome,
        ...(summary === undefined ? {} : { summary }),
        ...(toolCallCount === undefined ? {} : { toolCallCount }),
      },
      rendered: {
        name: agentId,
        item: agentId,
        preset: 'resume',
        outcome,
        body,
      },
    }
  }

  private readChildActivity(childId: SessionId): SubagentActivityUnitState | undefined {
    if (!this.activityHandle) return undefined
    const sessions = this.ctx.get('sessions')
    const childSession = sessions?.get(childId)
    if (!childSession) return undefined
    return this.activityHandle.stateOf(childSession)
  }

  private readUnitState(session: Session): SwarmUnitState {
    if (!this.projectionHandle) {
      throw new SwarmModeError('swarm mode is not ready; await plugin activation before running an agent', 'SWARM_STATE_UNAVAILABLE')
    }
    return this.projectionHandle.stateOf(session)
  }

  /**
   * Check whether Swarm mode is active for a Session.
   * @param session - Session to inspect.
   * @returns True when Swarm mode is active.
   */
  isActive(session: Session): boolean {
    const override = this.overrides.get(session)
    if (override !== undefined) return override
    const state = this.readUnitState(session)
    return state.running?.wanted ?? state.active
  }

  /**
   * Programmatically set an in-memory Swarm mode override for tests or headless callers.
   * @param agent - Target agent.
   * @param active - Desired Swarm mode state.
   */
  setOverride(agent: Agent, active: boolean): void {
    this.overrides.set(agent.session, active)
  }
}

export default SwarmModeController
