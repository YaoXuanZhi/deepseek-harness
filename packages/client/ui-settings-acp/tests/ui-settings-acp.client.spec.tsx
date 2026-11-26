// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { brandString } from '@deepseek-ai/dsh-brand'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AcpSettingsFooter,
  type AcpSettingsClientState,
  type AcpSettingsFooterProps,
} from '../src/client/AcpSettingsFooter.tsx'
import { zh } from '../src/client/locales.ts'
import type { AcpLlmProviderId, AcpLlmProviderView } from '@deepseek-ai/dsh-llm-acp/client'

function makeT(): AcpSettingsFooterProps['t'] {
  return ((key: string, params?: Record<string, string | number>): string => {
    let text = (zh as Record<string, string>)[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v))
      }
    }
    return text
  }) as AcpSettingsFooterProps['t']
}

function makeSampleProvider(overrides: Partial<AcpLlmProviderView> = {}): AcpLlmProviderView {
  return {
    id: brandString<AcpLlmProviderId>('claude-acp'),
    displayName: 'Claude Subscription ACP',
    enabled: true,
    source: 'registry',
    registryAgentId: 'claude-acp',
    registryVersion: '1.0.4',
    distribution: 'npx',
    command: 'npx',
    args: ['-y', '@zed-industries/claude-agent-acp@1.0.4'],
    env: [],
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    ],
    reasoningEfforts: [
      { id: 'high', name: 'High' },
    ],
    authMethods: [
      {
        id: 'oauth',
        name: 'Claude Pro/Max Browser Login',
        type: 'agent',
      },
    ],
    status: 'auth_required',
    statusMessage: 'Subscription login required',
    ...overrides,
  }
}

describe('@deepseek-ai/dsh-client-ui-settings-acp', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders configured ACP providers, triggers OAuth & terminal subscription login, searches/installs Registry agents, and saves local ACP commands', async () => {
    const state: AcpSettingsClientState = {
      loaded: true,
      catalog: {
        revision: 1,
        providers: [makeSampleProvider()],
        authFlows: [
          {
            flowId: 'flow-1',
            providerId: brandString<AcpLlmProviderId>('claude-acp'),
            methodId: 'oauth',
            status: 'url_required',
            authUrl: 'https://claude.ai/oauth/authorize?code=TEST',
            startedAt: new Date().toISOString(),
          },
        ],
      },
    }

    const searchRegistry = vi.fn().mockResolvedValue([
      {
        id: 'codex-acp',
        name: 'Codex ACP',
        version: '0.9.2',
        description: 'Use ChatGPT Plus/Pro Codex subscription over ACP',
        authors: ['OpenAI'],
        distribution: 'npx',
        availableDistributions: ['npx', 'binary'],
        prepared: false,
      },
    ])
    const upsertProvider = vi.fn().mockResolvedValue(makeSampleProvider({ status: 'ready' }))
    const removeProvider = vi.fn().mockResolvedValue(undefined)
    const probeProvider = vi.fn().mockResolvedValue(makeSampleProvider({ status: 'ready' }))
    const startAuth = vi.fn().mockResolvedValue(state.catalog.authFlows[0])
    const launchTerminalLogin = vi.fn().mockResolvedValue('npx @zed-industries/claude-agent-acp login')

    render(
      <AcpSettingsFooter
        useAcpState={selector => selector(state)}
        searchRegistry={searchRegistry}
        upsertProvider={upsertProvider}
        removeProvider={removeProvider}
        probeProvider={probeProvider}
        startAuth={startAuth}
        launchTerminalLogin={launchTerminalLogin}
        t={makeT()}
      />,
    )

    // 1. Existing provider row & status badge render
    expect(screen.getByText('ACP 授权模型服务')).toBeTruthy()
    expect(screen.getByText('Claude Subscription ACP')).toBeTruthy()
    expect(screen.getByText('待授权登录')).toBeTruthy()

    // 2. Open Auth panel -> verify OAuth link, OAuth button, Terminal Login button, and Probe Models button
    fireEvent.click(screen.getByRole('button', { name: '授权登录' }))
    expect(screen.getByText(/打开浏览器授权链接/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Claude Pro\/Max Browser Login/ }))
    await waitFor(() => { expect(startAuth).toHaveBeenCalledWith('claude-acp', 'oauth') })

    fireEvent.click(screen.getByRole('button', { name: '打开终端完成订阅登录' }))
    await waitFor(() => {
      expect(launchTerminalLogin).toHaveBeenCalledWith(
        'claude-acp',
        'npx -y @zed-industries/claude-agent-acp@1.0.4',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '我已登录 · 探测模型' }))
    await waitFor(() => { expect(probeProvider).toHaveBeenCalledWith('claude-acp') })

    // 3. Open "+ 添加 ACP 授权服务" -> searches Registry automatically & installs Codex ACP
    fireEvent.click(screen.getByRole('button', { name: /添加 ACP 授权服务/ }))
    await waitFor(() => { expect(searchRegistry).toHaveBeenCalled() })
    expect(await screen.findByText('Codex ACP')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['registry.install'] }))
    await waitFor(() => {
      expect(upsertProvider).toHaveBeenCalledWith(expect.objectContaining({
        source: 'registry',
        registryAgentId: 'codex-acp',
      }))
    })
  })
})
