# Extensions

English | [中文](extensions.zh.md)

The extensions subsystem lets an agent define versioned Cordis packages, run their host and browser halves, and query approved runtime metadata before writing code. Package lifecycle and sandbox behavior belong to the [`packages/extensions`](../../packages/extensions/README.md) package group.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxblueprint--blueprintservice"></a>

### `ctx.blueprint` — `BlueprintService`

Durable four-asset Blueprint service (`Widget`, `Canvas`, `Automation`, `Binding`).

```ts cordis-catalog
/**
 * Read the current four-asset Blueprint catalog snapshot.
 * @returns Detached catalog of Widgets, Canvases, Automations, and Bindings.
 */
@Remote('catalog') catalog(): Promise<BlueprintCatalogSnapshot>

/**
 * Create or replace a Widget and write its `index.html` and optional companion files.
 * @param input - Widget creation payload.
 * @returns Stored Widget detail including assembled sandboxed HTML.
 */
async createWidget(input: CreateWidgetInput): Promise<BlueprintWidgetDetail>

/**
 * Update an existing Widget's manifest, HTML, files, or slot data.
 * @param input - Partial Widget update payload.
 * @returns Updated Widget detail.
 */
async updateWidget(input: UpdateWidgetInput): Promise<BlueprintWidgetDetail>

/**
 * Read one Widget including its assembled sandboxed HTML.
 * @param id - Widget identifier.
 * @returns Widget detail.
 */
@Remote('getWidget') async getWidget(id: string): Promise<BlueprintWidgetDetail>

/**
 * List all stored Widgets without loading their HTML bodies.
 * @returns Stored Widget manifests ordered by most recent update.
 */
listWidgets(): BlueprintWidgetRecord[]

/**
 * Validate a Widget's HTML structure and metadata.
 * @param id - Widget identifier.
 * @returns Validation diagnostics.
 */
async validateWidget(id: string): Promise<BlueprintValidationResult>

/**
 * Delete a Widget, remove its placements from Canvases, and remove attached Bindings.
 * @param id - Widget identifier.
 */
async deleteWidget(id: string): Promise<void>

/**
 * Read a file inside a Widget's workspace directory.
 * @param id - Widget identifier.
 * @param relativePath - Relative path inside the widget workspace.
 * @returns UTF-8 file text.
 */
async readWidgetFile(id: string, relativePath: string): Promise<string>

/**
 * Write a file inside a Widget's workspace directory.
 * @param id - Widget identifier.
 * @param relativePath - Relative path inside the widget workspace.
 * @param content - UTF-8 file text.
 */
async writeWidgetFile(id: string, relativePath: string, content: string): Promise<void>

/**
 * Persist interactive form/filter input saved by `window.DaimonWidget.saveInput(...)`.
 * @param request - Widget id and JSON input object.
 * @returns Updated Widget record.
 */
@Remote('saveWidgetInput') async saveWidgetInput( request: { readonly widgetId: string; readonly input: Readonly<Record<string, JsonValue>> }, ): Promise<BlueprintWidgetRecord>

/**
 * Handle an outbound event emitted by `window.DaimonWidget.emit(event, data)`
 * and trigger any enabled `widget -> automation` bindings.
 * @param request - Widget id, event name, and JSON payload.
 * @returns Triggered run records.
 */
@Remote('emitWidgetEvent') async emitWidgetEvent( request: { readonly widgetId: string; readonly event: string; readonly data: JsonValue }, ): Promise<readonly BlueprintAutomationRun[]>

/**
 * Read UTF-8 text from a managed `FileResourceRef` or a Widget's `workspace/<path>`.
 * Enforces the configured 10 MiB default read cap on `FileResourceRef` reads.
 * @param request - Target `fileId` or `workspacePath` (`workspace/...`) and optional `maxBytes`.
 * @returns Decoded UTF-8 text.
 */
@Remote('readFileText') async readFileText(request: { readonly widgetId?: string readonly fileId?: string readonly workspacePath?: string readonly maxBytes?: number }): Promise<{ readonly text: string }>

/**
 * Read base64-encoded bytes from a managed `FileResourceRef` or a Widget's `workspace/<path>`.
 * Enforces the configured 25 MiB default read cap on `FileResourceRef` reads.
 * @param request - Target `fileId` or `workspacePath` and optional `maxBytes`.
 * @returns Base64 byte envelope.
 */
@Remote('readFileBytes') async readFileBytes(request: { readonly widgetId?: string readonly fileId?: string readonly workspacePath?: string readonly maxBytes?: number }): Promise<BlueprintFileBytes>

/**
 * Create a managed `FileResourceRef` from UTF-8 text or base64 bytes (`DaimonWidget.files.write`).
 * @param request - File name, optional MIME type, encoding (`utf8` | `base64`), and payload string.
 * @returns Stored `BlueprintFileResourceRef`.
 */
@Remote('writeManagedFile') async writeManagedFile(request: { readonly name: string readonly mimeType?: string readonly encoding: 'utf8' | 'base64' readonly data: string readonly source?: BlueprintFileSource }): Promise<BlueprintFileResourceRef>

/**
 * Write UTF-8 text under a Widget's `workspace/<path>` (`DaimonWidget.files.writeText`).
 * @param request - Widget id, `workspace/...` path, and UTF-8 contents.
 * @returns Written workspace path, persistent widget asset URL, and byte count.
 */
@Remote('writeWidgetWorkspaceText') async writeWidgetWorkspaceText(request: { readonly widgetId: string readonly path: string readonly contents: string }): Promise<{ readonly path: string; readonly url: string; readonly bytesWritten: number }>

/**
 * Mint an expiring preview/download URL for a `FileResourceRef` or resolve a Widget `workspace/...` asset URL.
 * @param request - Target `fileId` or `workspacePath`, owning `widgetId`, and `purpose` (`preview` | `download`).
 * @returns Resolved relative HTTP URL served by `BlueprintService`.
 */
@Remote('createFileResourceUrl') async createFileResourceUrl(request: { readonly widgetId?: string readonly fileId?: string readonly workspacePath?: string readonly purpose?: 'preview' | 'download' }): Promise<{ readonly url: string }>

/**
 * Read a managed `FileResourceRef` metadata entry by id (for tests and Automation runners).
 * @param fileId - Managed file identifier.
 * @returns Stored `BlueprintFileResourceRef`, or `undefined` when absent.
 */
getFileResource(fileId: string): BlueprintFileResourceRef | undefined

/**
 * List all Canvas dashboards ordered by most recent update.
 * @returns Stored Canvas records.
 */
listCanvases(): BlueprintCanvasRecord[]

/**
 * Read one Canvas dashboard by id.
 * @param id - Canvas identifier.
 * @returns Canvas record.
 */
getCanvas(id: string): BlueprintCanvasRecord

/**
 * Create a new Canvas (`看板`) dashboard.
 * @param input - Canvas title, optional description, and layout mode (`grid` default).
 * @returns Created Canvas record.
 */
@Remote('createCanvas') async createCanvas(input: CreateCanvasInput): Promise<BlueprintCanvasRecord>

/**
 * Update Canvas metadata or layout mode (`grid` | `free`).
 * @param input - Canvas update fields.
 * @returns Updated Canvas record.
 */
@Remote('updateCanvas') async updateCanvas(input: UpdateCanvasInput): Promise<BlueprintCanvasRecord>

/**
 * Place a Widget onto a Canvas dashboard (auto-packing onto the 12-column grid when `rect` is omitted).
 * @param input - Placement specification.
 * @returns Updated Canvas record.
 */
@Remote('placeWidget') async placeWidget(input: PlaceWidgetInput): Promise<BlueprintCanvasRecord>

/**
 * Resize or reposition an existing Widget tile on a Canvas dashboard.
 * @param input - Placement update payload.
 * @returns Updated Canvas record.
 */
@Remote('updatePlacement') async updatePlacement(input: UpdatePlacementInput): Promise<BlueprintCanvasRecord>

/**
 * Remove a Widget tile from a Canvas dashboard without deleting the Widget itself.
 * @param request - Canvas id and placement/widget id.
 * @returns Updated Canvas record.
 */
@Remote('removePlacement') async removePlacement(request: { readonly canvasId: string; readonly placementId: string }): Promise<BlueprintCanvasRecord>

/**
 * Auto-pack all Widget tiles on a Canvas into compact non-overlapping 12-column rows (`自动排列`).
 * @param canvasId - Target Canvas identifier.
 * @returns Repacked Canvas record.
 */
@Remote('arrangeCanvas') async arrangeCanvas(canvasId: string): Promise<BlueprintCanvasRecord>

/**
 * Persist Canvas zoom and pan viewport state.
 * @param request - Canvas id and viewport values.
 * @returns Updated Canvas record.
 */
@Remote('setCanvasViewState') async setCanvasViewState( request: { readonly canvasId: string; readonly viewState: BlueprintCanvasViewState }, ): Promise<BlueprintCanvasRecord>

/**
 * Delete a Canvas dashboard while keeping its underlying Widgets intact.
 * @param id - Canvas identifier.
 * @returns Deletion flag indicating whether the Canvas existed.
 */
@Remote('deleteCanvas') async deleteCanvas(id: string): Promise<{ readonly deleted: boolean }>

/**
 * List all Binding edges.
 * @returns Stored Binding records.
 */
listBindings(): BlueprintBindingRecord[]

/**
 * Read one Binding edge by id.
 * @param id - Binding identifier.
 * @returns Binding record.
 */
getBinding(id: string): BlueprintBindingRecord

/**
 * Create and schema-validate a Binding edge between an Automation and a Widget.
 * @param input - Binding endpoints (`automation.result -> widget.slot:main` or `widget.event:submit -> automation.input`).
 * @returns Created Binding record and compatibility diagnostics.
 */
async createBinding( input: CreateBindingInput, ): Promise<{ readonly binding: BlueprintBindingRecord; readonly validation: BlueprintValidationResult }>

/**
 * Validate an existing Binding edge against current Widget and Automation schemas.
 * @param id - Binding identifier.
 * @returns Compatibility diagnostics.
 */
validateBinding(id: string): BlueprintValidationResult

/**
 * Delete a Binding edge.
 * @param id - Binding identifier.
 */
async deleteBinding(id: string): Promise<void>

/**
 * List all Automations ordered by most recent update.
 * @returns Stored Automation records.
 */
listAutomations(): BlueprintAutomationRecord[]

/**
 * Read one Automation by id.
 * @param id - Automation identifier.
 * @returns Automation record.
 */
getAutomation(id: string): BlueprintAutomationRecord

/**
 * Create an Automation (**disabled by default** unless `enabled: true` is explicitly passed).
 * @param input - Automation creation payload.
 * @returns Stored Automation record.
 */
async createAutomation(input: CreateAutomationInput): Promise<BlueprintAutomationRecord>

/**
 * Update an existing Automation's trigger, code/prompt, or schemas.
 * @param input - Automation update fields.
 * @returns Updated Automation record.
 */
async updateAutomation(input: UpdateAutomationInput): Promise<BlueprintAutomationRecord>

/**
 * Enable or disable an Automation from the Task Card or Task Center UI.
 * @param request - Automation id and desired enabled flag.
 * @returns Updated Automation record.
 */
@Remote('setAutomationEnabled') async setAutomationEnabled(request: { readonly id: string; readonly enabled: boolean }): Promise<BlueprintAutomationRecord>

/**
 * Preview which Bindings and Widgets depend on an Automation before deletion.
 * @param id - Automation identifier.
 * @returns Attached Binding ids and Widget ids.
 */
previewDeleteAutomation(id: string): { readonly bindingIds: readonly string[]; readonly widgetIds: readonly string[] }

/**
 * Delete an Automation, its workspace directory, and attached Bindings.
 * @param id - Automation identifier.
 * @returns Deletion flag indicating whether the Automation existed.
 */
@Remote('deleteAutomation') async deleteAutomation(id: string): Promise<{ readonly deleted: boolean }>

/**
 * List recent runs for one Automation (or all Automations when `automationId` is omitted).
 * @param automationId - Optional Automation id filter.
 * @returns Run records ordered newest first.
 */
@Remote('listRuns') listRuns(automationId?: string): Promise<readonly BlueprintAutomationRun[]>

/**
 * Read one Automation run record by id.
 * @param runId - Run identifier.
 * @returns Run record.
 */
getRun(runId: string): BlueprintAutomationRun

/**
 * Cancel an in-flight Automation run.
 * @param runId - Run identifier.
 * @returns Updated run record.
 */
cancelRun(runId: string): BlueprintAutomationRun

/**
 * Execute an Automation immediately (`Run now` / manual trigger / scheduled tick / widget event)
 * and push its validated output artifact across all active `automation -> widget` Bindings.
 * @param request - Automation id, optional input payload, and trigger origin.
 * @returns Settled Automation run record.
 */
@Remote('runAutomation') async runAutomation(request: { readonly id: string readonly input?: JsonValue readonly triggeredBy?: 'manual' | 'schedule' | 'widget_event' }): Promise<BlueprintAutomationRun>
```

Source: [`packages/extensions/blueprint/src/index.ts`](../../packages/extensions/blueprint/src/index.ts)

<a id="ctxcordisinspect--cordisinspectregistryservice"></a>

### `ctx.cordisInspect` — `CordisInspectRegistryService`

Registry and cross-page router behind the model-facing inspection tool.

```ts cordis-catalog
/**
 * Register one Host provider.
 * @param registration - manifest and local query handler.
 * @returns idempotent disposer.
 */
register(registration: HostCordisInspectProviderRegistration): () => void

/**
 * Replace the mirrored Client provider directory.
 * @param providers - complete Client manifest snapshot.
 */
syncClientManifest(providers: readonly CordisInspectProviderManifest[]): void

/**
 * Return the complete known Host and Client provider directory.
 * @returns Host providers followed by the Client providers.
 */
list(): CordisInspectProviderView[]

/**
 * Execute one provider query on its owning platform.
 * @param platform - Host or Client runtime.
 * @param providerId - provider selected from {@link list}.
 * @param methodName - declared method name.
 * @param input - optional lossless JSON input.
 * @param agent - requesting Agent and scope.
 * @param signal - tool-call cancellation.
 * @returns provider JSON data; Client queries fail fast when Gateway has no live Client
 * and retain only the first observed failure diagnostic for timeout reporting.
 * @throws {InspectError} for an unknown provider or method, invalid input or output, a missing
 *   Client, a Client timeout, or a Host provider failure without its own `HarnessError`; cancellation
 *   rethrows the signal's reason.
 */
async query( platform: CordisInspectPlatform, providerId: string, methodName: string, input: JsonValue | undefined, agent: Agent, signal: AbortSignal, ): Promise<JsonValue>

/**
 * Accept the first valid Client response for a pending query.
 * @param sessionId - Session identity recorded by the pending query, including subagent Sessions.
 * @param requestId - Pending Client query identity.
 * @param resolution - Client provider result or failure.
 * @returns acknowledgement with accepted true only for a success that settles the query; only the first failure diagnostic is retained.
 */
resolveClientQuery( sessionId: SessionId, requestId: CordisInspectRequestId, resolution: CordisInspectQueryResolution, ): CordisInspectResolveAck
```

Types: [Agent](core.md) · [SessionId](core.md)

Source: [`packages/extensions/cordis-host-runner/src/inspect-registry.ts`](../../packages/extensions/cordis-host-runner/src/inspect-registry.ts)

<a id="ctxdynamiccordisrunner--dynamiccordisrunnerservice"></a>

### `ctx.dynamicCordisRunner` — `DynamicCordisRunnerService`

Dynamic Plugin registry and Host-half lifecycle.

```ts cordis-catalog
/**
 * Define a new Plugin's first Package or append a Package to an existing Plugin.
 * @param request - Session ownership, Plugin selection, metadata, and source code.
 * @returns Host-minted Plugin and Package identities with declared-half metadata.
 */
define(request: DynamicCordisDefineRequest): DynamicCordisDefineReceipt

/**
 * Remove a Plugin, its active run, and all immutable Packages.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to remove.
 * @returns Whether removal succeeded and whether it stopped an active run.
 */
async undefine(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisUndefineReceipt>

/**
 * Remove a Plugin from the user panel and queue the resulting state change for the model's next step.
 * @param agent - Agent whose Session owns the Plugin and receives the context.
 * @param pluginId - Stable Plugin identity to remove.
 * @returns Whether removal succeeded and whether it stopped an active run.
 */
@Remote('undefineFromPanel') async undefineFromPanel(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisUndefineReceipt>

/**
 * Start or update one Package for a model tool call. An unauthorized Client
 * Package waits for approval; Plugin-wide authorization covers later versions.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to activate.
 * @param packageId - Immutable Package version to activate.
 * @param mode - Whether to run the current version or switch versions.
 * @param signal - Tool-call cancellation signal while the activation request is being created.
 * @returns The successful activation identity or an actionable refusal.
 */
async run( agent: Agent, pluginId: CordisDynamicPluginId, packageId: CordisDynamicPackageId, mode: CordisDynamicRunMode, signal?: AbortSignal, ): Promise<DynamicCordisRunResponse>

/**
 * Start Host code for an approved request or a direct panel gesture.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to activate.
 * @param packageId - Immutable Package version to activate.
 * @param mode - Whether to run the current version or switch versions.
 * @param requestId - Model-driven request identity, or null for a direct user gesture.
 * @param approveFutureVersions - Whether this approval covers later Packages of the same Plugin.
 * @returns The exact Host activation or a failure message.
 */
@Remote('runHostHalf') async runHostHalf( agent: Agent, pluginId: CordisDynamicPluginId, packageId: CordisDynamicPackageId, mode: CordisDynamicRunMode, requestId: ApprovalRequestId | null, approveFutureVersions: boolean, ): Promise<DynamicCordisHostHalfResult>

/**
 * Fetch Client code for the exact active run.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to read.
 * @param pluginRunId - Exact active run authorized to receive source.
 * @returns Client source and its Plugin, Package, and run identities.
 */
@Remote('getClientCode') getClientCode( agent: Agent, pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, ): DynamicCordisClientSource

/**
 * Resolve one model-driven Client activation request.
 * @param requestId - Request identity to settle once.
 * @param resolution - Browser refusal or exact Client activation result.
 * @returns Whether the still-pending request accepted this resolution.
 */
@Remote('resolveRequestRun') async resolveRequestRun( requestId: ApprovalRequestId, resolution: DynamicCordisRunResolution, ): Promise<DynamicCordisResolveAck>

/**
 * Settle a direct panel run after this page loaded or failed its Client half.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity being settled.
 * @param resolution - Exact Client activation result from the acting page.
 * @returns The committed activation or its failure.
 */
@Remote('settleUserRun') async settleUserRun( agent: Agent, pluginId: CordisDynamicPluginId, resolution: DynamicCordisRunResolution, ): Promise<DynamicCordisRunResponse>

/**
 * Stop the active run while retaining every Package version.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to stop.
 * @returns Success or the reason no run was stopped.
 */
async stop(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisStopResponse>

/**
 * Stop a Plugin from the user panel and queue the resulting state change for the model's next step.
 * @param agent - Agent whose Session owns the Plugin and receives the context.
 * @param pluginId - Stable Plugin identity to stop.
 * @returns Success or the reason no run was stopped.
 */
@Remote('stopFromPanel') async stopFromPanel(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisStopResponse>

/**
 * Replace the Host mirror of the Client inspect provider directory.
 * @param providers - complete Client provider manifest.
 * @returns null after accepting the manifest.
 */
@Remote('syncInspectManifest') syncInspectManifest(providers: readonly CordisInspectProviderManifest[]): null

/**
 * Submit a Client inspect result or failure for a pending query.
 * @param agentId - Session identity that owns the pending query; answering does not resolve or resume an Agent.
 * @param requestId - exact pending query identity.
 * @param resolution - provider result or structured refusal.
 * @returns acknowledgement with accepted true only for a valid success that settles the query;
 * pending-query failures return { accepted: false } and retain only the first diagnostic.
 */
@Remote({ name: 'resolveInspectQuery', resources: { session: agentId => agentId } }) resolveInspectQuery( agentId: SessionId, requestId: CordisInspectRequestId, resolution: CordisInspectQueryResolution, ): CordisInspectResolveAck

/**
 * Frame-wide inventory, grouped as one row per stable Plugin.
 * @returns Source-free metadata for every process-local Plugin.
 */
@Remote('inventory') inventory(): DynamicCordisInventoryRow[]

/**
 * Read one Session's Host-rich state for inspection and result rendering.
 * @param agent - Agent whose Session selects visible Plugins.
 * @returns Plugin versions, active runs, Host fibers, and render failures.
 */
snapshot(agent: Agent): DynamicCordisSnapshotRow[]

/**
 * Read source-free context for an explicit `@pluginId` user gesture.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity referenced by the user.
 * @returns The preferred modification base, or undefined when unavailable.
 */
reference(agent: Agent, pluginId: CordisDynamicPluginId): DynamicCordisReference | undefined

/**
 * List source-free Plugin summaries owned by one Session.
 * @param agent - Agent whose Session selects visible Plugins.
 * @returns one summary per Plugin in creation order.
 */
listPlugins(agent: Agent): DynamicCordisPluginInspection[]

/**
 * Inspect one Plugin without returning Package source.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - stable Plugin identity.
 * @returns version pointers, latest run, and all Package summaries.
 */
inspectPlugin(agent: Agent, pluginId: CordisDynamicPluginId): DynamicCordisPluginInspection

/**
 * Read one exact immutable Package and its Host and Client source.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity that owns the Package.
 * @param packageId - Exact immutable Package identity to inspect.
 * @returns Package metadata, source, and the Plugin's lifecycle pointers.
 */
inspectPackage( agent: Agent, pluginId: CordisDynamicPluginId, packageId: CordisDynamicPackageId, ): DynamicCordisPackageInspection

/**
 * Record a post-load render failure for the exact active run.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity that rendered.
 * @param pluginRunId - Exact active run that produced the failure.
 * @param failure - Slot, message, and entry-retirement result.
 * @returns Null after recording or ignoring a stale report.
 */
@Remote('reportRenderFailure') async reportRenderFailure( agent: Agent, pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, failure: DynamicCordisRenderFailure, ): Promise<null>

/**
 * Report a Client guard rejection that happened after the Package completed activation.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity whose Client code was rejected.
 * @param pluginRunId - Exact active run that produced the rejection.
 * @param failure - Original guard message and stack.
 * @returns Null after reporting or ignoring a stale/startup failure.
 */
@Remote('reportClientGuardFailure') async reportClientGuardFailure( agent: Agent, pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, failure: CordisErrorDetails, ): Promise<null>

/**
 * Invoke an active Host method while rejecting stale Client runs.
 * @param pluginId - Stable Plugin identity that owns the method.
 * @param pluginRunId - Exact active run authorizing the call.
 * @param method - Registered Host handler name.
 * @param args - JSON argument delivered to the handler.
 * @returns The JSON result or a typed invocation failure.
 */
@Remote('invoke') async invoke( pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, method: string, args: JsonValue, ): Promise<DynamicCordisInvokeResult>
```

Types: [Agent](core.md) · [SessionId](core.md)

Source: [`packages/extensions/cordis-host-runner/src/index.ts`](../../packages/extensions/cordis-host-runner/src/index.ts)

<a id="ctxinspector--inspectorservice"></a>

### `ctx.inspector` — `InspectorService`

Shared Host/Client service façade over the realm's source publisher.

```ts cordis-catalog
/**
 * Publish one JSON observation without waiting for Worker delivery.
 * @param topic - Domain-owned topic name.
 * @param payload - JSON value validated before it reaches the carrier.
 * @param monotonicMs - Source-clock timestamp; defaults to `performance.now()`.
 */
publish(topic: string, payload: InspectorJsonValue, monotonicMs?: number): void
```

Source: [`packages/experimental/inspector/src/index.ts`](../../packages/experimental/inspector/src/index.ts)

<a id="blueprint-events"></a>

### `blueprint/*` events

<a id="blueprintchanged--emit"></a>

#### `blueprint/changed` — emit

Emitted whenever any Blueprint Widget, Canvas, Automation, or Binding record changes.

```ts cordis-catalog
/**
 * Emitted whenever any Blueprint Widget, Canvas, Automation, or Binding record changes.
 * @param revision - Monotonic catalog revision counter.
 * @mode emit
 */
'blueprint/changed'(revision: number): void
```

Source: [`packages/extensions/blueprint/src/types.ts`](../../packages/extensions/blueprint/src/types.ts)

<a id="cordis-events"></a>

### `cordis/*` events

<a id="cordisdynamic-package--emit"></a>

#### `cordis/dynamic-package` — emit

One exact Plugin/Package activation is now live in the Host.

```ts cordis-catalog
/**
 * One exact Plugin/Package activation is now live in the Host.
 * @param pkg - stable plugin, immutable package, run identity, and label.
 * @mode emit
 */
'cordis/dynamic-package'(pkg: DynamicCordisPackage): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisdynamic-retract--emit"></a>

#### `cordis/dynamic-retract` — emit

One exact activation was withdrawn.

```ts cordis-catalog
/**
 * One exact activation was withdrawn.
 * @param retracted - plugin, package, and run identity.
 * @mode emit
 */
'cordis/dynamic-retract'(retracted: DynamicCordisRetracted): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisinspect-query--emit"></a>

#### `cordis/inspect-query` — emit

Request a live read-only query from the Client inspect registry.

```ts cordis-catalog
/**
 * Request a live read-only query from the Client inspect registry.
 * @param request - correlation, Session, provider, method, and JSON input.
 * @mode emit
 */
'cordis/inspect-query'(request: CordisInspectQueryRequest): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisinspect-query-resolved--emit"></a>

#### `cordis/inspect-query-resolved` — emit

Notify every Client that an inspect query has settled or been cancelled.

```ts cordis-catalog
/**
 * Notify every Client that an inspect query has settled or been cancelled.
 * @param resolved - exact query identity that is no longer answerable.
 * @mode emit
 */
'cordis/inspect-query-resolved'(resolved: CordisInspectQueryResolved): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisrequest-run--emit"></a>

#### `cordis/request-run` — emit

A Client-bearing activation needs a browser page, and may require a user decision.

```ts cordis-catalog
/**
 * A Client-bearing activation needs a browser page, and may require a user decision.
 * @param request - correlation identity, owner, target version, mode, and approval requirement.
 * @mode emit
 */
'cordis/request-run'(request: DynamicCordisRunRequest): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisrequest-run-resolved--emit"></a>

#### `cordis/request-run-resolved` — emit

A pending Client activation request left the answerable state.

```ts cordis-catalog
/**
 * A pending Client activation request left the answerable state.
 * @param resolved - request identity and outcome.
 * @mode emit
 */
'cordis/request-run-resolved'(resolved: DynamicCordisRequestResolved): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)
<!-- END GENERATED cordis-surface -->
