# `window.DaimonWidget` & `window.DaimonCanvas` Runtime Reference

Every sandboxed Widget iframe receives `window.DaimonWidget` and `window.DaimonCanvas` automatically in `<head>`.

## Portable Data, Theme & Status Surface

```js
const host = window.DaimonWidget

// Subscribe to live slot updates (`data.main` holds the latest Automation artifact)
const stopData = host.onDataChange((data) => {
  renderView(data.main || {})
})

// Read and persist user-controlled form/filter state across reloads
const saved = host.inputState.currentInput || host.getSavedInput() || {}
host.saveInput({ period: '30d', threshold: 0.8 })

// Emit a named event (typically 'submit') to trigger a bound Automation
host.emit('submit', { query: 'NVDA', windowDays: 14 })

// Theme ('light' | 'dark'), locale, and CSS token lookup for Canvas 2D / SVG
const accent = host.getToken('--kimi-chart-1') || '#1783FF'
host.onThemeChange(() => redrawChart())
```

## Controlled File Resource Bridge (`DaimonWidget.files`)

`window.DaimonWidget.files` (also aliased on `window.DaimonCanvas.files`) lets sandboxed Widgets pick large user CSV/Excel/binary files (up to 250 MiB streamed directly to the Host Resource Store), read/write small files or `workspace/...` assets, mint expiring preview URLs, and trigger native Save-As / browser downloads.

```ts
interface FileResourceRef {
  readonly kind: 'file'
  readonly fileId: string
  readonly name: string
  readonly mimeType?: string
  readonly sizeBytes: number
  readonly sha256?: string
  readonly source: 'user-upload' | 'widget-output' | 'automation-output' | 'imported'
  readonly createdAt: string
}
```

```js
// 1. Pick user file(s) -> returns FileResourceRef[] ([] when cancelled)
const [inputFile] = await window.DaimonWidget.files.pick({
  accept: ['.csv', 'text/csv'],
  multiple: false,
})
if (inputFile) {
  window.DaimonWidget.saveInput({ inputFile })
  window.DaimonWidget.emit('submit', { inputFile })
}

// 2. Read UTF-8 text (<= 10 MiB on FileResourceRef) or base64 bytes (<= 25 MiB)
const csvText = await window.DaimonWidget.files.readText(inputFile)
const bin = await window.DaimonWidget.files.readBytes(inputFile) // { encoding: 'base64', data, sizeBytes }

// 3. Create a managed output file (<= 50 MiB) and trigger user download / Save-As
const reportRef = await window.DaimonWidget.files.write({
  name: 'summary-report.csv',
  mimeType: 'text/csv',
  data: 'model,monthly_usd\nDeepSeek-V3,311.4\n',
})
await window.DaimonWidget.files.download(reportRef, {
  suggestedFilename: reportRef.name,
})

// 4. Write/read persistent Widget workspace files (`workspace/...`) & preview URLs
const written = await window.DaimonWidget.files.writeText('workspace/notes.json', '{"ok":true}')
const previewUrl = await window.DaimonWidget.files.url(reportRef)
```

Persist and submit only `FileResourceRef` JSON objects — never `File`, `Blob`, local filesystem paths, or temporary preview URLs. Python `code` Automations receive `ctx["resourcesDir"]` so large uploaded files can be streamed directly from `os.path.join(ctx["resourcesDir"], file_ref["fileId"], "payload")`.

## Desktop Floating Pin Window (`桌面置顶`) Layout Rule

Users can pin any Widget into a standalone always-on-top floating window (`桌面置顶`). Desktop Pin Windows render a 32px draggable header bar above the Widget frame, and responsive size tiers (`compact` / `regular` / `expanded`) are reflected live on `<html data-daimon-size-tier="...">`. Keep interactive controls clear of the top edge or allow clean reflow across `compact` (`< 300px` wide) and `regular` viewports.

## Declaring `slots` and `events` on `Widget`

When a widget connects to an `Automation` through `Binding`, declare JSON Schemas on the widget:

- `slots.main.schema`: JSON Schema of the object rendered by the widget.
- `events.submit.schema`: JSON Schema of the payload emitted via `DaimonWidget.emit('submit', payload)`.
