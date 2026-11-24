// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { SwarmModeControl, type SwarmChipProps } from '../src/client/SwarmModeControl.tsx'
import { SwarmToolView, SwarmTurnTail, type SwarmToolViewProps, type SwarmTurnTailProps } from '../src/client/SwarmToolView.tsx'
import { en, zh, type SwarmLocaleKey } from '../src/client/locales.ts'
import { swarmTurnCardsDefinition } from '../src/client/turn-swarm.ts'

function makeTranslator(dict: Record<SwarmLocaleKey, string>) {
  return (key: SwarmLocaleKey, params?: Record<string, string | number>): string => {
    let template = dict[key]
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        template = template.replaceAll(`{${k}}`, String(v))
      }
    }
    return template
  }
}

describe('@deepseek-ai/dsh-client-ui-swarm', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders SwarmModeControl inactive/active states and dispatches toggleSwarmMode', async () => {
    const toggleSwarmMode = vi.fn<(nextActive: boolean) => Promise<string | null>>().mockResolvedValue(null)
    const baseProps = {
      sessionId: brandString<SessionId>('s-swarm'),
      useProjection: (() => ({ active: false, pending: false })) as SwarmChipProps['useProjection'],
      toggleSwarmMode,
      t: makeTranslator(zh) as SwarmChipProps['t'],
    } as SwarmChipProps

    const { rerender } = render(<SwarmModeControl {...baseProps} />)
    const button = screen.getByRole('button', { name: '开启集群模式' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    await waitFor(() => { expect(toggleSwarmMode).toHaveBeenCalledWith(true) })

    rerender(
      <SwarmModeControl
        {...({
          ...baseProps,
          useProjection: (() => ({ active: true, pending: false })),
          t: makeTranslator(en) as SwarmChipProps['t'],
        })}
      />,
    )
    const activeBtn = screen.getByRole('button', { name: 'Leave Swarm mode' })
    expect(activeBtn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(activeBtn)
    await waitFor(() => { expect(toggleSwarmMode).toHaveBeenCalledWith(false) })
  })

  it('renders multi-role matrix with fine-grained busyKind, tool count, and inline conclusion digest', () => {
    const openChildAside = vi.fn()
    const parentId = brandString<SessionId>('parent-1')
    const child1 = brandString<SessionId>('child-1')
    const child2 = brandString<SessionId>('child-2')

    render(
      <SwarmToolView
        {...({
          sessionId: parentId,
          phase: 'start',
          callId: 'call-1',
          toolName: 'agent_swarm',
          openFile: () => { },
          loadImage: async () => '',
          useDisclosure: () => ({ expanded: true, setExpanded: () => { }, toggle: () => { } }),
          block: {
            kind: 'tool-call',
            phase: 'start',
            turn: 0,
            step: 1,
            seq: 1,
            time: 1,
            callId: 'call-1',
            name: 'agent_swarm',
            argsRaw: '{}',
            args: PartialArguments.fromObject({
              description: '多角色架构评审',
              roles: [
                { role: '架构规划', preset: 'plan', prompt: '分析边界' },
                { role: '代码取证', preset: 'explore', prompt: '检索调用链' },
              ],
            }),
            subCalls: [],
          },
          useSessions: (sel: (s: unknown) => unknown) => sel({
            byId: {
              [child1]: {
                running: false,
                projectionValues: {
                  subagentActivity: {
                    toolCallCount: 6,
                    busyKind: null,
                    summary: '采用 caller 全员收集并输出统一 XML 信封。',
                  },
                },
              },
              [child2]: {
                running: true,
                projectionValues: {
                  subagentActivity: {
                    toolCallCount: 4,
                    busyKind: 'search',
                    summary: null,
                  },
                },
              },
            },
            projectionsBySession: {
              [parentId]: {
                state: 'ready',
                values: {
                  subagentCatalog: [
                    { id: child1, name: 'agent-1', mode: 'continuable', label: '多角色架构评审: 架构规划', createdAt: 1 },
                    { id: child2, name: 'agent-2', mode: 'continuable', label: '多角色架构评审: 代码取证', createdAt: 2 },
                  ],
                },
              },
            },
          }),
          useSessionStatus: (sel: (s: unknown) => unknown) => sel(new Map([
            [child1, { running: false, pendingInteraction: undefined, completionUnread: false, completionFailed: false }],
            [child2, { running: true, pendingInteraction: undefined, completionUnread: false, completionFailed: false }],
          ])),
          openChildAside,
          t: makeTranslator(zh),
        } as Partial<SwarmToolViewProps> as SwarmToolViewProps)}
      />,
    )

    expect(screen.getByText('多角色架构评审')).toBeTruthy()
    expect(screen.getByText('1/2 个助手已完成任务')).toBeTruthy()
    expect(screen.getByText('架构规划')).toBeTruthy()
    expect(screen.getByText('代码取证')).toBeTruthy()
    expect(screen.getByText('正在搜索')).toBeTruthy()
    expect(screen.getByText('6 个工具')).toBeTruthy()
    expect(screen.getByText('4 个工具')).toBeTruthy()
    expect(screen.getByText('采用 caller 全员收集并输出统一 XML 信封。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '在右侧边栏查看 agent-1' }))
    expect(openChildAside).toHaveBeenCalledWith({
      parentSessionId: parentId,
      childSessionId: child1,
      mode: 'continuable',
    })
  })

  it('accumulates both agent_swarm batches and >=2 parallel subagent calls in SwarmTurnTail', () => {
    const parentId = brandString<SessionId>('parent-tail')
    const child1 = brandString<SessionId>('child-tail-1')
    const child2 = brandString<SessionId>('child-tail-2')
    const s0 = swarmTurnCardsDefinition.start(
      {} as never,
      { event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 0 } }, role: 'start', location: { kind: 'session' } } as never,
      {} as never,
    )
    const callA = 'call-sub-a'
    const callB = 'call-sub-b'
    const s1 = swarmTurnCardsDefinition.update({ state: s0 } as never, {
      role: 'update',
      location: { kind: 'session' },
      event: {
        type: 'tool/call',
        seq: 2,
        time: 2,
        data: {
          turn: 0,
          step: 1,
          callId: callA,
          name: 'subagent',
          arguments: JSON.stringify({ description: '安全边界审查', agent_preset: 'explore', prompt: 'check A' }),
        },
      },
    } as never)
    const s2 = swarmTurnCardsDefinition.update({ state: s1 } as never, {
      role: 'update',
      location: { kind: 'session' },
      event: {
        type: 'tool/call',
        seq: 3,
        time: 3,
        data: {
          turn: 0,
          step: 1,
          callId: callB,
          name: 'subagent',
          arguments: JSON.stringify({ description: '实施方案规划', agent_preset: 'plan', prompt: 'plan B' }),
        },
      },
    } as never)
    const s3 = swarmTurnCardsDefinition.update({ state: s2 } as never, {
      role: 'update',
      location: { kind: 'session' },
      event: {
        type: 'tool/result',
        seq: 4,
        time: 4,
        surfaceOp: 'append',
        data: {
          turn: 0,
          message: { isError: false, source: { callId: callA } },
          meta: { kind: 'activation', name: 'agent-1' },
        },
      },
    } as never)
    const s4 = swarmTurnCardsDefinition.update({ state: s3 } as never, {
      role: 'update',
      location: { kind: 'session' },
      event: {
        type: 'tool/result',
        seq: 5,
        time: 5,
        surfaceOp: 'append',
        data: {
          turn: 0,
          message: { isError: false, source: { callId: callB } },
          meta: { kind: 'activation', name: 'agent-2' },
        },
      },
    } as never)

    const loc = swarmTurnCardsDefinition.buildLocationData?.({ state: s4 } as never, 'turn', null)
    expect(loc?.key).toBe('swarmBatches')

    render(
      <SwarmTurnTail
        {...({
          sessionId: parentId,
          turn: {
            turn: 0,
            start: undefined,
            end: undefined,
            status: 'closed',
            steps: [],
            data: {
              get: (k: string) => (k === 'swarmBatches' ? loc?.value : undefined),
              source: () => ({ getSnapshot: () => undefined, subscribe: () => () => { } }),
            },
          },
          seq: 6,
          openFile: () => { },
          useSessions: (sel: (s: unknown) => unknown) => sel({
            byId: {
              [child1]: {
                running: false,
                projectionValues: {
                  subagentActivity: { toolCallCount: 3, busyKind: null, summary: '未发现越权访问路径。' },
                },
              },
            },
            projectionsBySession: {
              [parentId]: {
                state: 'ready',
                values: {
                  subagentCatalog: [
                    { id: child1, name: 'agent-1', mode: 'continuable', label: '安全边界审查', createdAt: 1 },
                    { id: child2, name: 'agent-2', mode: 'continuable', label: '实施方案规划', createdAt: 2 },
                  ],
                },
              },
            },
          }),
          useSessionStatus: (sel: (s: unknown) => unknown) => sel(new Map([
            [child1, { running: false, pendingInteraction: undefined, completionUnread: false, completionFailed: false }],
            [child2, { running: false, pendingInteraction: undefined, completionUnread: false, completionFailed: false }],
          ])),
          openChildAside: () => { },
          t: makeTranslator(zh),
        } as Partial<SwarmTurnTailProps> as SwarmTurnTailProps)}
      />,
    )

    expect(screen.getByText('多角色子助手并行协作')).toBeTruthy()
    expect(screen.getByText('2/2 个助手已完成任务')).toBeTruthy()
    expect(screen.getByText('未发现越权访问路径。')).toBeTruthy()
  })
})
