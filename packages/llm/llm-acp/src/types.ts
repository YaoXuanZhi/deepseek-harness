/**
 * Browser- and Host-safe types for ACP LLM providers (`@deepseek-ai/dsh-llm-acp/types`).
 *
 * @module @deepseek-ai/dsh-llm-acp/types
 */

import type {} from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Branded identifier of one configured ACP LLM provider route. */
export type AcpLlmProviderId = Branded<'AcpLlmProviderId'>

/** Distribution mechanism advertised by an official ACP Registry entry. */
export type AcpRegistryDistributionKind = 'binary' | 'npx' | 'uvx'

/** Origin of a configured ACP LLM provider (`registry` or `local`). */
export type AcpProviderSourceKind = 'registry' | 'local'

/** Authentication method category advertised by an ACP agent during `initialize`. */
export type AcpAuthMethodType = 'agent' | 'terminal' | 'env_var'

/** Summary of one ACP agent returned by searching the official ACP Registry. */
export interface AcpRegistryAgentSummary {
  /** Stable ACP Registry agent identifier (for example `claude-code-acp`). */
  readonly id: string
  /** Display name advertised by the registry entry. */
  readonly name: string
  /** Published semantic version string. */
  readonly version: string
  /** Short description of the ACP agent. */
  readonly description: string
  /** Author list advertised by the registry entry. */
  readonly authors: readonly string[]
  /** Optional license identifier. */
  readonly license?: string
  /** Optional project website URL. */
  readonly website?: string
  /** Optional source repository URL. */
  readonly repository?: string
  /** Optional HTTPS SVG icon URL. */
  readonly icon?: string
  /** Preferred distribution mechanism available on the current host platform. */
  readonly distribution: AcpRegistryDistributionKind
  /** All distribution mechanisms supported by this registry entry on the current platform. */
  readonly availableDistributions: readonly AcpRegistryDistributionKind[]
  /** Whether this exact version is already downloaded/prepared in `$DSH_HOME/acp-registry`. */
  readonly prepared: boolean
}

/** Search result returned by `searchRegistry`. */
export interface AcpRegistrySearchResult {
  /** Registry index version string. */
  readonly registryVersion: string
  /** Matching ACP Registry agents supported on the current host platform. */
  readonly agents: readonly AcpRegistryAgentSummary[]
}

/** Preparation receipt returned by `prepareRegistryAgent`. */
export interface AcpRegistryPrepareResult {
  /** Registry agent identifier. */
  readonly agentId: string
  /** Registry agent display name. */
  readonly name: string
  /** Installed version string. */
  readonly version: string
  /** Distribution mechanism prepared on disk. */
  readonly distribution: AcpRegistryDistributionKind
  /** Resolved executable command path or runner binary. */
  readonly command: string
  /** Default command arguments. */
  readonly args: readonly string[]
}

/** One selectable reasoning effort level advertised by an ACP agent. */
export interface AcpReasoningOption {
  /** Effort identifier sent in `session/set_config_option`. */
  readonly id: string
  /** Human-readable label. */
  readonly name: string
}

/** One model entry exposed by an ACP LLM provider. */
export interface AcpProviderModelEntry {
  /** Model identifier passed to `session/set_config_option` (`model`). */
  readonly id: string
  /** Human-readable display name shown in selectors. */
  readonly name: string
  /** Optional description reported by the ACP agent. */
  readonly description?: string
  /** Optional context window in tokens (defaults to `200_000` when undisclosed). */
  readonly contextWindow?: number
  /** Optional maximum output tokens (defaults to `32_768` when undisclosed). */
  readonly maxTokens?: number
  /** Accepted input modalities (`['text']` or `['text', 'image']`). */
  readonly inputModalities?: readonly ('text' | 'image')[]
}

/** Normalized authentication method advertised by an ACP agent. */
export interface AcpAdvertisedAuthMethod {
  /** Stable method id passed to `authenticate`. */
  readonly id: string
  /** Human-readable method title (for example `Sign in with Subscription`). */
  readonly name: string
  /** Optional method instructions or hint. */
  readonly description?: string
  /** Method interaction category (`agent` OAuth/RPC, `terminal` interactive CLI, or `env_var`). */
  readonly type: AcpAuthMethodType
  /** Shell command preview when `type === 'terminal'`. */
  readonly terminalCommand?: string
  /** Environment variable names requested when `type === 'env_var'`. */
  readonly envVarNames?: readonly string[]
  /** Optional documentation or token-creation URL. */
  readonly link?: string
}

/** Environment variable descriptor exposed to the browser (secret values are always redacted). */
export interface AcpProviderEnvView {
  /** Environment variable name (for example `ANTHROPIC_BASE_URL` or `CUSTOM_TOKEN`). */
  readonly name: string
  /** Plaintext value when `secret` is `false`; empty string when `secret` is `true`. */
  readonly value: string
  /** Whether the value is stored write-only as a secret. */
  readonly secret: boolean
  /** Whether a non-empty value is currently stored for this variable. */
  readonly configured: boolean
}

/** Environment variable write item submitted from the UI when creating or updating a provider. */
export interface AcpProviderEnvInput {
  /** Environment variable name. */
  readonly name: string
  /** New value (`undefined` preserves an existing secret when `keepExistingSecret` is `true`). */
  readonly value?: string
  /** Store as a write-only secret rather than plaintext metadata. */
  readonly secret?: boolean
  /** Keep the previously stored secret value unchanged. */
  readonly keepExistingSecret?: boolean
}

/** Redacted view of one configured ACP LLM provider returned to the browser. */
export interface AcpLlmProviderView {
  /** Provider route identifier registered on `ctx.llm`. */
  readonly id: AcpLlmProviderId
  /** Human-readable provider label shown in Settings and Model Selectors. */
  readonly displayName: string
  /** Whether this provider is enabled on `ctx.llm`. */
  readonly enabled: boolean
  /** Origin kind (`registry` or `local`). */
  readonly source: AcpProviderSourceKind
  /** ACP Registry agent id when `source === 'registry'`. */
  readonly registryAgentId?: string
  /** Prepared ACP Registry version when `source === 'registry'`. */
  readonly registryVersion?: string
  /** Prepared distribution kind when `source === 'registry'`. */
  readonly distribution?: AcpRegistryDistributionKind
  /** Executable command used to launch the ACP agent. */
  readonly command: string
  /** Command-line arguments passed to `command`. */
  readonly args: readonly string[]
  /** Configured environment variables (with secrets redacted). */
  readonly env: readonly AcpProviderEnvView[]
  /** Models currently exposed by this provider to DeepSeek Harness. */
  readonly models: readonly AcpProviderModelEntry[]
  /** Reasoning effort options discovered from the ACP agent's `thought_level` config option. */
  readonly reasoningEfforts: readonly AcpReasoningOption[]
  /** Config option id used by the ACP agent for model selection (for example `model`). */
  readonly modelConfigOptionId?: string
  /** Config option id used by the ACP agent for reasoning effort (for example `thought_level`). */
  readonly reasoningConfigOptionId?: string
  /** Whether the ACP agent advertised HTTP MCP support during probing. */
  readonly supportsHttpMcp?: boolean
  /** Whether the ACP agent advertised image prompt support during probing. */
  readonly supportsImages?: boolean
  /** Authentication methods advertised by the ACP agent during its latest probe. */
  readonly authMethods: readonly AcpAdvertisedAuthMethod[]
  /** Whether the latest probe succeeded in opening a session (`authenticated` / `auth_required` / `unprobed` / `error`). */
  readonly status: 'ready' | 'auth_required' | 'unprobed' | 'error'
  /** Optional diagnostic message from the latest probe or preparation attempt. */
  readonly statusMessage?: string
  /** ISO timestamp of the latest probe. */
  readonly lastProbedAt?: string
}

/** Active or recently completed interactive OAuth/agent authentication session. */
export interface AcpAuthFlowView {
  /** Flow identifier. */
  readonly flowId: string
  /** Target ACP provider route id. */
  readonly providerId: AcpLlmProviderId
  /** Selected auth method id. */
  readonly methodId: string
  /** Current flow state. */
  readonly status: 'pending' | 'url_required' | 'succeeded' | 'failed'
  /** Authorization URL to open in the user's browser when `status === 'url_required'`. */
  readonly authUrl?: string
  /** Human-readable progress or error message. */
  readonly message?: string
  /** ISO timestamp when this flow started. */
  readonly startedAt: string
}

/** Live or recently completed embedded Web PTY terminal sign-in session. */
export interface AcpTerminalAuthSessionView {
  /** Ephemeral PTY session identifier. */
  readonly sessionId: string
  /** Target ACP provider route id. */
  readonly providerId: AcpLlmProviderId
  /** Shell command line executed inside the embedded PTY. */
  readonly commandLine: string
  /** Lifecycle status of the PTY process. */
  readonly status: 'running' | 'exited' | 'failed'
  /** Process exit code once `status` leaves `'running'`. */
  readonly exitCode?: number
  /** Bounded UTF-8 terminal output tail (`<= 65_536` characters). */
  readonly output: string
  /** Monotonic cumulative UTF-8 character offset for incremental `xterm.write` deltas. */
  readonly outputOffset: number
  /** Latest `https://` authorization URL detected inside the PTY output stream, if any. */
  readonly detectedUrl?: string
  /** Optional error message when PTY allocation or execution fails. */
  readonly errorMessage?: string
  /** ISO timestamp when this PTY session started. */
  readonly startedAt: string
}

/** Local ACP-compatible CLI discovered on the host machine. */
export interface DetectedLocalAcpAgent {
  /** Suggested provider route identifier (for example `agy-acp`). */
  readonly id: string
  /** Human-readable display name (for example `Antigravity ACP`). */
  readonly displayName: string
  /** Resolved executable path or command name. */
  readonly command: string
  /** Default command-line arguments required to start ACP stdio mode (for example `['acp']`). */
  readonly args: readonly string[]
  /** Whether existing local subscription credentials were detected on disk. */
  readonly authDetected: boolean
  /** Directory or file path where local credentials were detected, when present. */
  readonly authPath?: string
  /** Whether a configured ACP provider already matches this local CLI. */
  readonly alreadyConfigured: boolean
}

/** Complete catalog snapshot returned by `ctx.remote.llmAcp.catalog()`. */
export interface AcpLlmCatalog {
  /** Monotonic state revision counter. */
  readonly revision: number
  /** Configured ACP LLM providers. */
  readonly providers: readonly AcpLlmProviderView[]
  /** Active or recent OAuth/agent auth flows. */
  readonly authFlows: readonly AcpAuthFlowView[]
  /** Active or recent embedded PTY sign-in terminal sessions. */
  readonly terminalSessions?: readonly AcpTerminalAuthSessionView[]
  /** Local ACP-compatible CLIs auto-detected on the host machine. */
  readonly detectedLocalAgents?: readonly DetectedLocalAcpAgent[]
}

/** Input payload for creating or updating an ACP LLM provider. */
export interface UpsertAcpProviderInput {
  /** Provider route identifier (`[a-z][a-z0-9_-]{0,62}`). */
  readonly id: string
  /** Human-readable display name. */
  readonly displayName: string
  /** Enable or disable the route on `ctx.llm` (default `true`). */
  readonly enabled?: boolean
  /** Provider source (`registry` or `local`). */
  readonly source: AcpProviderSourceKind
  /** ACP Registry agent id when `source === 'registry'`. */
  readonly registryAgentId?: string
  /** Preferred distribution when `source === 'registry'`. */
  readonly distribution?: AcpRegistryDistributionKind
  /** Executable command when `source === 'local'` (optional override for `registry`). */
  readonly command?: string
  /** Command arguments when `source === 'local'` (optional override for `registry`). */
  readonly args?: readonly string[]
  /** Environment variables and write-only secrets. */
  readonly env?: readonly AcpProviderEnvInput[]
  /** Optional explicit model list override or additions. */
  readonly models?: readonly AcpProviderModelEntry[]
  /** Automatically probe `initialize` + `session/new` after saving (default `true`). */
  readonly autoProbe?: boolean
}

/** Result returned by `probeProvider`. */
export interface AcpProbeOutcome {
  /** Updated provider view after probing. */
  readonly provider: AcpLlmProviderView
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Requested ACP provider or Registry agent does not exist. */
    'llm-acp/not-found': {}
    /** ACP provider configuration or request failed validation. */
    'llm-acp/invalid-argument': {}
    /** ACP Registry download, subprocess probe, or authentication operation failed. */
    'llm-acp/operation-failed': {}
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Emitted whenever ACP LLM providers, Registry preparations, or auth flows change.
     * @param revision - Monotonic catalog revision counter.
     * @mode emit
     */
    'llm-acp/changed'(revision: number): void
  }
}
