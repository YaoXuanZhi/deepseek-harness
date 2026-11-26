import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import LlmPlugin, { type StreamChunk } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it } from 'vitest'
import * as fflate from 'fflate'
import AcpLlmService from '../src/index.ts'
import { extractFallbackToolCalls, formatFallbackToolDeclarations } from '../src/mcp-tool-bridge.ts'

const ACP_SDK_URL = pathToFileURL(createRequire(import.meta.url).resolve('@agentclientprotocol/sdk')).href

/**
 * Source of a real stdio ACP agent built on `@agentclientprotocol/sdk` (`agent(...)`)
 * so tests exercise authentic JSON-RPC framing, `initialize`, `authenticate` OAuth URL
 * emission, `session/new` `configOptions`, `session/set_config_option`, and real HTTP
 * POST calls to DeepSeek Harness's loopback Streamable HTTP MCP tool-capture server!
 */
const MOCK_ACP_AGENT_SOURCE = `
import { existsSync, writeFileSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { agent as createAcpAgent, methods, ndJsonStream, PROTOCOL_VERSION, RequestError } from ${JSON.stringify(ACP_SDK_URL)}

const authMarker = process.env.MOCK_AUTH_FILE || ''
const requireAuth = process.env.MOCK_REQUIRE_AUTH === '1'
const disableHttpMcp = process.env.MOCK_DISABLE_HTTP_MCP === '1'

let selectedModel = 'claude-sonnet-4-5'
let selectedThought = 'medium'
const sessionMcpUrl = new Map()

function isAuthenticated() {
  if (!requireAuth) return true
  if (process.env.SUBSCRIPTION_TOKEN === 'valid-sub-secret') return true
  return authMarker ? existsSync(authMarker) : false
}

createAcpAgent({ name: 'mock-sub-acp', version: '1.2.0' })
  .onRequest(methods.agent.initialize, async () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentInfo: { name: 'mock-sub-acp', version: '1.2.0' },
    authMethods: [
      {
        id: 'oauth-sub',
        name: 'Subscription Browser Sign-In',
        description: 'Authorize your subscription in browser',
      },
      {
        id: 'cli-login',
        name: 'Terminal Login',
        type: 'terminal',
        args: ['login'],
      },
    ],
    agentCapabilities: {
      mcpCapabilities: { http: !disableHttpMcp },
      promptCapabilities: { image: true },
    },
  }))
  .onRequest(methods.agent.authenticate, async ({ params }) => {
    if (params.methodId === 'oauth-sub') {
      process.stderr.write('Open browser to authorize: https://auth.example.test/oauth/authorize?code=DSH123\\n')
      await new Promise(r => setTimeout(r, 120))
      if (authMarker) writeFileSync(authMarker, 'ok', 'utf8')
      return {}
    }
    throw RequestError.invalidParams('Unknown auth method')
  })
  .onRequest(methods.agent.session.new, async ({ params }) => {
    if (!isAuthenticated()) {
      throw RequestError.authRequired(undefined, 'Subscription login required before starting session')
    }
    const sessionId = 'sess_' + Math.random().toString(36).slice(2, 10)
    const mcp = (params.mcpServers || []).find(s => s && s.type === 'http')
    if (mcp && mcp.url) {
      sessionMcpUrl.set(sessionId, mcp.url)
    }
    return {
      sessionId,
      configOptions: [
        {
          id: 'model',
          name: 'Model',
          type: 'select',
          category: 'model',
          currentValue: selectedModel,
          options: [
            { value: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (Subscription)' },
            { value: 'gpt-5-codex', name: 'GPT-5 Codex (Subscription)' },
          ],
        },
        {
          id: 'thought_level',
          name: 'Reasoning',
          type: 'select',
          category: 'thought_level',
          currentValue: selectedThought,
          options: [
            { value: 'low', name: 'Low' },
            { value: 'high', name: 'High' },
          ],
        },
      ],
    }
  })
  .onRequest(methods.agent.session.setConfigOption, async ({ params }) => {
    if (params.configId === 'model') selectedModel = String(params.value)
    if (params.configId === 'thought_level') selectedThought = String(params.value)
    return { configOptions: [] }
  })
  .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
    const text = (params.prompt || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\\n')

    await client.notify(methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'Thinking on ' + selectedModel + ' (' + selectedThought + ')...' },
      },
    })

    const mcpUrl = sessionMcpUrl.get(params.sessionId)
    if (text.includes('PLEASE_CALL_WIDGET_TOOL') && mcpUrl) {
      await fetch(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'Widget',
            arguments: { title: 'Revenue Card', html: '<div>$42k</div>' },
          },
        }),
      })
      return { stopReason: 'end_turn' }
    }

    if (text.includes('PLEASE_CALL_FALLBACK_TOOL')) {
      await client.notify(methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: {
            type: 'text',
            text: 'Creating widget now.\\n<dsh_tool_call>{"name":"Widget","arguments":{"title":"Fallback Card"}}</dsh_tool_call>',
          },
        },
      })
      return { stopReason: 'end_turn' }
    }

    await client.notify(methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Hello from ' + selectedModel + '!' },
      },
    })
    return { stopReason: 'end_turn' }
  })
  .onNotification(methods.agent.session.cancel, async () => {})
  .connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)))
`

describe('@deepseek-ai/dsh-llm-acp', () => {
  const tempDirs: string[] = []
  const servers: Server[] = []

  function makeTempRoot(): string {
    const dir = join(tmpdir(), `dsh-llm-acp-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    tempDirs.push(dir)
    return dir
  }

  afterEach(async () => {
    for (const srv of servers.splice(0)) {
      await new Promise<void>((resolve) => { srv.close(() => { resolve() }) })
    }
    for (const dir of tempDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch (_cleanupErr) {
        // Windows child-process handle release may briefly lag after taskkill.
      }
    }
  })

  it('searches and prepares ACP Registry binary distributions, authenticates via OAuth URL capture, probes models, and streams text, reasoning, and loopback MCP tool calls through ctx.llm', async () => {
    const root = makeTempRoot()
    const agentScriptPath = join(root, 'mock-acp-agent.mjs')
    writeFileSync(agentScriptPath, MOCK_ACP_AGENT_SOURCE, 'utf8')
    const authFile = join(root, 'auth-granted.flag')

    // Build a real .zip binary distribution containing a platform launcher so prepareRegistryAgent tests SHA-256 + zip extraction!
    const launcherName = process.platform === 'win32' ? 'run-mock-acp.cmd' : 'run-mock-acp.sh'
    const launcherContent = process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${agentScriptPath}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${agentScriptPath}" "$@"\n`
    const zipBytes = Buffer.from(fflate.zipSync({
      [launcherName]: Buffer.from(launcherContent, 'utf8'),
    }))
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex')

    const archKey = `${process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'}-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}`

    const registryServer = createServer((req, res) => {
      if (req.url === '/agent.zip') {
        res.writeHead(200, { 'Content-Type': 'application/zip' })
        res.end(zipBytes)
        return
      }
      const hostAddr = registryServer.address()
      const port = typeof hostAddr === 'object' && hostAddr ? hostAddr.port : 0
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        version: '1.0.0',
        agents: [
          {
            id: 'mock-sub-acp',
            name: 'Mock Subscription ACP',
            version: '1.2.0',
            description: 'Subscription coding model via ACP',
            distribution: {
              binary: {
                [archKey]: {
                  archive: `http://127.0.0.1:${String(port)}/agent.zip`,
                  cmd: `./${launcherName}`,
                  sha256: zipSha256,
                },
              },
            },
          },
        ],
      }))
    })
    servers.push(registryServer)
    await new Promise<void>((resolve) => { registryServer.listen(0, '127.0.0.1', () => { resolve() }) })
    const addr = registryServer.address()
    const registryPort = typeof addr === 'object' && addr ? addr.port : 0

    const ctx = new Context()
    await ctx.plugin(LlmPlugin)
    await ctx.plugin(AcpLlmService, {
      registryRoot: join(root, 'acp-registry'),
      registryUrl: `http://127.0.0.1:${String(registryPort)}/registry.json`,
      probeTimeoutMs: 15_000,
    })

    // 1. Search ACP Registry
    const searchRes = await ctx.llmAcp.searchRegistry({ query: 'subscription' })
    expect(searchRes.agents).toHaveLength(1)
    expect(searchRes.agents[0]?.id).toBe('mock-sub-acp')
    expect(searchRes.agents[0]?.availableDistributions).toContain('binary')

    // 2. Upsert local ACP provider requiring subscription auth
    const saved = await ctx.llmAcp.upsertProvider({
      id: 'sub-claude',
      displayName: 'Claude Subscription',
      source: 'local',
      command: process.execPath,
      args: [agentScriptPath],
      env: [
        { name: 'MOCK_REQUIRE_AUTH', value: '1', secret: false },
        { name: 'MOCK_AUTH_FILE', value: authFile, secret: false },
      ],
      autoProbe: true,
    })
    expect(saved.status).toBe('auth_required')
    expect(saved.authMethods.some(m => m.id === 'oauth-sub')).toBe(true)

    // 3. Start OAuth flow -> captures browser URL -> completes auth -> auto-probes models!
    const startedFlow = await ctx.llmAcp.startAuth({ providerId: saved.id, methodId: 'oauth-sub' })
    expect(['url_required', 'succeeded']).toContain(startedFlow.status)
    if (startedFlow.status === 'url_required') {
      expect(startedFlow.authUrl).toContain('https://auth.example.test/oauth/authorize?code=DSH123')
    }

    // Wait for background auth completion + auto-probe
    let catalog = await ctx.llmAcp.catalog()
    for (let i = 0; i < 40; i += 1) {
      catalog = await ctx.llmAcp.catalog()
      const prov = catalog.providers.find(p => p.id === saved.id)
      if (prov?.status === 'ready' && prov.models.length >= 2) break
      await new Promise(r => setTimeout(r, 80))
    }

    const readyProv = catalog.providers.find(p => p.id === saved.id)
    expect(readyProv?.status).toBe('ready')
    expect(readyProv?.models.map(m => m.id)).toEqual(['claude-sonnet-4-5', 'gpt-5-codex'])
    expect(readyProv?.reasoningEfforts.map(r => r.id)).toEqual(['low', 'high'])

    // Verify route is live on ctx.llm!
    const llmModels = await ctx.llm.listModels('sub-claude')
    expect(llmModels.map(m => m.id)).toEqual(['claude-sonnet-4-5', 'gpt-5-codex'])

    // 4. Stream normal text + reasoning response via ctx.llm.stream
    const textChunks: StreamChunk[] = []
    for await (const chunk of ctx.llm.stream({
      provider: 'sub-claude',
      model: 'gpt-5-codex',
      reasoningEffort: 'high' as never,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Say hello' }] }],
    })) {
      textChunks.push(chunk)
    }
    const textFinish = textChunks.find((c): c is Extract<StreamChunk, { type: 'finish' }> => c.type === 'finish')
    expect(textFinish?.reason).toEqual({ kind: 'stop' })
    const reasoningText = textChunks
      .filter((c): c is Extract<StreamChunk, { type: 'reasoning-delta' }> => c.type === 'reasoning-delta')
      .map(c => c.text)
      .join('')
    const assistantText = textChunks
      .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map(c => c.text)
      .join('')
    expect(reasoningText).toContain('Thinking on gpt-5-codex (high)...')
    expect(assistantText).toBe('Hello from gpt-5-codex!')

    // 5. Stream with DSH ToolSchema[] -> loopback HTTP MCP captures Widget tool call and returns ToolCallBlock!
    const toolChunks: StreamChunk[] = []
    for await (const chunk of ctx.llm.stream({
      provider: 'sub-claude',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'PLEASE_CALL_WIDGET_TOOL' }] }],
      tools: [
        {
          name: 'Widget',
          description: 'Create an interactive Blueprint widget',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              html: { type: 'string' },
            },
            required: ['title', 'html'],
          },
        },
      ],
    })) {
      toolChunks.push(chunk)
    }

    const tcDelta = toolChunks.find((c): c is Extract<StreamChunk, { type: 'tool-call-delta' }> => c.type === 'tool-call-delta')
    const finishChunk = toolChunks.find((c): c is Extract<StreamChunk, { type: 'finish' }> => c.type === 'finish')
    expect(tcDelta?.name).toBe('Widget')
    expect(JSON.parse(tcDelta?.argumentsDelta ?? '{}')).toEqual({
      title: 'Revenue Card',
      html: '<div>$42k</div>',
    })
    expect(finishChunk?.reason.kind).toBe('tool-calls')

    // 6. Test Registry binary preparation on Windows/Unix
    const prepared = await ctx.llmAcp.prepareRegistryAgent({ agentId: 'mock-sub-acp', distribution: 'binary' })
    expect(prepared.distribution).toBe('binary')
    expect(prepared.version).toBe('1.2.0')
  }, 30_000)

  it('supports fallback <dsh_tool_call> extraction for ACP agents without HTTP MCP', () => {
    const promptDecl = formatFallbackToolDeclarations([
      {
        name: 'Canvas',
        description: 'Manage 12-column dashboard',
        parameters: { type: 'object', properties: { title: { type: 'string' } } },
      },
    ])
    expect(promptDecl).toContain('[Available DeepSeek Harness Tools]')
    expect(promptDecl).toContain('"name":"Canvas"')

    const parsed = extractFallbackToolCalls(
      'Preparing board...\n<dsh_tool_call>{"name":"Canvas","arguments":{"title":"Ops Board"}}</dsh_tool_call>',
      new Set(['Canvas']),
    )
    expect(parsed.visibleText).toBe('Preparing board...')
    expect(parsed.toolCalls).toHaveLength(1)
    expect(parsed.toolCalls[0]?.name).toBe('Canvas')
    expect(JSON.parse(parsed.toolCalls[0]?.argumentsJson ?? '{}')).toEqual({ title: 'Ops Board' })
  })
})
