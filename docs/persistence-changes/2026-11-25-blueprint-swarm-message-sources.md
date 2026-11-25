---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-25-blueprint-swarm-message-sources

English | [中文](2026-11-25-blueprint-swarm-message-sources.zh.md)

## Summary

Adds Blueprint widget event and Swarm mode prompt variants to the merge-extensible MessageSource union.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing Session logs remain valid because existing source variants are unchanged. Readers switch on source.kind with a documented fallback arm for merge-extensible MessageSourceMap entries, so older readers treat unfamiliar source variants as generic sourced messages without misinterpreting content.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/extensions/blueprint/tests/blueprint.spec.ts packages/client/ui-blueprint/tests/blueprint-ui.client.spec.tsx: 12 tests passed.

<a id="dev-note"></a>
## Dev Note

None.
