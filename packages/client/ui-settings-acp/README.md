---
description: "Models settings UI extension for searching and installing ACP Registry agents, authenticating subscription ACP services via OAuth or terminal login, and configuring local ACP model providers."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-acp

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-client-ui-settings-acp` contributes the **ACP Authorized Model Services** (`ACP 授权模型服务`) section into the `settings.models.footer` slot on **Settings → Models**. Users can search and one-click install agents from the official ACP Registry, configure custom local ACP executables with write-only environment secrets and manual model overrides, trigger browser OAuth sign-in or launch an interactive OS terminal login for subscription services, and probe advertised models so they appear directly in DeepSeek Harness's model pickers.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

`dsh-web-app` mounts `@deepseek-ai/dsh-client-ui-settings-acp` automatically alongside `@deepseek-ai/dsh-client-ui-settings-models` and `@deepseek-ai/dsh-llm-acp`. Open **Settings → Models** and scroll to **ACP Authorized Model Services** below the HTTP provider list:

- **ACP Registry online search** — searches `ctx.remote.llmAcp.searchRegistry`, lets the user pick a supported distribution (`npx`, `binary`, or `uvx`) when multiple exist, downloads and prepares the package inside `$DSH_HOME/acp-registry`, and probes advertised models and auth methods.
- **Local ACP command** — configures a custom Provider ID, display name, executable command, arguments, plaintext or write-only secret environment variables, and optional manual model IDs.
- **Authorize & Probe** — opens the inline authentication panel for any saved ACP provider to start a web OAuth flow (`startAuth`), sign in directly inside an embedded `@xterm/xterm` PTY terminal (`startTerminalAuth`), pop out an external OS terminal (`launchTerminalLogin`), or re-probe models (`probeProvider`).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The client entry registers the `settingsAcp` locale namespace across all eight shipped languages, maintains a reactive `Observable` synchronized via `ctx.remote.llmAcp.catalog()`, `'llm-acp/changed'`, and `'connection/reset'`, and injects `AcpSettingsFooter` into `settings.models.footer`.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | No-op Host plugin entry for Loader symmetry |
| [`src/client/index.ts`](src/client/index.ts) | Client slot injection, Remote catalog subscription, and locale registration |
| [`src/client/AcpSettingsFooter.tsx`](src/client/AcpSettingsFooter.tsx) | Provider cards, auth panel, Registry search/install tab, local command editor, and delete confirmation modal |
| [`src/client/AcpSettingsFooter.module.css`](src/client/AcpSettingsFooter.module.css) | Theme-token styles matching `ui-settings-models` |
| [`src/client/ProviderAuthTerminal.tsx`](src/client/ProviderAuthTerminal.tsx) | Lazy-loaded `@xterm/xterm` interactive sign-in terminal with theme sync and clickable `https://` links |
| [`src/client/ProviderAuthTerminal.module.css`](src/client/ProviderAuthTerminal.module.css) | Isolated styles for the lazy-loaded embedded terminal surface |
| [`src/client/locales.ts`](src/client/locales.ts) | Shipped eight-language UI copy dictionaries |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-llm-acp](../../llm/llm-acp/README.md) — Host ACP LLM adapter, Registry installer, OAuth/terminal login runner, and loopback HTTP MCP tool bridge.
- [ui-settings-models](../ui-settings-models/README.md) — Models settings page that hosts the `settings.models.footer` extension slot.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Saved secret values are write-only** — secret environment variables display a configured placeholder rather than echoing stored values; leave a saved secret blank while `Secret` remains checked to preserve it, or type a replacement value to overwrite it.
- **Registry search requires outbound HTTPS on the Host** — when the Host cannot reach the configured ACP Registry URL and has no cached index on disk, the Registry tab reports the fetch error while the **Local ACP Command** tab remains usable offline.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
