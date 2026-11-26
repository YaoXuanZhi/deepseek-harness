# Widget Runtime API (`window.DaimonWidget` & `window.DaimonCanvas`)

Read this reference before writing iframe JavaScript that interacts with `window.DaimonWidget` or `window.DaimonCanvas`. Static or self-contained client-side interactive widgets (tabs, filters, calculators, SVG charts) need no host calls beyond optional `DaimonWidget.resize()` after dynamic DOM height changes.

## 1. Portable `window.DaimonWidget` Surface

The Blueprint iframe host pre-loads `window.DaimonWidget` before user scripts execute across inline chat, right-sidebar dock, enlarge modal, desktop pin, and Canvas tiles:

```ts
type Unsubscribe = () => void;

interface DaimonWidgetRuntime {
  readonly widgetId: string;
  readonly title: string;
  readonly data: Readonly<Record<string, any>>;      // data.main holds the bound slot payload
  readonly status: 'idle' | 'running' | 'error' | 'degraded' | 'needs_input' | 'cancelled';
  readonly inputState: { readonly currentInput?: Record<string, any> };
  readonly theme: 'light' | 'dark';
  readonly locale: string;
  readonly tokens: Readonly<Record<string, string>>; // resolved --kimi-* CSS token values

  getToken(name: string): string | undefined;
  onDataChange(cb: (data: Readonly<Record<string, any>>) => void): Unsubscribe;
  getSlot(slotName?: string): any;
  onSlot(slotName: string, cb: (payload: any) => void): Unsubscribe;

  onStatusChange(cb: (info: { status: string; message?: string | null }) => void): Unsubscribe;
  onThemeChange(cb: (theme: 'light' | 'dark') => void): Unsubscribe;
  onLocaleChange(cb: (locale: string) => void): Unsubscribe;

  getSavedInput(): Record<string, any>;
  saveInput(patch: Record<string, any>): void;
  emit(eventName: string, payload?: Record<string, any>): void;

  resize(explicitHeightPx?: number): void;
  expand(): void;
  readonly files: DaimonWidgetFiles;
}
```

### Recommended Usage Patterns

1. **Subscribing to Bound Data (`data.main`)**:
   `onDataChange` invokes the callback immediately with the current snapshot and again whenever a bound `Automation` delivers fresh data:
   ```js
   window.DaimonWidget.onDataChange((data) => {
     renderView(data.main || FALLBACK_DATA);
   });
   ```
2. **Theme-Reactive Canvas 2D / Dynamic SVG Colors**:
   Normal HTML/SVG should use CSS variables (`var(--kimi-chart-1)`, `.kimi-svg-chart-1`, etc.) so light/dark switches happen automatically with zero JS. When drawing on `<canvas>`, read live token values with `DaimonWidget.getToken('--kimi-chart-1')` and redraw inside `DaimonWidget.onThemeChange(() => draw())`.
3. **Persisting User Controls & Triggering Bound Automations**:
   - `DaimonWidget.saveInput({ symbol: 'NVDA', range: '1M' })` persists control state across reloads without starting an automation.
   - `DaimonWidget.emit('submit', { symbol: 'NVDA' })` emits the declared `event:submit` payload to any bound `Automation` (`widget.event:submit -> automation.input`).
4. **Notifying Dynamic Height Changes**:
   A `ResizeObserver` already watches `document.body` and `document.documentElement`, and click/toggle events schedule automatic re-measurement. Call `DaimonWidget.resize()` if an asynchronous animation or timer changes content height.

## 2. Managed File API (`window.DaimonWidget.files`)

Widgets that accept user uploads or export generated artifacts use `FileResourceRef` objects (`{ kind: 'file', fileId, name, mimeType?, sizeBytes, sha256?, source, createdAt }`) — never raw local filesystem paths:

- `await DaimonWidget.files.pick({ accept?: '.csv,text/csv', multiple?: boolean })` -> `FileResourceRef[]` (`[]` if cancelled)
- `await DaimonWidget.files.readText(fileRefOrWorkspacePath, { maxBytes? })` -> `{ text: string }`
- `await DaimonWidget.files.readBytes(fileRefOrWorkspacePath, { maxBytes? })` -> `{ encoding: 'base64', data: string, sizeBytes: number, mimeType?: string }`
- `await DaimonWidget.files.write({ name, mimeType?, data })` -> `FileResourceRef`
- `await DaimonWidget.files.writeText('workspace/notes.txt', contents)` -> `void`
- `await DaimonWidget.files.url(fileRef)` -> `{ url: string }` (capability-scoped blob preview URL)
- `await DaimonWidget.files.download(fileRef, { suggestedFilename? })` -> `{ cancelled: boolean, fileRef?: FileResourceRef }`

## 3. Canvas Placement Surface (`window.DaimonCanvas`)

- `DaimonCanvas.viewState` / `DaimonCanvas.setViewState(patch)` / `DaimonCanvas.onViewStateChange(cb)`: placement-local UI state (selected tab or local filter) without mutating shared `Widget` data.
- `DaimonCanvas.openDashboard(canvasId?)`: opens the owning dashboard in the right panel.
- `DaimonCanvas.expand()`: opens the enlarged modal view for dense inspection.
