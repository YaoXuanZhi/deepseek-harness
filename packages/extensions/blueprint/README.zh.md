---
description: "宿主蓝图服务，持久化管理交互式小组件、12 列栅格看板、自动化任务与数据模式校验绑定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-blueprint

[English](README.md) | 中文

## 概述

`dsh-blueprint` 为 Kimi Work 四元蓝图系统提供宿主持久化服务（`ctx.blueprint`）与 Typert 远程命名空间（`ctx.remote.blueprint`），统一管理沙箱化 HTML/CSS/JS **小组件**（`Widget`）、12 列栅格与自由布局**看板**（`Canvas`）、默认关闭的**自动化任务**（`Automation`：定时任务与小组件任务）以及经过 JSON Schema 校验的**双向绑定**（`Binding`）。

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

在宿主层挂载 `@deepseek-ai/dsh-blueprint`，以便智能体预设暴露 `@deepseek-ai/dsh-tool-blueprint` 并由浏览器端的 `@deepseek-ai/dsh-client-ui-blueprint` 实时渲染小组件与看板。

```yaml
- id: blueprint
  name: '@deepseek-ai/dsh-blueprint'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `root` | `dshHomePath('blueprint')` | 存放 `state.json`、`widgets/<id>/`、`automations/<id>/` 与 `resources/<fileId>/` 的绝对目录。 |
| `schedulerTickMs` | `15000` | 已启用 `schedule`、`interval` 与 `once` 自动化任务的轮询间隔毫秒数（`0` 表示禁用后台定时器）。 |
| `maxRunsPerAutomation` | `50` | 每个自动化任务保留的最大运行历史条数。 |
| `codeTimeoutMs` | `30000` | Python `code` 类型自动化任务的单次执行超时毫秒数。 |
| `pythonCommand` | Windows 为 `'python'`，其余平台为 `'python3'` | 运行 `def run(ctx)` 自动化脚本的 Python 命令。 |
| `maxUploadBytes` | `262144000`（250 MiB） | `POST /blueprint/resources/upload` 接收流式用户上传文件的最大字节数。 |
| `maxReadTextBytes` | `10485760`（10 MiB） | `DaimonWidget.files.readText` 读取 `FileResourceRef` 的最大字节上限。 |
| `maxReadBytes` | `26214400`（25 MiB） | `DaimonWidget.files.readBytes` 读取 `FileResourceRef` 的最大字节上限。 |
| `maxWriteBytes` | `52428800`（50 MiB） | `DaimonWidget.files.write` 写入受管文件的最大字节上限。 |
| `resourceUrlTtlMs` | `900000`（15 分钟） | `/blueprint/resources/blob/<fileId>` 临时预览与下载能力令牌链接的有效期毫秒数。 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

`BlueprintService` 继承 `TypertRemoteService`（命名空间为 `'blueprint'`），每次原子写入状态后发出 `'blueprint/changed'` 事件。当存在 `webServer` 时，服务注册 `/blueprint/widgets` 前缀路由（`auth: 'required'`）自动注入 Kimi Perspective 设计令牌（`--kimi-*` / `--kp-*`）及含 `DaimonWidget.files` 的 `window.DaimonWidget` 桥接脚本，提供 `POST /blueprint/resources/upload` 大文件流式上传与 `GET /blueprint/resources/blob/<fileId>` 限时预览/下载路由，并向 Python `code` 自动化注入 `ctx["resourcesDir"]` 以便直接按需流式处理大体积 CSV、Excel 或二进制文件。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `BlueprintService` 增删改查、HTTP 沙箱资源路由、`@Remote` 远程方法与 Python 任务执行器 |
| [`src/runtime-assets.ts`](src/runtime-assets.ts) | Kimi Perspective CSS 变量、`.kimi-*` 宿主组件类、`<kimi-icon>` 自定义元素与 `window.DaimonWidget` 沙箱运行时 |
| [`src/kimi-icons.ts`](src/kimi-icons.ts) | 支撑 `<kimi-icon>` 的 105 个官方 Kimi Perspective `24x24` `currentColor` 矢量图标字典 |
| [`src/validation.ts`](src/validation.ts) | HTML 校验、12 列栅格无重叠自动排版、JSON Schema 绑定校验及 5 段式 Cron 匹配 |
| [`src/types.ts`](src/types.ts) | 品牌化 ID 与四元资产共享类型声明 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-tool-blueprint](../tool-blueprint/README.zh.md) — 面向模型的 `Widget`、`Canvas`、`Binding` 与 `Automation*` 工具。
- [ui-blueprint](../../client/ui-blueprint/README.zh.md) — 对话内嵌小组件、任务卡片与看板（`看板`）视图。

-----

<a id="model-experience"></a>
## 模型体验

间接影响：由 `@deepseek-ai/dsh-tool-blueprint` 基于 `ctx.blueprint` 向模型暴露蓝图工具与已有看板列表。

#### KV Cache 影响

宿主服务本身不注册系统提示词或工具定义；后台自动化运行仅更新磁盘上的小组件槽位数据，不改变会话历史前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **`code` 类型自动化依赖宿主 Python 解释器** — `execution.type === 'code'` 需要宿主存在可用的 `pythonCommand`；缺失解释器时运行会明确报错并在绑定的小组件状态栏提示。
- **进程内定时轮询** — 定时自动化仅在宿主进程运行期间触发；进程停止期间错过的周期不会在重启时自动补跑。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
