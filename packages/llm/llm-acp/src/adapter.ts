/**
 * `AcpLlmAdapter`: bridges any ACP-compliant agent into DeepSeek Harness's
 * `LlmAdapter` streaming vocabulary (`TextBlock`, `ReasoningBlock`, `ToolCallBlock`).
 *
 * @module @deepseek-ai/dsh-llm-acp/adapter
 */

import { Readable as NodeReadable, Writable as NodeWritable } from 'node:stream'
import {
  client as createAcpClientApp,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ContentBlock as AcpContentBlock,
  type McpServer,
} from '@agentclientprotocol/sdk'
import { brandString } from '@deepseek-ai/dsh-brand'
import {
  LlmAdapter,
  LlmError,
  type FinishReason,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmReasoningEffortInfo,
  type LlmResolvedModelInfo,
  type ReasoningEffortId,
  type RequestMessage,
  type StreamChunk,
  type ToolCallId,
} from '@deepseek-ai/dsh-llm'
import {
  extractFallbackToolCalls,
  formatFallbackToolDeclarations,
  startLoopbackMcpToolBridge,
  type CapturedAcpToolCall,
  type LoopbackMcpBridgeHandle,
} from './mcp-tool-bridge.ts'
import { spawnAcpChildProcess, type AcpSpawnTarget } from './probe-auth.ts'
import type { AcpProviderModelEntry, AcpReasoningOption } from './types.ts'

/** Runtime snapshot of one enabled ACP provider consumed by `AcpLlmAdapter`. */
export interface ResolvedAcpProviderRuntime {
  readonly id: string
  readonly displayName: string
  readonly spawnTarget: AcpSpawnTarget
  readonly models: readonly AcpProviderModelEntry[]
  readonly reasoningEfforts: readonly AcpReasoningOption[]
  readonly modelConfigOptionId?: string
  readonly reasoningConfigOptionId?: string
  readonly supportsHttpMcp?: boolean
  readonly supportsImages?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatHistoryMessage(msg: RequestMessage): string {
  if (msg.role === 'system' || msg.role === 'developer') {
    const textParts: string[] = []
    for (const block of msg.content) {
      if (block.type === 'text') textParts.push(block.text)
    }
    if (textParts.length === 0) return ''
    const tag = msg.role === 'system' ? 'system_instructions' : 'developer_context'
    return `<${tag}>\n${textParts.join('\n')}\n</${tag}>`
  }

  if (msg.role === 'user') {
    const parts: string[] = []
    for (const block of msg.content) {
      if (block.type === 'text') {
        parts.push(block.text)
      } else if (block.type === 'file') {
        parts.push(`[file: ${block.attachment.name} (${String(block.attachment.bytes)} bytes)]`)
      } else if (block.type === 'image' && block.offloaded) {
        parts.push(`[offloaded image: ${block.attachment.attachmentId}]`)
      }
    }
    return parts.length > 0 ? `<user>\n${parts.join('\n')}\n</user>` : ''
  }

  if (msg.role === 'assistant') {
    const parts: string[] = []
    for (const block of msg.content) {
      if (block.type === 'text' && block.text.trim()) {
        parts.push(block.text)
      } else if (block.type === 'tool-call') {
        parts.push(`<tool_call id="${block.id}" name="${block.name}">${block.arguments}</tool_call>`)
      }
    }
    return parts.length > 0 ? `<assistant>\n${parts.join('\n')}\n</assistant>` : ''
  }

  const parts: string[] = []
  for (const block of msg.content) {
    if (block.type === 'text') parts.push(block.text)
  }
  const errAttr = msg.isError ? ' is_error="true"' : ''
  return `<tool_result call_id="${msg.toolCallId}"${errAttr}>\n${parts.join('\n')}\n</tool_result>`
}

/**
 * Assemble DeepSeek Harness `GenerateOptions` into ordered ACP `ContentBlock[]`.
 * @param options - Full DSH model call options.
 * @param includeFallbackTools - Inject `<dsh_tool_call>` instructions when HTTP MCP is unavailable.
 * @param readImageBytes - Optional reader returning base64 bytes + MIME type for an `ImageAttachmentRef` id.
 * @returns Ordered ACP prompt content blocks.
 */
export async function buildAcpPromptBlocks(
  options: GenerateOptions,
  includeFallbackTools: boolean,
  readImageBytes?: (attachmentId: string) => Promise<{ readonly data: string; readonly mimeType: string } | undefined>,
): Promise<AcpContentBlock[]> {
  const sections: string[] = []
  if (options.system?.trim()) {
    sections.push(`<system_instructions>\n${options.system.trim()}\n</system_instructions>`)
  }
  if (includeFallbackTools && options.tools && options.tools.length > 0) {
    sections.push(formatFallbackToolDeclarations(options.tools))
  }

  const imageBlocks: AcpContentBlock[] = []
  const msgs = options.messages

  // If the conversation consists of a single user turn with no prior tool/assistant history,
  // avoid wrapping the final user turn in XML tags unless system/history precedes it.
  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i]
    if (!m) continue
    if (m.role === 'user' && readImageBytes) {
      for (const b of m.content) {
        if (b.type === 'image' && !b.offloaded) {
          const loaded = await readImageBytes(b.attachment.attachmentId).catch(() => undefined)
          if (loaded) {
            imageBlocks.push({
              type: 'image',
              data: loaded.data,
              mimeType: loaded.mimeType,
            })
          }
        }
      }
    }
    const isFinalUser = i === msgs.length - 1 && m.role === 'user' && sections.length === 0
    if (isFinalUser) {
      const rawUserText = m.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text)
        .join('\n')
      if (rawUserText) sections.push(rawUserText)
      continue
    }
    const formatted = formatHistoryMessage(m)
    if (formatted) sections.push(formatted)
  }

  if (msgs.length > 1 && msgs[msgs.length - 1]?.role === 'tool') {
    sections.push('Continue the assistant response based on the tool_result above.')
  }

  const promptText = sections.join('\n\n').trim() || 'Continue.'
  return [
    ...imageBlocks,
    { type: 'text', text: promptText },
  ]
}

/**
 * `LlmAdapter` implementation backed by configured ACP providers.
 */
export class AcpLlmAdapter extends LlmAdapter {
  constructor(
    private readonly getProvider: (providerId: string) => ResolvedAcpProviderRuntime | undefined,
    private readonly readImageBytes?: (attachmentId: string) => Promise<{ readonly data: string; readonly mimeType: string } | undefined>,
  ) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    const rt = this.getProvider(provider)
    return {
      id: provider,
      name: rt?.displayName ?? provider,
    }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const rt = this.getProvider(provider)
    if (!rt) return Promise.resolve([])
    return Promise.resolve(rt.models.map(m => ({
      provider,
      id: m.id,
      name: m.name,
      ...(m.description === undefined ? {} : { description: m.description }),
      inputModalities: m.inputModalities ?? (rt.supportsImages ? ['text', 'image'] : ['text']),
    })))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const rt = this.getProvider(provider)
    const found = rt?.models.find(m => m.id === model)
    const efforts: readonly LlmReasoningEffortInfo[] = (rt?.reasoningEfforts ?? []).map(r => ({
      id: brandString<ReasoningEffortId>(r.id),
      name: r.name,
    }))
    return Promise.resolve({
      provider,
      id: model,
      name: found?.name ?? model,
      ...(found?.description === undefined ? {} : { description: found.description }),
      inputModalities: found?.inputModalities ?? (rt?.supportsImages ? ['text', 'image'] : ['text']),
      context: { contextWindow: found?.contextWindow ?? 200_000 },
      defaultMaxTokens: found?.maxTokens ?? 32_768,
      ...(efforts.length > 0 ? { reasoning: { efforts } } : {}),
    })
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const rt = this.getProvider(options.provider)
    if (!rt) {
      throw new LlmError(`ACP provider "${options.provider}" is not configured or enabled`, 'NO_ADAPTER')
    }
    if (options.signal?.aborted) {
      throw new LlmError('Request aborted before ACP session started', 'ABORTED')
    }

    const activeTools = options.tools ?? []
    const validToolNames = new Set(activeTools.map(t => t.name))

    // Async push queue for real-time streaming chunks
    const queue: StreamChunk[] = []
    let wakeReader: (() => void) | undefined
    let streamDone = false
    const isStreamDone = (): boolean => streamDone
    const pushChunk = (chunk: StreamChunk): void => {
      queue.push(chunk)
      if (wakeReader) {
        const fn = wakeReader
        wakeReader = undefined
        fn()
      }
    }

    let mcpBridge: LoopbackMcpBridgeHandle | undefined
    let activeSessionId: string | undefined
    const cancelHolder: { fn?: () => void } = {}

    if (activeTools.length > 0) {
      mcpBridge = await startLoopbackMcpToolBridge(activeTools, () => {
        cancelHolder.fn?.()
      })
    }

    const proc = spawnAcpChildProcess(rt.spawnTarget)
    let reasoningIndex: number | undefined
    let reasoningText = ''
    let textIndex: number | undefined
    let visibleText = ''
    let nextBlockIndex = 0
    let usedHttpMcp = false
    let capturedMcpInterrupted = false

    const ensureClosedOpenBlocks = (): void => {
      if (reasoningIndex !== undefined) {
        pushChunk({
          type: 'block-end',
          index: reasoningIndex,
          block: { type: 'reasoning', text: reasoningText },
        })
        reasoningIndex = undefined
      }
      if (textIndex !== undefined) {
        pushChunk({
          type: 'block-end',
          index: textIndex,
          block: { type: 'text', text: visibleText },
        })
        textIndex = undefined
      }
    }

    const clientApp = createAcpClientApp({ name: 'deepseek-harness-llm-acp' })
      .onNotification(methods.client.session.update, ({ params }) => {
        if (capturedMcpInterrupted) return Promise.resolve()
        const upd = params.update
        if (upd.sessionUpdate === 'agent_thought_chunk' && upd.content.type === 'text' && upd.content.text) {
          if (reasoningIndex === undefined) {
            reasoningIndex = nextBlockIndex
            nextBlockIndex += 1
            pushChunk({ type: 'block-start', index: reasoningIndex, blockType: 'reasoning' })
          }
          reasoningText += upd.content.text
          pushChunk({ type: 'reasoning-delta', index: reasoningIndex, text: upd.content.text })
        } else if (upd.sessionUpdate === 'agent_message_chunk' && upd.content.type === 'text' && upd.content.text) {
          if (reasoningIndex !== undefined) {
            pushChunk({
              type: 'block-end',
              index: reasoningIndex,
              block: { type: 'reasoning', text: reasoningText },
            })
            reasoningIndex = undefined
          }
          if (usedHttpMcp || activeTools.length === 0) {
            if (textIndex === undefined) {
              textIndex = nextBlockIndex
              nextBlockIndex += 1
              pushChunk({ type: 'block-start', index: textIndex, blockType: 'text' })
            }
            visibleText += upd.content.text
            pushChunk({ type: 'text-delta', index: textIndex, text: upd.content.text })
          } else {
            // Buffer in fallback XML tool-call mode so <dsh_tool_call> tags are parsed cleanly at block end.
            visibleText += upd.content.text
          }
        }
        return Promise.resolve()
      })
      .onRequest(methods.client.session.requestPermission, ({ params }) => {
        // Allow ONLY our loopback MCP tool server (`dsh_tools`); deny built-in agent fs/shell tools.
        const rawTitle = `${params.toolCall.title ?? ''} ${params.toolCall.toolCallId}`.toLowerCase()
        const isDshMcpTool = usedHttpMcp && (
          rawTitle.includes('dsh_tools')
          || Array.from(validToolNames).some(n => rawTitle.includes(n.toLowerCase()))
        )
        if (isDshMcpTool) {
          const allowOpt = params.options.find(o => o.kind === 'allow_once' || o.kind === 'allow_always')
          if (allowOpt) {
            return Promise.resolve({ outcome: { outcome: 'selected', optionId: allowOpt.optionId } })
          }
        }
        return Promise.resolve({ outcome: { outcome: 'cancelled' } })
      })

    const connection = clientApp.connect(ndJsonStream(
      NodeWritable.toWeb(proc.stdin) as WritableStream<Uint8Array>,
      NodeReadable.toWeb(proc.stdout) as ReadableStream<Uint8Array>,
    ))
    const agent = connection.agent

    cancelHolder.fn = (): void => {
      capturedMcpInterrupted = true
      if (activeSessionId !== undefined) {
        void agent.notify(methods.agent.session.cancel, { sessionId: activeSessionId }).catch(() => {})
      }
    }

    const onCallerAbort = (): void => {
      if (activeSessionId !== undefined) {
        void agent.notify(methods.agent.session.cancel, { sessionId: activeSessionId }).catch(() => {})
      }
      void proc.dispose()
    }
    options.signal?.addEventListener('abort', onCallerAbort, { once: true })

    let workerError: unknown
    const worker = (async (): Promise<void> => {
      try {
        const initRes: unknown = await agent.request(methods.agent.initialize, {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: {},
        })
        const initObj: Record<string, unknown> = isRecord(initRes) ? initRes : {}
        const caps: Record<string, unknown> = isRecord(initObj.agentCapabilities) ? initObj.agentCapabilities : {}
        const mcpCaps: Record<string, unknown> = isRecord(caps.mcpCapabilities) ? caps.mcpCapabilities : {}
        const agentSupportsHttpMcp = mcpCaps.http === true
        const agentSupportsImages = isRecord(caps.promptCapabilities) && caps.promptCapabilities.image === true

        usedHttpMcp = agentSupportsHttpMcp && mcpBridge !== undefined
        const mcpServers: McpServer[] = usedHttpMcp && mcpBridge !== undefined
          ? [{ type: 'http', name: 'dsh_tools', url: mcpBridge.url, headers: [] }]
          : []

        const sessionRes: unknown = await agent.request(methods.agent.session.new, {
          cwd: rt.spawnTarget.cwd,
          mcpServers,
        })
        const sessionObj: Record<string, unknown> = isRecord(sessionRes) ? sessionRes : {}
        const sid = typeof sessionObj.sessionId === 'string' ? sessionObj.sessionId : ''
        if (!sid) {
          throw new LlmError(`ACP provider "${options.provider}" returned no sessionId`, 'INVALID_RESPONSE')
        }
        activeSessionId = sid

        // Configure requested model and reasoning effort when supported
        if (options.model && options.model !== 'default') {
          const modelOptId = rt.modelConfigOptionId ?? 'model'
          await agent.request(methods.agent.session.setConfigOption, {
            sessionId: sid,
            configId: modelOptId,
            value: options.model,
          }).catch(() => {})
        }
        if (options.reasoningEffort) {
          const effortOptId = rt.reasoningConfigOptionId ?? 'thought_level'
          await agent.request(methods.agent.session.setConfigOption, {
            sessionId: sid,
            configId: effortOptId,
            value: options.reasoningEffort,
          }).catch(() => {})
        }

        const promptBlocks = await buildAcpPromptBlocks(
          options,
          !usedHttpMcp && activeTools.length > 0,
          agentSupportsImages ? this.readImageBytes : undefined,
        )

        const promptRes = await agent.request(methods.agent.session.prompt, {
          sessionId: sid,
          prompt: promptBlocks,
        })

        if (options.signal?.aborted) {
          throw new LlmError('ACP generation aborted', 'ABORTED')
        }

        // Assemble final text & any captured tool calls
        let finalToolCalls: readonly CapturedAcpToolCall[] = mcpBridge?.getCapturedCalls() ?? []
        if (!usedHttpMcp && activeTools.length > 0 && finalToolCalls.length === 0) {
          const parsed = extractFallbackToolCalls(visibleText, validToolNames)
          finalToolCalls = parsed.toolCalls
          if (parsed.visibleText) {
            const idx = nextBlockIndex
            nextBlockIndex += 1
            pushChunk({ type: 'block-start', index: idx, blockType: 'text' })
            pushChunk({ type: 'text-delta', index: idx, text: parsed.visibleText })
            pushChunk({ type: 'block-end', index: idx, block: { type: 'text', text: parsed.visibleText } })
          }
        }

        ensureClosedOpenBlocks()

        for (const tc of finalToolCalls) {
          const idx = nextBlockIndex
          nextBlockIndex += 1
          const callId = brandString<ToolCallId>(tc.id)
          pushChunk({ type: 'block-start', index: idx, blockType: 'tool-call' })
          pushChunk({
            type: 'tool-call-delta',
            index: idx,
            id: callId,
            name: tc.name,
            argumentsDelta: tc.argumentsJson,
          })
          pushChunk({
            type: 'block-end',
            index: idx,
            block: {
              type: 'tool-call',
              id: callId,
              name: tc.name,
              arguments: tc.argumentsJson,
            },
          })
        }

        const estInput = Math.max(1, Math.ceil(JSON.stringify(promptBlocks).length / 4))
        const estOutput = Math.max(1, Math.ceil((visibleText.length + reasoningText.length) / 4))
        pushChunk({
          type: 'usage',
          usage: {
            inputTokens: estInput,
            outputTokens: estOutput,
            totalTokens: estInput + estOutput,
          },
        })

        const stopReasonRaw = isRecord(promptRes) && typeof promptRes.stopReason === 'string'
          ? promptRes.stopReason
          : 'end_turn'
        const finishReason: FinishReason = finalToolCalls.length > 0
          ? { kind: 'tool-calls' }
          : stopReasonRaw === 'max_tokens'
            ? { kind: 'max-tokens' }
            : { kind: 'stop' }
        pushChunk({ type: 'finish', reason: finishReason })
      } catch (err) {
        workerError = err
      } finally {
        streamDone = true
        if (wakeReader) {
          const fn = wakeReader
          wakeReader = undefined
          fn()
        }
      }
    })()

    try {
      while (true) {
        while (queue.length > 0) {
          const next = queue.shift()
          if (next !== undefined) yield next
        }
        if (isStreamDone()) break
        await new Promise<void>((r) => { wakeReader = r })
      }
      await worker
      if (workerError !== undefined) {
        if (options.signal?.aborted) {
          throw new LlmError('ACP request aborted', 'ABORTED', { cause: workerError })
        }
        if (workerError instanceof LlmError) throw workerError
        const tail = proc.getStderrTail()
        const msg = workerError instanceof Error
          ? workerError.message
          : typeof workerError === 'string'
            ? workerError
            : JSON.stringify(workerError)
        const fullMsg = tail && !msg.includes(tail) ? `${msg} (${tail})` : msg
        const isAuthFailure = /auth|login|unauthorized|unauthenticated|sign[- ]in/i.test(fullMsg)
        throw new LlmError(
          fullMsg,
          isAuthFailure ? 'AUTH' : 'SERVER',
          { cause: workerError },
        )
      }
    } finally {
      options.signal?.removeEventListener('abort', onCallerAbort)
      await Promise.all([
        proc.dispose(),
        mcpBridge ? mcpBridge.close() : Promise.resolve(),
      ])
    }
  }
}
