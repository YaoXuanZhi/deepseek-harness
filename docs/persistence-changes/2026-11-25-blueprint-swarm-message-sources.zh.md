---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-25-blueprint-swarm-message-sources

[English](2026-11-25-blueprint-swarm-message-sources.md) | 中文

## 概述

向支持声明合并扩展的 MessageSource 联合类型新增 Blueprint 组件事件与 Swarm 模式提示来源变体。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-25-blueprint-swarm-message-sources
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-19-cua-input-notices"
    after: "7581a133bb56b0fa107eeadf37d7a62cb942c78cb6509b8d6d35beeb27ea6c72"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-19-cua-input-notices"
    after: "f8d0b91b0466f483d5cfddbee42d180450f2f1d581c6a7d524fe39c5a020307f"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-19-cua-input-notices"
    after: "5c4125ed16e2deb39e4cdc7e3b936a3a9c2d88ce40fcd3df3dffb5bc1e07001b"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-19-cua-input-notices"
    after: "a99066ccfa10c57450057e9cc1551f103e66d7c32f1e3be74e1572ce5f104dfe"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有 Session 日志保持有效，既有来源变体未发生变化。读取方按 source.kind 分支并为可扩展的 MessageSourceMap 条目保留默认兜底分支，旧读取方会将未知来源变体按通用带来源消息安全展示而不会误读内容。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/extensions/blueprint/tests/blueprint.spec.ts packages/client/ui-blueprint/tests/blueprint-ui.client.spec.tsx：12 个测试通过。

<a id="dev-note"></a>
## 开发备注

无。
