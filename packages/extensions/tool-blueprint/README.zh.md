---
description: "面向模型的蓝图工具集（Widget、Canvas、Binding、AutomationCreate、AutomationUpdate、AutomationControl）与已有看板上下文。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-blueprint

[English](README.md) | 中文

## 概述

在 `ctx.tools` 上注册 Kimi Work 六个蓝图工具——`Widget`、`Canvas`、`Binding`、`AutomationCreate`、`AutomationUpdate` 与 `AutomationControl`——并提供已有看板（`Canvas`）列表运行时上下文，使智能体能够在对话中创建交互式小组件、多组件看板与经过模式校验的自动化任务。

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

在智能体预设中将 `@deepseek-ai/dsh-tool-blueprint` 与宿主侧 `@deepseek-ai/dsh-blueprint` 及 `@deepseek-ai/dsh-skill-kimi-work` 一同挂载：

```yaml
- id: tool-blueprint
  name: '@deepseek-ai/dsh-tool-blueprint'
```

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

各工具将存储、HTML 与模式校验及任务执行委托给 `ctx.blueprint`，并在工具结果上附加精简的 `presentationMeta`（`widget`、`canvas`、`automation`、`binding`），供 `@deepseek-ai/dsh-client-ui-blueprint` 直接渲染实时沙箱小组件、看板卡片与任务开关卡片。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 六个蓝图工具定义（`Widget`、`Canvas`、`Binding`、`AutomationCreate`、`AutomationUpdate`、`AutomationControl`）与 `blueprint:canvases` 上下文 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-blueprint](../blueprint/README.zh.md) — 宿主蓝图存储、校验器与自动化运行器。
- [ui-blueprint](../../client/ui-blueprint/README.zh.md) — 浏览器端小组件沙箱、任务卡片与看板视图。
- [工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-blueprint) — 生成的蓝图工具参数定义。

-----

<a id="model-experience"></a>
## 模型体验

### Blueprint tool schemas and results

#### 模型看到的内容

[`Widget`、`Canvas`、`Binding`、`AutomationCreate`、`AutomationUpdate` 与 `AutomationControl` 工具定义](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-blueprint)接收结构化资产操作并返回精简确认或校验诊断，同时将界面渲染元数据独立保存在 `presentationMeta` 中，不占用模型可见正文。

#### Token 影响

挂载本插件的预设承担六个工具定义的固定开销；除显式执行 `Widget` 的 `read` 或 `read_file` 外，每次工具结果仅返回单行摘要。

#### KV Cache 影响

工具声明在多步对话中保持固定，工具调用与结果按常规方式追加至会话历史末尾。

### Existing dashboard runtime context

#### 模型看到的内容

当 `ctx.blueprint` 中存在至少一个看板时，可选的 `blueprint:canvases` 运行时上下文列出各看板的 `id`、`title`、小组件数量与布局模式；无看板时不输出内容。

#### Token 影响

无看板时为零；存在看板时每个看板仅占一行简短摘要。

#### KV Cache 影响

动态上下文附加在请求尾部，不会改动静态系统提示词前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **嵌套 Schema 采用 JSON 字符串参数** — `slots_json`、`events_json`、`input_schema_json` 与 `result_schema_json` 通过 JSON 字符串传入，以确保扁平工具参数兼容所有模型网关适配器。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
