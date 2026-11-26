/**
 * Loopback Streamable HTTP MCP tool-capture server and fallback XML tool-call
 * parser for bridging DeepSeek Harness `ToolSchema[]` across an ACP model call.
 *
 * @module @deepseek-ai/dsh-llm-acp/mcp-tool-bridge
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'

/** One captured tool invocation requested by the ACP model during a single LLM step. */
export interface CapturedAcpToolCall {
  /** Generated tool-call correlation id. */
  readonly id: string
  /** Exact DSH tool name (matching `ToolSchema.name`). */
  readonly name: string
  /** Raw JSON string of the tool arguments object. */
  readonly argumentsJson: string
}

/** Running loopback HTTP MCP server handle scoped to one LLM stream call. */
export interface LoopbackMcpBridgeHandle {
  /** Loopback HTTP URL passed to ACP `session/new` `mcpServers` (`type: 'http'`). */
  readonly url: string
  /** Standard ACP `McpServerStdio` descriptor proxying newline JSON-RPC over stdio to `url`. */
  readonly stdioServer: {
    readonly name: string
    readonly command: string
    readonly args: readonly string[]
  }
  /** Read all tool calls captured so far in invocation order. */
  readonly getCapturedCalls: () => readonly CapturedAcpToolCall[]
  /** Shut down the loopback HTTP listener. */
  readonly close: () => Promise<void>
}

const STDIO_MCP_PROXY_SCRIPT = [
  'const rl = require("node:readline").createInterface({ input: process.stdin, crlfDelay: Infinity });',
  'const url = process.argv[1];',
  'rl.on("line", async (line) => {',
  '  const trimmed = line.trim(); if (!trimmed) return;',
  '  try {',
  '    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: trimmed });',
  '    if (res.status === 200) { const txt = await res.text(); if (txt.trim()) process.stdout.write(txt.trim() + "\\n"); }',
  '  } catch {}',
  '});',
].join(' ')

interface JsonRpcRequest {
  readonly jsonrpc?: string
  readonly id?: string | number | null
  readonly method?: string
  readonly params?: Record<string, unknown>
}

function readRequestBody(req: IncomingMessage, maxBytes = 4 * 1024 * 1024): Promise<string> {
  return new Promise<string>((resolveBody, rejectBody) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.byteLength
      if (total > maxBytes) {
        req.destroy(new Error('MCP request body exceeded limit'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      resolveBody(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', rejectBody)
  })
}

function sendJsonRpc(res: ServerResponse, status: number, payload: unknown): void {
  const raw = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(raw)),
    'Cache-Control': 'no-store',
  })
  res.end(raw)
}

/**
 * Start a single-request loopback Streamable HTTP MCP server advertising `tools`
 * and intercepting any `tools/call` invocation so DeepSeek Harness's own `agent-loop`
 * executes the tool natively.
 * @param tools - Active DSH tool schemas for the current step.
 * @param onFirstCapture - Callback fired after a brief batching window once one or more tool calls arrive.
 * @returns Bound loopback MCP bridge handle.
 */
export async function startLoopbackMcpToolBridge(
  tools: readonly ToolSchema[],
  onFirstCapture: () => void,
): Promise<LoopbackMcpBridgeHandle> {
  const secretToken = randomBytes(18).toString('base64url')
  const routePath = `/mcp/${secretToken}`
  const validToolNames = new Set(tools.map(t => t.name))
  const captured: CapturedAcpToolCall[] = []
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let notified = false

  const triggerCaptured = (): void => {
    if (settleTimer !== undefined) clearTimeout(settleTimer)
    // Allow 80ms for parallel tool calls emitted in the same model turn to arrive together.
    settleTimer = setTimeout(() => {
      if (!notified) {
        notified = true
        onFirstCapture()
      }
    }, 80)
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== routePath) {
      res.writeHead(404)
      res.end()
      return
    }

    if (req.method === 'GET') {
      // Streamable HTTP MCP optional SSE notification stream.
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write(': connected\n\n')
      req.on('close', () => { res.end() })
      return
    }

    if (req.method === 'DELETE') {
      res.writeHead(200)
      res.end()
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }

    void readRequestBody(req).then((rawBody) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(rawBody)
      } catch (_parseErr) {
        // Malformed JSON-RPC request returns standard -32700 parse error.
        sendJsonRpc(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
        return
      }

      const handleSingle = (rpc: JsonRpcRequest): Record<string, unknown> | null => {
        const id = rpc.id ?? null
        const method = rpc.method ?? ''
        if (rpc.id === undefined) {
          // JSON-RPC notification (such as notifications/initialized)
          return null
        }
        if (method === 'initialize') {
          const requestedVersion = typeof rpc.params?.protocolVersion === 'string'
            ? rpc.params.protocolVersion
            : '2024-11-05'
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: requestedVersion,
              capabilities: {
                tools: { listChanged: false },
              },
              serverInfo: {
                name: 'dsh-tool-bridge',
                version: '1.0.0',
              },
            },
          }
        }
        if (method === 'ping') {
          return { jsonrpc: '2.0', id, result: {} }
        }
        if (method === 'tools/list') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.parameters,
              })),
            },
          }
        }
        if (method === 'tools/call') {
          const rawName = typeof rpc.params?.name === 'string' ? rpc.params.name : ''
          // Strip optional server prefix if an ACP agent namespaces tool names.
          const resolvedName = validToolNames.has(rawName)
            ? rawName
            : (Array.from(validToolNames).find(n => rawName.endsWith(`__${n}`) || rawName.endsWith(`_${n}`)) ?? rawName)
          const rawArgs = rpc.params?.arguments
          const argsObj = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
            ? rawArgs
            : {}
          const callId = `call_${randomUUID().replaceAll('-', '').slice(0, 24)}`
          captured.push({
            id: callId,
            name: resolvedName,
            argumentsJson: JSON.stringify(argsObj),
          })
          triggerCaptured()
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: '[DELEGATED_TO_DSH_HOST: tool call captured for host execution; stop generating further text and wait for the host tool result in the next step.]',
                },
              ],
            },
          }
        }
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        }
      }

      if (Array.isArray(parsed)) {
        const replies = parsed
          .map(item => (typeof item === 'object' && item !== null ? handleSingle(item as JsonRpcRequest) : null))
          .filter((r): r is Record<string, unknown> => r !== null)
        if (replies.length === 0) {
          res.writeHead(202)
          res.end()
        } else {
          sendJsonRpc(res, 200, replies)
        }
        return
      }

      if (typeof parsed === 'object' && parsed !== null) {
        const reply = handleSingle(parsed)
        if (reply === null) {
          res.writeHead(202)
          res.end()
        } else {
          sendJsonRpc(res, 200, reply)
        }
        return
      }

      sendJsonRpc(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } })
    }, () => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', rejectListen)
      resolveListen()
    })
  })

  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  const bridgeUrl = `http://127.0.0.1:${String(port)}${routePath}`
  return {
    url: bridgeUrl,
    stdioServer: {
      name: 'dsh_tools',
      command: process.execPath,
      args: ['-e', STDIO_MCP_PROXY_SCRIPT, bridgeUrl],
    },
    getCapturedCalls: () => [...captured],
    close: () => new Promise<void>((resolveClose) => {
      if (settleTimer !== undefined) {
        clearTimeout(settleTimer)
        settleTimer = undefined
      }
      server.close(() => { resolveClose() })
      server.closeAllConnections()
    }),
  }
}

const TOOL_CALL_OPEN = '<dsh_tool_call>'
const TOOL_CALL_CLOSE = '</dsh_tool_call>'

/**
 * Format active `ToolSchema[]` into a deterministic prompt section for ACP agents
 * that do not advertise Streamable HTTP MCP support (`mcpCapabilities.http !== true`).
 * @param tools - Active DSH tool declarations.
 * @returns Prompt instruction text describing how to emit `<dsh_tool_call>` blocks.
 */
export function formatFallbackToolDeclarations(tools: readonly ToolSchema[]): string {
  if (tools.length === 0) return ''
  const specs = tools.map(t => JSON.stringify({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
  return [
    '[Available DeepSeek Harness Tools]',
    'You do not have direct local filesystem or shell access inside this transport.',
    'Whenever you need to invoke one or more tools, output ONLY valid JSON objects wrapped in <dsh_tool_call>...</dsh_tool_call> tags, then stop immediately and wait for the host tool results:',
    '<dsh_tool_call>{"name":"ToolName","arguments":{}}</dsh_tool_call>',
    'Tool declarations:',
    ...specs,
  ].join('\n')
}

/**
 * Extract `<dsh_tool_call>...</dsh_tool_call>` blocks from assistant text when
 * running in non-MCP fallback mode, returning the cleaned visible text and parsed tool calls.
 * @param rawText - Accumulated assistant message text.
 * @param validTools - Set of declared tool names.
 * @returns Visible text with `<dsh_tool_call>` blocks stripped and parsed tool calls.
 */
export function extractFallbackToolCalls(
  rawText: string,
  validTools: ReadonlySet<string>,
): { readonly visibleText: string; readonly toolCalls: readonly CapturedAcpToolCall[] } {
  if (!rawText.includes(TOOL_CALL_OPEN)) {
    return { visibleText: rawText, toolCalls: [] }
  }
  const toolCalls: CapturedAcpToolCall[] = []
  let cursor = 0
  let visible = ''
  while (cursor < rawText.length) {
    const startIdx = rawText.indexOf(TOOL_CALL_OPEN, cursor)
    if (startIdx < 0) {
      visible += rawText.slice(cursor)
      break
    }
    visible += rawText.slice(cursor, startIdx)
    const bodyStart = startIdx + TOOL_CALL_OPEN.length
    const endIdx = rawText.indexOf(TOOL_CALL_CLOSE, bodyStart)
    if (endIdx < 0) {
      visible += rawText.slice(startIdx)
      break
    }
    const jsonCandidate = rawText.slice(bodyStart, endIdx).trim()
    cursor = endIdx + TOOL_CALL_CLOSE.length
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonCandidate)
    } catch (_jsonErr) {
      // Unparseable tag body is left in visible output below.
    }
    if (
      typeof parsed === 'object'
      && parsed !== null
      && !Array.isArray(parsed)
      && 'name' in parsed
      && typeof parsed.name === 'string'
      && (validTools.size === 0 || validTools.has(parsed.name))
    ) {
      const args = 'arguments' in parsed && typeof parsed.arguments === 'object' && parsed.arguments !== null
        ? parsed.arguments
        : {}
      toolCalls.push({
        id: `call_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
        name: parsed.name,
        argumentsJson: JSON.stringify(args),
      })
      continue
    }
    visible += rawText.slice(startIdx, cursor)
  }
  return { visibleText: visible.trim(), toolCalls }
}
