---
description: "模型设置页扩展插件：支持在线搜索安装 ACP Registry 服务、通过网页 OAuth 或本机终端完成订阅授权登录，以及配置本地 ACP 模型提供商。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-acp

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-client-ui-settings-acp` 向**设置 → 模型**页面的 `settings.models.footer` 插槽贡献**ACP 授权模型服务**分区。用户可以从官方 ACP Registry 在线搜索并一键安装服务，配置携带只写密钥环境变量与手动模型覆盖项的本地 ACP 可执行程序，针对订阅制服务发起网页 OAuth 授权或拉起本机终端完成登录，并探测服务声明的模型列表使其直接出现在 DeepSeek Harness 的模型选择器中。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

`dsh-web-app` 会随 `@deepseek-ai/dsh-client-ui-settings-models` 与 `@deepseek-ai/dsh-llm-acp` 自动挂载 `@deepseek-ai/dsh-client-ui-settings-acp`。打开**设置 → 模型**并滚动至 HTTP 提供商列表下方的**ACP 授权模型服务**：

- **ACP Registry 在线搜索**——调用 `ctx.remote.llmAcp.searchRegistry` 检索目录，在存在多种分发方式（`npx`、`binary`、`uvx`）时允许按需选择，将分发包隔离下载准备到 `$DSH_HOME/acp-registry` 内，并自动探测可用模型与登录方式。
- **本地 ACP 命令**——配置自定义 Provider ID、显示名称、可执行命令、启动参数、普通或只写加密环境变量，以及可选的手动模型列表。
- **授权登录与探测模型**——在任意已保存的 ACP 服务行展开授权面板，一键发起网页 OAuth 授权（`startAuth`）、拉起本机终端窗口登录（`launchTerminalLogin`）或重新探测模型（`probeProvider`）。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

客户端入口注册覆盖全部八种内置语言的 `settingsAcp` 本地化命名空间，维护通过 `ctx.remote.llmAcp.catalog()`、`'llm-acp/changed'` 与 `'connection/reset'` 同步的响应式 `Observable` 状态，并将 `AcpSettingsFooter` 注入 `settings.models.footer` 插槽。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 保持 Loader 对称性的空宿主插件入口 |
| [`src/client/index.ts`](src/client/index.ts) | 客户端插槽注入、Remote 目录订阅与多语言词典注册 |
| [`src/client/AcpSettingsFooter.tsx`](src/client/AcpSettingsFooter.tsx) | 服务行卡片、授权登录面板、Registry 搜索安装页签、本地命令编辑器与删除确认弹窗 |
| [`src/client/AcpSettingsFooter.module.css`](src/client/AcpSettingsFooter.module.css) | 与 `ui-settings-models` 视觉规范对齐的主题变量样式 |
| [`src/client/locales.ts`](src/client/locales.ts) | 内置八语种界面文案词典 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-llm-acp](../../llm/llm-acp/README.zh.md)——宿主侧 ACP 大语言模型适配器、Registry 安装器、OAuth/终端登录执行器与回环 HTTP MCP 工具桥接器。
- [ui-settings-models](../ui-settings-models/README.zh.md)——承载 `settings.models.footer` 扩展插槽的模型设置页面。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包是纯浏览器侧 UI 插件层，不注册任何面向模型的内容。

#### KV 缓存影响

无；本包既不组装也不发送模型提供商请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **已保存密钥采用只写展示**——加密环境变量仅展示已保存占位提示而不会回显明文；保持「加密」勾选且输入留空即可保留原密钥，输入新值则会覆盖保存。
- **Registry 在线搜索需要宿主具备出站 HTTPS 访问**——当宿主无法访问所配置的 ACP Registry 地址且本地尚无缓存索引时，Registry 页签会提示拉取失败，此时仍可离线使用**本地 ACP 命令**页签。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
