---
description: "浏览器蓝图界面：沙箱化对话内嵌小组件、daimon-canvas 看板预览卡片、自动化任务卡片与 12 列响应式看板。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-blueprint

[English](README.md) | 中文

## 概述

`ui-blueprint` 在 Web 与桌面端界面呈现 Kimi Work 四元蓝图体验：包括支持受控文件桥接（`DaimonWidget.files`）与独立悬浮置顶窗（`桌面置顶`）的对话流内嵌 `<iframe sandbox="allow-scripts">` 交互**小组件**（`Widget`）、可点击的 `daimon-canvas` Markdown 看板预览卡片、带开启/关闭与立即运行按钮的**自动化任务卡片**（定时任务与小组件任务）、左侧导航栏**看板**主视图以及右侧边栏看板标签页。

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

在浏览器插件列表中将 `@deepseek-ai/dsh-client-ui-blueprint` 与宿主侧 `@deepseek-ai/dsh-blueprint` 及预设中的 `@deepseek-ai/dsh-tool-blueprint` 一同挂载。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

`BlueprintWidgetFrame` 在 `<iframe sandbox="allow-scripts">` 中承载每个小组件，通过 `daimon-widget` / `daimon-widget-host` `postMessage` 协议同步当前明暗主题（`light`/`dark`）、界面语言、动态数据槽位（`slots`）、持久化输入（`savedInput`）、自适应高度、`DaimonWidget.files` 文件调用以及 `emit('submit', payload)` 事件触发。`createWidgetPinController` 在 Electron 桌面端通过 `window.dshDesktop.widgetPins` 打开无边框置顶 `BrowserWindow` 悬浮窗，在 Web 浏览器端则打开实时同步的 `documentPictureInPicture` 或独立弹出悬浮窗。共享的 `BlueprintCatalogController` 监听 `blueprint/changed` SSE 事件，当后台自动化任务完成时实时刷新对话内小组件、置顶悬浮窗与已打开的看板。

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 注册 `sidebar.panellist`、`main`、`sidebar.right.pane.tab`、`tool.call.toolview`、`conversation.turn.tail` 与 `conversation.chat.markdown.fence` 插槽 |
| [`src/client/BlueprintWidgetFrame.tsx`](src/client/BlueprintWidgetFrame.tsx) | 沙箱小组件容器、置顶窗口切换按钮与 `postMessage` 双向桥接 |
| [`src/client/widget-files-host.ts`](src/client/widget-files-host.ts) | 受控 `DaimonWidget.files` 宿主分发器（`pick`、`readText`、`readBytes`、`write`、`writeText`、`url`、`download`） |
| [`src/client/widget-pin-host.ts`](src/client/widget-pin-host.ts) | 桌面端与 Web 浏览器小组件独立置顶悬浮窗控制器 |
| [`src/client/BlueprintToolViews.tsx`](src/client/BlueprintToolViews.tsx) | 蓝图工具专属视图卡片、轮次尾部常驻卡片与 `daimon-canvas` 代码块渲染层 |
| [`src/client/BlueprintDashboardBoard.tsx`](src/client/BlueprintDashboardBoard.tsx) | 交互式 12 列栅格看板页面与右侧边栏标签页 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-blueprint](../../extensions/blueprint/README.zh.md) — 宿主蓝图存储与 Python 自动化执行引擎。
- [dsh-tool-blueprint](../../extensions/tool-blueprint/README.zh.md) — 面向模型的蓝图工具集。

-----

<a id="model-experience"></a>
## 模型体验

无直接模型输入：浏览器端渲染、看板排版编辑与手动运行自动化均通过 `ctx.remote.blueprint` 操作宿主存储，不新增系统提示词、工具结构或会话消息。

#### KV Cache 影响

交互小组件与看板操作独立于会话日志更新宿主蓝图状态，保持所有会话的模型输入前缀不变。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **内嵌沙箱高度上限** — 对话内小组件自适应高度范围为 `180px` 至 `720px`，超出 `720px` 时在组件内部滚动。
- **看板界面快捷宽度切换** — 看板界面提供半宽（6 列）与通栏（12 列）一键切换，任意 `(x, y, w, h)` 栅格坐标编排可通过 `Canvas` 工具及远程接口完成。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
