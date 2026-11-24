import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import BlueprintService from '../src/index.ts'
import { matchesCronMinute } from '../src/validation.ts'

describe('@deepseek-ai/dsh-blueprint', () => {
  const tempDirs: string[] = []

  function makeTempRoot(): string {
    const dir = join(tmpdir(), `dsh-blueprint-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(dir, { recursive: true })
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates, validates, binds, places Widgets on 12-column Canvases, and runs disabled-by-default Automations', async () => {
    const root = makeTempRoot()
    const ctx = new Context()
    await ctx.plugin(BlueprintService, { root, schedulerTickMs: 0 })

    const widget = await ctx.blueprint.createWidget({
      id: 'nvda-card',
      title: 'NVDA Metric Explorer',
      html: '<div class="kp-root"><h2 id="v">0</h2><script>window.DaimonWidget.onSlot("main", d => { document.getElementById("v").textContent = String(d.price); });</script></div>',
      slots: {
        main: {
          schema: {
            type: 'object',
            required: ['price'],
            properties: {
              price: { type: 'number' },
            },
          },
        },
      },
      events: {
        submit: {
          schema: {
            type: 'object',
            required: ['symbol'],
            properties: {
              symbol: { type: 'string' },
            },
          },
        },
      },
    })

    expect(widget.assembledHtml).toContain('data-kimi-perspective')
    expect(widget.assembledHtml).toContain('--kimi-color-text-primary')
    expect(widget.assembledHtml).toContain('--kimi-chart-1')
    expect(widget.assembledHtml).toContain('onDataChange')
    expect(widget.assembledHtml).toContain('window.DaimonWidget')
    expect(widget.assembledHtml).toContain('files-call')
    expect((await ctx.blueprint.validateWidget('nvda-card')).valid).toBe(true)

    const auto = await ctx.blueprint.createAutomation({
      id: 'price-feed',
      title: 'Refresh NVDA snapshot',
      trigger: { kind: 'schedule', cron: '0 9 * * 1-5' },
      execution: {
        type: 'agent',
        prompt: 'Summarize NVDA metrics',
      },
      resultSchema: {
        type: 'object',
        required: ['price'],
        properties: {
          price: { type: 'number' },
          prompt: { type: 'string' },
        },
      },
    })
    expect(auto.enabled).toBe(false)

    const badAuto = await ctx.blueprint.createAutomation({
      id: 'bad-feed',
      title: 'Mismatched schema task',
      execution: { type: 'agent', prompt: 'noop' },
      resultSchema: {
        type: 'object',
        properties: { wrongKey: { type: 'string' } },
      },
    })
    await expect(ctx.blueprint.createBinding({
      source: { kind: 'automation', id: badAuto.id, port: 'result' },
      target: { kind: 'widget', id: widget.id, port: 'slot:main' },
    })).rejects.toThrow(/price/)

    const { binding } = await ctx.blueprint.createBinding({
      id: 'feed-to-card',
      source: { kind: 'automation', id: auto.id, port: 'result' },
      target: { kind: 'widget', id: widget.id, port: 'slot:main' },
    })
    expect(ctx.blueprint.validateBinding(binding.id).valid).toBe(true)

    const canvas = await ctx.blueprint.createCanvas({
      id: 'market-board',
      title: '市场监控看板',
    })
    const withTile = await ctx.blueprint.placeWidget({
      canvasId: canvas.id,
      widgetId: widget.id,
      rect: { x: 0, y: 0, w: 6, h: 8 },
    })
    expect(withTile.placements).toHaveLength(1)
    expect(withTile.placements[0]?.rect).toEqual({ x: 0, y: 0, w: 6, h: 8 })

    const widget2 = await ctx.blueprint.createWidget({
      id: 'peer-card',
      title: 'Peer Comparison',
      html: '<div class="kp-root">Peers</div>',
    })
    const withTwo = await ctx.blueprint.placeWidget({
      canvasId: canvas.id,
      widgetId: widget2.id,
      rect: { w: 6, h: 8 },
    })
    expect(withTwo.placements.find(p => p.widgetId === widget2.id)?.rect).toEqual({ x: 6, y: 0, w: 6, h: 8 })

    await expect(ctx.blueprint.updatePlacement({
      canvasId: canvas.id,
      placementId: widget2.id,
      rect: { x: 2, y: 0, w: 6, h: 8 },
    })).rejects.toThrow(/overlaps/)

    const reflowed = await ctx.blueprint.updatePlacement({
      canvasId: canvas.id,
      placementId: widget2.id,
      rect: { w: 12, h: 48 },
      heightMode: 'fixed',
      pixelHeight: 920,
      reflow: true,
    })
    const updatedPeer = reflowed.placements.find(p => p.widgetId === widget2.id)
    const pushedFirst = reflowed.placements.find(p => p.widgetId === widget.id)
    expect(updatedPeer?.rect).toEqual({ x: 0, y: 0, w: 12, h: 48 })
    expect(updatedPeer?.heightMode).toBe('fixed')
    expect(updatedPeer?.pixelHeight).toBe(920)
    expect(pushedFirst?.rect).toEqual({ x: 0, y: 48, w: 6, h: 8 })

    const resetAuto = await ctx.blueprint.updatePlacement({
      canvasId: canvas.id,
      placementId: widget2.id,
      heightMode: 'auto',
      reflow: true,
    })
    expect(resetAuto.placements.find(p => p.widgetId === widget2.id)?.heightMode).toBe('auto')
    expect(resetAuto.placements.find(p => p.widgetId === widget2.id)?.pixelHeight).toBeUndefined()

    expect(matchesCronMinute('30 9 * * 1-5', new Date('2026-11-24T09:30:00'))).toBe(true)
    expect(matchesCronMinute('30 9 * * 1-5', new Date('2026-11-24T09:31:00'))).toBe(false)

    await ctx.fiber.dispose()
  })

  it('stores, reads, sandboxes workspace paths, and mints capability URLs for DaimonWidget.files', async () => {
    const root = makeTempRoot()
    const ctx = new Context()
    await ctx.plugin(BlueprintService, { root, schedulerTickMs: 0 })

    const widget = await ctx.blueprint.createWidget({
      id: 'csv-workbench',
      title: 'CSV 数据工作台',
      html: '<div class="kp-root">CSV</div>',
    })

    const csvRef = await ctx.blueprint.writeManagedFile({
      name: 'metrics.csv',
      mimeType: 'text/csv',
      encoding: 'utf8',
      data: 'model,cost\ngpt-5.6-luna,1.25\n',
      source: 'widget-output',
    })
    expect(csvRef.kind).toBe('file')
    expect(csvRef.name).toBe('metrics.csv')
    expect(csvRef.sizeBytes).toBe(29)
    expect(csvRef.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(ctx.blueprint.getFileResource(csvRef.fileId)?.name).toBe('metrics.csv')

    const readTxt = await ctx.blueprint.readFileText({ fileId: csvRef.fileId })
    expect(readTxt.text).toContain('gpt-5.6-luna,1.25')

    await expect(ctx.blueprint.readFileText({
      fileId: csvRef.fileId,
      maxBytes: 10,
    })).rejects.toMatchObject({ details: { reasonCode: 'file_too_large' } })

    const readBin = await ctx.blueprint.readFileBytes({ fileId: csvRef.fileId })
    expect(Buffer.from(readBin.data, 'base64').toString('utf8')).toBe('model,cost\ngpt-5.6-luna,1.25\n')

    const previewUrl = await ctx.blueprint.createFileResourceUrl({
      fileId: csvRef.fileId,
      purpose: 'preview',
    })
    expect(previewUrl.url).toMatch(/^\/blueprint\/resources\/blob\/file-[^?]+\?token=[A-Za-z0-9_-]+$/)

    const binRef = await ctx.blueprint.writeManagedFile({
      name: 'archive.bin',
      mimeType: 'application/octet-stream',
      encoding: 'base64',
      data: Buffer.from([0xde, 0xad, 0xbe, 0xef]).toString('base64'),
    })
    await expect(ctx.blueprint.createFileResourceUrl({
      fileId: binRef.fileId,
      purpose: 'preview',
    })).rejects.toMatchObject({ details: { reasonCode: 'unsupported_mime_type' } })

    const downloadUrl = await ctx.blueprint.createFileResourceUrl({
      fileId: binRef.fileId,
      purpose: 'download',
    })
    expect(downloadUrl.url).toContain('download=1')

    await expect(ctx.blueprint.writeWidgetWorkspaceText({
      widgetId: widget.id,
      path: 'index.html',
      contents: 'forbidden',
    })).rejects.toMatchObject({ details: { reasonCode: 'permission_denied' } })

    const writtenWs = await ctx.blueprint.writeWidgetWorkspaceText({
      widgetId: widget.id,
      path: 'workspace/notes/summary.json',
      contents: '{"ok":true}',
    })
    expect(writtenWs.path).toBe('workspace/notes/summary.json')
    expect(writtenWs.url).toBe('/blueprint/widgets/csv-workbench/workspace/notes/summary.json')

    const wsText = await ctx.blueprint.readFileText({
      widgetId: widget.id,
      workspacePath: 'workspace/notes/summary.json',
    })
    expect(wsText.text).toBe('{"ok":true}')

    await ctx.fiber.dispose()
  })
})
