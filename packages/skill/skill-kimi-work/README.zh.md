---
description: "内置 Kimi Work 技能包，按需渐进加载蓝图小组件、看板、自动化任务、数据绑定、视觉设计与深度研究工作流。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-kimi-work

[English](README.md) | 中文

## 概述

在 `ctx.skills` 上注册七个内置 Kimi Work 技能——`blueprint`、`widget`、`widgetdesign`、`canvas`、`automation`、`binding` 与 `deep-research`——使智能体在会话技能目录中仅看到精简摘要，并在需要时通过 [`dsh-tool-skill`](../tool-skill/README.zh.md) 按需加载完整工作流说明。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 `dsh-skill`、`dsh-tool-skill` 与 `@deepseek-ai/dsh-tool-blueprint` 旁挂载本提供方，使智能体能够按需加载蓝图创作指引并调用对应的 `Widget`、`Canvas`、`Binding`、`AutomationCreate`、`AutomationUpdate` 和 `AutomationControl` 工具。

```yaml
- name: '@deepseek-ai/dsh-skill-kimi-work'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `assetRoot` | 包内 `assets/` | 包含各内置 Kimi Work 技能目录（`<skill>/SKILL.md`）的绝对路径。 |

相对路径的 `assetRoot` 会记录警告并跳过注册。缺失或元数据无效的 `SKILL.md` 会记录警告并从目录发现中省略；若已发现的文件在 `load()` 前被移除，提供方会将其省略并通知 `ctx.skills` 刷新目录。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

提供方以来源 `'kimi-work'` 和优先级 `10` 注册，与内置技能优先级一致，因此项目或用户目录中的同名技能可覆盖任意内置工作流。`load(name)` 返回指向 `assets/<name>` 的 `baseDir`，便于按相对路径读取 `widget/references/runtime-api.md` 与 `widgetdesign/references/design-system.md` 等参考文档。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 注册 `'kimi-work'` 技能提供方、校验 `SKILL.md` 元数据，并处理失效与卸载清理。 |
| [`assets/`](assets/) | 蓝图编排、小组件、Kimi Perspective 视觉规范、看板、自动化、绑定及深度研究的内置 `SKILL.md` 与参考文档。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [技能注册表](../skill/README.zh.md) — 提供方优先级与目录合并规则。
- [技能工具](../tool-skill/README.zh.md) — 会话技能目录渲染与 `skill` 加载执行。

-----

<a id="model-experience"></a>
## 模型体验

间接影响：由 `dsh-tool-skill` 在会话目录中为每个内置 Kimi Work 技能渲染一行摘要，并在调用 `skill(<name>)` 时返回对应的 `SKILL.md` 正文。

#### KV Cache 影响

技能摘要未变化时会话目录保持稳定；加载技能会将其 `SKILL.md` 正文作为普通工具结果追加到会话历史，不改写已有消息。若技能文件不可读而被省略，后续步骤会发布目录更新。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 缺失或元数据无效的内置 `SKILL.md` 在当前提供方实例生命周期内保持省略，需重新加载插件或重启进程后才会重新扫描。
- `assets/<skill>/references/` 下的参考文档由模型按需通过文件工具读取，不会在首次调用 `skill()` 时自动内联。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
