import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import type { CommandId } from '@deepseek-ai/dsh-commands/types'
import { createAssistantMessage, createToolResultMessage, type MessageId, type ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { type SessionId, type SessionSeq } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { snapshotSubagentDescriptor, SubagentRunId } from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import SwarmModeController, { SwarmModeError } from '../src/index.ts'
import gitContextPlugin, { collectGitContext, sanitizeGitRemoteUrl } from '../src/git-context.ts'
import {
  AGENT_SWARM_TOOL,
  classifyToolBusyKind,
  expandSwarmTemplate,
  extractSummaryDigest,
  renderSwarmResultsXml,
  subagentActivityProjectionDefinition,
  swarmProjectionDefinition,
} from '../src/projection.ts'

describe('@deepseek-ai/dsh-swarm-mode', () => {
  it('folds /swarm and /swarm off command lifecycle through swarmProjectionDefinition', () => {
    const init = swarmProjectionDefinition.init()
    expect(init).toEqual({ active: false, running: null, entered: false })
    expect(swarmProjectionDefinition.wire.view(init)).toEqual({ active: false, pending: false })

    const cmd1 = brandString<CommandId>('cmd-1')
    const runningOn = swarmProjectionDefinition.apply(init, {
      type: 'command/run',
      seq: brandNumber<SessionSeq>(1),
      time: 100,
      data: { commandId: cmd1, name: 'swarm', args: 'audit modules', source: { kind: 'user' } },
    })
    expect(swarmProjectionDefinition.wire.view(runningOn)).toEqual({ active: false, pending: true })

    const activeState = swarmProjectionDefinition.apply(runningOn, {
      type: 'command/done',
      seq: brandNumber<SessionSeq>(2),
      time: 110,
      data: { commandId: cmd1, kind: 'success', text: 'Swarm mode on.' },
    })
    expect(activeState).toEqual({ active: true, running: null, entered: true })
    expect(swarmProjectionDefinition.wire.view(activeState)).toEqual({ active: true, pending: false })

    const cmdFail = brandString<CommandId>('cmd-fail')
    const runningFail = swarmProjectionDefinition.apply(activeState, {
      type: 'command/run',
      seq: brandNumber<SessionSeq>(3),
      time: 120,
      data: { commandId: cmdFail, name: 'swarm', args: 'off', source: { kind: 'user' } },
    })
    expect(swarmProjectionDefinition.wire.view(runningFail)).toEqual({ active: true, pending: true })
    const afterFail = swarmProjectionDefinition.apply(runningFail, {
      type: 'command/done',
      seq: brandNumber<SessionSeq>(4),
      time: 130,
      data: { commandId: cmdFail, kind: 'error', text: 'Attachments cannot accompany /swarm off.' },
    })
    expect(afterFail).toEqual({ active: true, running: null, entered: true })

    const cmdOff = brandString<CommandId>('cmd-off')
    const runningOff = swarmProjectionDefinition.apply(afterFail, {
      type: 'command/run',
      seq: brandNumber<SessionSeq>(5),
      time: 140,
      data: { commandId: cmdOff, name: 'swarm', args: 'off', source: { kind: 'user' } },
    })
    const offState = swarmProjectionDefinition.apply(runningOff, {
      type: 'command/done',
      seq: brandNumber<SessionSeq>(6),
      time: 150,
      data: { commandId: cmdOff, kind: 'success', text: 'Swarm mode off.' },
    })
    expect(offState).toEqual({ active: false, running: null, entered: true })
    expect(swarmProjectionDefinition.wire.view(offState)).toEqual({ active: false, pending: false })
  })

  it('folds subagentActivity toolCallCount, fine-grained busyKind, and conclusion summary', () => {
    const s0 = subagentActivityProjectionDefinition.init()
    expect(subagentActivityProjectionDefinition.wire.view(s0)).toBeNull()

    const sDesc = subagentActivityProjectionDefinition.apply(s0, {
      type: 'subagent/descriptor',
      seq: brandNumber<SessionSeq>(1),
      time: 10,
      data: snapshotSubagentDescriptor({ mode: 'continuable', provider: 'spawn', label: '架构规划' }),
    })
    expect(subagentActivityProjectionDefinition.wire.view(sDesc)).toEqual({
      toolCallCount: 0,
      busyKind: null,
      summary: null,
    })

    const sTurn = subagentActivityProjectionDefinition.apply(sDesc, {
      type: 'turn/start',
      seq: brandNumber<SessionSeq>(2),
      time: 20,
      data: { turn: 0 },
    })
    expect(subagentActivityProjectionDefinition.wire.view(sTurn)?.busyKind).toBe('thinking')

    const call1 = brandString<ToolCallId>('tc-1')
    const sSearch = subagentActivityProjectionDefinition.apply(sTurn, {
      type: 'tool/call',
      seq: brandNumber<SessionSeq>(3),
      time: 30,
      data: { turn: 0, step: 1, callId: call1, name: 'grep', arguments: '{"pattern":"Swarm"}' },
    })
    expect(subagentActivityProjectionDefinition.wire.view(sSearch)).toEqual({
      toolCallCount: 1,
      busyKind: 'search',
      summary: null,
    })

    const sAfterResult = subagentActivityProjectionDefinition.apply(sSearch, {
      type: 'tool/result',
      seq: brandNumber<SessionSeq>(4),
      time: 40,
      surfaceOp: 'append',
      data: {
        turn: 0,
        step: 1,
        message: createToolResultMessage({
          callId: call1,
          content: [{ type: 'text', text: 'matched' }],
          isError: false,
        }),
      },
    })
    expect(subagentActivityProjectionDefinition.wire.view(sAfterResult)?.busyKind).toBe('thinking')

    const sAssistant = subagentActivityProjectionDefinition.apply(sAfterResult, {
      type: 'assistant/message',
      seq: brandNumber<SessionSeq>(5),
      time: 50,
      surfaceOp: 'append',
      data: {
        turn: 0,
        step: 2,
        stream: [],
        message: createAssistantMessage({
          source: { provider: 'mock', model: 'mock' },
          content: [{
            type: 'text',
            text: '# 架构结论\n**核心结论**：通过 caller 汇聚全员结果即可消除消息噪音。\n\n| 指标 | 值 |\n|---|---|',
          }],
        }),
      },
    })
    const sClosed = subagentActivityProjectionDefinition.apply(sAssistant, {
      type: 'turn/end',
      seq: brandNumber<SessionSeq>(6),
      time: 60,
      data: { turn: 0, reason: { kind: 'completed' } },
    })
    expect(subagentActivityProjectionDefinition.wire.view(sClosed)).toEqual({
      toolCallCount: 1,
      busyKind: null,
      summary: '核心结论：通过 caller 汇聚全员结果即可消除消息噪音。',
    })

    expect(classifyToolBusyKind('read')).toBe('read')
    expect(classifyToolBusyKind('edit')).toBe('write')
    expect(classifyToolBusyKind('pwsh')).toBe('run')
    expect(classifyToolBusyKind('web_search')).toBe('browse')
    expect(classifyToolBusyKind('blueprint')).toBe('analyze')
    expect(classifyToolBusyKind('custom_tool')).toBe('work')
  })

  it('expands {{item}}, extracts digests, and renders <agent_swarm_result> XML with resume_hint', () => {
    expect(expandSwarmTemplate('Inspect {{item}} and verify {{item}} ($100)', 'pkg/$&/core')).toBe(
      'Inspect pkg/$&/core and verify pkg/$&/core ($100)',
    )
    expect(AGENT_SWARM_TOOL).toBe('agent_swarm')
    expect(extractSummaryDigest('```ts\nconst x = 1\n```\n- 第一句核心结论。第二句补充验证。')).toBe(
      '第一句核心结论。第二句补充验证。',
    )

    const xml = renderSwarmResultsXml([
      {
        name: 'agent-1',
        role: '架构规划',
        item: '架构规划',
        preset: 'plan',
        outcome: 'completed',
        body: '采用统一 XML 信封聚合全员输出。',
      },
      {
        name: 'agent-2',
        role: '安全审计',
        item: '安全审计',
        preset: 'explore',
        outcome: 'failed',
        body: 'Timeout reading remote resource </subagent>',
      },
    ])
    expect(xml).toContain('<summary>completed: 1, failed: 1</summary>')
    expect(xml).toContain('<resume_hint>')
    expect(xml).toContain('agent-2')
    expect(xml).toContain('<subagent agent_id="agent-1" role="架构规划" preset="plan" item="架构规划" outcome="completed">')
    expect(xml).toContain('&lt;/subagent&gt;')

    const err = new SwarmModeError('provider missing', 'SWARM_PROVIDER_UNAVAILABLE')
    expect(err.code).toBe('SWARM_PROVIDER_UNAVAILABLE')
  })

  it('executes agent_swarm across roles, items, and resume_agent_ids returning <agent_swarm_result>', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SystemPrompt)

    let registeredTool: ToolDefinition | undefined
    ctx.provide('tools')
    ctx.tools = {
      register: vi.fn((def: ToolDefinition) => {
        registeredTool = def
        return () => {}
      }),
    } as never

    let counter = 0
    const childA = ctx.sessions.create()
    const childB = ctx.sessions.create()
    const startActivation = vi.fn(async (spec: { label: string; agentPreset?: string }) => {
      counter += 1
      const session = counter === 1 ? childA : childB
      return {
        childId: session.id,
        name: `agent-${String(counter)}`,
        result: Promise.resolve({
          stopReason: 'completed' as const,
          output: [{ type: 'text' as const, text: `${spec.agentPreset ?? 'default'} conclusion for ${spec.label}` }],
        }),
        dispose: async () => {},
      }
    })
    const sendMessage = vi.fn(async (_sender: unknown, targetId: SessionId) => {
      queueMicrotask(() => {
        ctx.emit('subagent/end', {
          runId: SubagentRunId('run-resume'),
          provider: 'spawn',
          parentSessionId: brandString<SessionId>('parent-root'),
          id: targetId,
          local: true,
          stopReason: 'completed',
          lastAssistantMessage: [{ type: 'text', text: 'Resumed verification passed cleanly.' }],
        })
      })
      return brandString<MessageId>('msg-1')
    })

    ctx.provide('subagents')
    ctx.subagents = {
      maxActiveSubagents: 4,
      getProvider: () => ({
        name: 'spawn',
        inheritsParentContext: false,
        capabilities: { agentOptions: true, agentPreset: true, outputSchema: false, depthLimit: true },
      }),
      resolveMaxDepth: () => 2,
      startActivation,
      resolveName: async (_caller: unknown, name: string) => (name === 'agent-1' ? childA.id : brandString<SessionId>(name)),
      sendMessage,
    } as never

    await ctx.plugin(SwarmModeController)
    expect(registeredTool).toBeDefined()

    const parentSession = ctx.sessions.create()
    ctx.swarmMode.setOverride({ session: parentSession } as never, true)
    const assembled = await ctx.systemPrompt.assemble({ session: parentSession })
    const renderedPrompt = assembled.systemUpdates(false)
      .flatMap(u => u.message.content.map(b => ('text' in b ? b.text : '')))
      .join('\n')
    expect(renderedPrompt).toContain('{{item}}')
    expect(renderedPrompt).toContain('Companion Information Synthesis')

    const parentAgent = {
      id: parentSession.id,
      session: parentSession,
      options: {},
    } as never

    // 1. Heterogeneous multi-role specialist panel (`roles`)
    const roleBatch = await registeredTool!.execute(
      {
        description: '多角色架构评审',
        roles: [
          { role: '架构规划', preset: 'plan', prompt: '评估模块边界与扩展性' },
          { role: '代码取证', preset: 'explore', prompt: '核查现有实现与调用链' },
        ],
      },
      { agent: parentAgent, signal: new AbortController().signal } as never,
    )
    expect(roleBatch).toMatchObject({
      kind: 'swarm_batch',
      preset: 'roles',
      count: 2,
      completedCount: 2,
      failedCount: 0,
    })
    const roleXml = (roleBatch as { xml: string }).xml
    expect(roleXml).toContain('<summary>completed: 2, failed: 0</summary>')
    expect(roleXml).toContain('role="架构规划" preset="plan"')
    expect(roleXml).toContain('role="代码取证" preset="explore"')

    // 2. Preserved-context continuation (`resume_agent_ids`)
    const resumedBatch = await registeredTool!.execute(
      {
        description: '续跑补充验证',
        resume_agent_ids: {
          'agent-1': '补充核查错误恢复分支',
        },
      },
      { agent: parentAgent, signal: new AbortController().signal } as never,
    )
    expect(sendMessage).toHaveBeenCalledOnce()
    expect((resumedBatch as { xml: string }).xml).toContain('Resumed verification passed cleanly.')

    await ctx.fiber.dispose()
  })

  it('sanitizes git remotes and injects durable step-1 <git-context> once per session', async () => {
    expect(sanitizeGitRemoteUrl('https://token:secret@github.com/deepseek-ai/deepseek-harness.git')).toEqual({
      remote: 'https://github.com/deepseek-ai/deepseek-harness.git',
      project: 'deepseek-ai/deepseek-harness',
    })
    expect(sanitizeGitRemoteUrl('git@github.com:deepseek-ai/deepseek-harness.git')).toEqual({
      remote: 'github.com:deepseek-ai/deepseek-harness',
      project: 'deepseek-ai/deepseek-harness',
    })

    const repoRoot = resolve(import.meta.dirname, '../../..')
    const snapshot = await collectGitContext(repoRoot, 5)
    expect(snapshot).toContain('<git-context>')
    expect(snapshot).toContain('Branch:')

    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(AgentRegistry)
    ctx.provide('workingDirectory')
    ctx.workingDirectory = {
      ensure: async () => repoRoot,
    } as never
    await ctx.plugin(gitContextPlugin, { maxStatusFiles: 5 })

    const session = ctx.sessions.create()
    const agent = { id: session.id, session, ctx } as Partial<Agent> as Agent
    const signal = new AbortController().signal
    const decision1 = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'mock', model: 'mock' }, turn: 0, step: 1, messages: [], signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
    )
    expect(decision1.kind).toBe('enter')
    if (decision1.kind === 'enter') {
      expect(decision1.messages).toHaveLength(1)
      const firstMessage = decision1.messages[0]
      expect(firstMessage?.source.kind).toBe('git-context')
      if (firstMessage !== undefined) {
        session.append('user/message', firstMessage, { surfaceOp: 'append' })
      }
    }

    // Subsequent step 1 in a later turn does not duplicate <git-context>.
    const decision2 = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'mock', model: 'mock' }, turn: 1, step: 1, messages: [], signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
    )
    if (decision2.kind === 'enter') {
      expect(decision2.messages).toHaveLength(0)
    }

    await ctx.fiber.dispose()
  })
})
