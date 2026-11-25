---
description: "Browser Blueprint surfaces: sandboxed inline Widgets, daimon-canvas preview cards, interactive Automation Task Cards, and 12-column Dashboards (看板)."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-blueprint

English | [中文](README.zh.md)

## Summary

`ui-blueprint` renders Kimi Work's four-asset Blueprint experience in the Web and Desktop GUI: sandboxed `<iframe sandbox="allow-scripts">` **Widgets** (`小组件`) inline in Chat with controlled `DaimonWidget.files` upload/download access and floating **Pin Windows** (`桌面置顶`), clickable `daimon-canvas` Markdown preview cards, interactive **Task Cards** (`定时任务` / `小组件任务`) with Enable/Disable and Run-now controls, a Left-Sidebar **Dashboards** (`看板`) navigation page, and a Right-Sidebar Dashboard tab.

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

Mount `@deepseek-ai/dsh-client-ui-blueprint` in the browser plugin roster alongside Host `@deepseek-ai/dsh-blueprint` and preset `@deepseek-ai/dsh-tool-blueprint`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`BlueprintWidgetFrame` hosts each Widget inside `<iframe sandbox="allow-scripts">` and exchanges `daimon-widget` / `daimon-widget-host` `postMessage` frames to synchronize active theme (`light`/`dark`), locale, dynamic `slots`, `savedInput`, auto-measured height, `DaimonWidget.files` calls, and outbound `emit('submit', payload)` triggers. `createWidgetPinController` pins any Widget into a frameless always-on-top `BrowserWindow` on Electron Desktop (`window.dshDesktop.widgetPins`) or a synchronized `documentPictureInPicture` / popup floating window on Web. One shared `BlueprintCatalogController` subscribes to `blueprint/changed` SSE events so Chat cards, floating Pin Windows, and open Dashboards refresh immediately when background Automations complete.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Slot registrations across `sidebar.panellist`, `main`, `sidebar.right.pane.tab`, `tool.call.toolview`, `conversation.turn.tail`, and `conversation.chat.markdown.fence` |
| [`src/client/BlueprintWidgetFrame.tsx`](src/client/BlueprintWidgetFrame.tsx) | Sandboxed Widget iframe host, toolbar Pin toggle, and `postMessage` bridge |
| [`src/client/widget-files-host.ts`](src/client/widget-files-host.ts) | Controlled `DaimonWidget.files` host dispatcher (`pick`, `readText`, `readBytes`, `write`, `writeText`, `url`, `download`) |
| [`src/client/widget-pin-host.ts`](src/client/widget-pin-host.ts) | Floating always-on-top Pin Window controller for Electron Desktop and Web |
| [`src/client/BlueprintToolViews.tsx`](src/client/BlueprintToolViews.tsx) | Keyed tool cards, Turn-tail cards, and `daimon-canvas` fence renderer |
| [`src/client/BlueprintDashboardBoard.tsx`](src/client/BlueprintDashboardBoard.tsx) | Interactive 12-column Dashboard page and Right-Sidebar tab |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-blueprint](../../extensions/blueprint/README.md) — Host Blueprint store and Python Automation engine.
- [dsh-tool-blueprint](../../extensions/tool-blueprint/README.md) — Model-facing Blueprint tools.

-----

<a id="model-experience"></a>
## Model Experience

None, as browser presentation, dashboard layout edits, and manual Automation toggles operate over `ctx.remote.blueprint` without adding prompts, tool schemas, or conversation messages.

#### KV Cache effect

Interactive Widget and Dashboard actions mutate Host Blueprint storage outside Session logs, preserving every Session's model-input prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Sandboxed iframe height cap** — inline Chat Widgets auto-size between `180px` and `720px`, while Dashboard tiles render on a unified `1092px` 12-column design canvas (`80px` column, `32px` row, `12px` gap) with automatic whole-board proportional scaling (`boardZoom`) and auto-measured row height.
- **Free-form pixel canvas mode** — Dashboard tiles support interactive 12-column drag-move, East/South/Southeast resize handles, one-click Auto-Arrange, and a fullscreen Enlarge modal; arbitrary pixel-only `free` mode layouts remain driven by the `Canvas` RPC API.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
