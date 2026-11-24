import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import BlueprintService from '@deepseek-ai/dsh-blueprint'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { afterEach, describe, expect, it } from 'vitest'
import * as ToolBlueprint from '../src/index.ts'
import { BLUEPRINT_TOOL_NAMES } from '../src/names.ts'

describe('@deepseek-ai/dsh-tool-blueprint', () => {
  const tempDirs: string[] = []

  function makeTempRoot(): string {
    const dir = join(tmpdir(), `dsh-tool-blueprint-${String(Date.now())}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('registers all 6 Blueprint tools and executes end-to-end Widget, Canvas, Automation, and Binding flows', async () => {
    const root = makeTempRoot()
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.tools.setExecutor(new NativeToolExecutor(ctx))
    await ctx.plugin(BlueprintService, { root, schedulerTickMs: 0 })
    await ctx.plugin(ToolBlueprint)

    const signal = new AbortController().signal
    const names = ctx.tools.schemas().map(s => s.name).sort()
    expect(names).toEqual([...BLUEPRINT_TOOL_NAMES].sort())

    const created = await executeToolFixture(ctx, {
      callId: brandString<ToolCallId>('c-create'),
      name: 'Widget',
      signal,
      arguments: {
        action: 'create',
        id: 'calc-widget',
        title: 'ROI Calculator',
        html: '<div class="kp-root"><span id="out">42</span></div>',
        slots_json: JSON.stringify({ main: { schema: { type: 'object', required: ['roi'], properties: { roi: { type: 'number' } } } } }),
      },
    })
    expect(created.isError).toBe(false)

    const validated = await executeToolFixture(ctx, {
      callId: brandString<ToolCallId>('c-validate'),
      name: 'Widget',
      signal,
      arguments: {
        action: 'validate',
        id: 'calc-widget',
      },
    })
    expect(validated.isError).toBe(false)

    const shown = await executeToolFixture(ctx, {
      callId: brandString<ToolCallId>('c-show'),
      name: 'Widget',
      signal,
      arguments: {
        action: 'show',
        id: 'calc-widget',
      },
    })
    expect(shown.isError).toBe(false)
    expect(shown.meta).toMatchObject({
      kind: 'widget',
      action: 'show',
      widgetId: 'calc-widget',
      title: 'ROI Calculator',
    })

    await executeToolFixture(ctx, {
      callId: brandString<ToolCallId>('c-canvas'),
      name: 'Canvas',
      signal,
      arguments: {
        action: 'create',
        id: 'exec-board',
        title: '高管决策看板 {{Q4}}',
      },
    })
    const assembled = await ctx.systemPrompt.assemble()
    const canvasCtx = assembled.contexts.find(part => part.name === 'blueprint:canvases')
    expect(canvasCtx?.interpolate).toBe(false)
    expect(canvasCtx?.text).toContain('高管决策看板 {{Q4}}')
    const placed = await executeToolFixture(ctx, {
      callId: brandString<ToolCallId>('c-place'),
      name: 'Canvas',
      signal,
      arguments: {
        action: 'place_widget',
        id: 'exec-board',
        widget_id: 'calc-widget',
        w: 6,
        h: 8,
      },
    })
    expect(placed.isError).toBe(false)
    expect(placed.meta).toMatchObject({
      kind: 'canvas',
      action: 'place_widget',
      canvasId: 'exec-board',
      widgetCount: 1,
    })

    const createdAuto = await executeToolFixture(ctx, {
      callId: brandString<ToolCallId>('c-auto'),
      name: 'AutomationCreate',
      signal,
      arguments: {
        id: 'roi-task',
        title: '每日计算 ROI',
        trigger_kind: 'schedule',
        cron: '0 9 * * *',
        execution_type: 'agent',
        prompt: 'Compute ROI',
        result_schema_json: JSON.stringify({ type: 'object', required: ['roi'], properties: { roi: { type: 'number' } } }),
      },
    })
    expect(createdAuto.isError).toBe(false)
    expect(createdAuto.meta).toMatchObject({
      kind: 'automation',
      action: 'create',
      automationId: 'roi-task',
      enabled: false,
    })

    const bound = await executeToolFixture(ctx, {
      callId: brandString<ToolCallId>('c-bind'),
      name: 'Binding',
      signal,
      arguments: {
        action: 'create',
        id: 'roi-edge',
        source_kind: 'automation',
        source_id: 'roi-task',
        source_port: 'result',
        target_kind: 'widget',
        target_id: 'calc-widget',
        target_port: 'slot:main',
      },
    })
    expect(bound.isError).toBe(false)

    await ctx.fiber.dispose()
  })
})
