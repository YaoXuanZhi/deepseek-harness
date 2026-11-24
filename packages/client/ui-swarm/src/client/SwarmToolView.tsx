import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { } from '@deepseek-ai/dsh-client-ui-session-status/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SubagentAddress, SubagentCatalogEntry } from '@deepseek-ai/dsh-subagent/client'
import type { SubagentBusyKind, SwarmChildMode, SwarmChildOutcome } from '@deepseek-ai/dsh-swarm-mode/client'
import type { SwarmBatchInjected } from './index.ts'
import type { SwarmLocaleKey } from './locales.ts'
import { selectSwarmTurnBatches, type SwarmTurnChildItem } from './turn-swarm.ts'
import css from './SwarmToolView.module.css'

/** Composed props for the `agent_swarm` Parallel Assistant Matrix card. */
export type SwarmToolViewProps =
  PropsRuntime<'tool.call.toolview'> & InjectFace<SwarmBatchInjected> & PropsLocale<'swarm'>

/** Composed props for persistent Turn-tail `agent_swarm` matrix cards. */
export type SwarmTurnTailProps =
  PropsRuntime<'conversation.chat.turnTail'> & InjectFace<SwarmBatchInjected> & PropsLocale<'swarm'>

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function isChildMode(value: unknown): value is SwarmChildMode {
  return value === 'spawn' || value === 'fork' || value === 'resume'
}

function isChildOutcome(value: unknown): value is SwarmChildOutcome {
  return value === 'completed' || value === 'failed' || value === 'aborted'
}

function presetLabelKey(preset: string): SwarmLocaleKey {
  switch (preset) {
    case 'coder':
      return 'card.preset.coder'
    case 'explore':
      return 'card.preset.explore'
    case 'plan':
      return 'card.preset.plan'
    case 'fork':
      return 'card.preset.fork'
    case 'resume':
      return 'card.preset.resume'
    default:
      return 'card.preset.default'
  }
}

function busyLabelKey(busyKind: SubagentBusyKind): SwarmLocaleKey {
  switch (busyKind) {
    case 'thinking':
      return 'card.busy.thinking'
    case 'search':
      return 'card.busy.search'
    case 'read':
      return 'card.busy.read'
    case 'write':
      return 'card.busy.write'
    case 'run':
      return 'card.busy.run'
    case 'browse':
      return 'card.busy.browse'
    case 'analyze':
      return 'card.busy.analyze'
    case 'work':
      return 'card.busy.work'
  }
}

interface SwarmBatchMatrixCardProps {
  readonly parentSessionId: SessionId
  readonly phase: SwarmToolViewProps['phase']
  readonly isError: boolean
  readonly description: string
  readonly parsedChildren: readonly SwarmTurnChildItem[]
  readonly useSessions: SwarmToolViewProps['useSessions']
  readonly useSessionStatus: SwarmToolViewProps['useSessionStatus']
  readonly openChildAside: SwarmBatchInjected['openChildAside']
  readonly ensureParentCatalog?: SwarmBatchInjected['ensureParentCatalog'] | undefined
  readonly t: SwarmToolViewProps['t']
}

function SwarmBatchMatrixCard({
  parentSessionId,
  phase,
  isError,
  description,
  parsedChildren,
  useSessions,
  useSessionStatus,
  openChildAside,
  ensureParentCatalog,
  t,
}: SwarmBatchMatrixCardProps): ReactNode {
  const catalogRaw = useSessions(state => state.projectionsBySession[parentSessionId]?.values.subagentCatalog)
  const summaries = useSessions(state => state.byId)
  const statusMap = useSessionStatus(table => table)

  const catalog = catalogRaw ?? []
  const catalogByName = new Map<string, SubagentCatalogEntry>()
  const catalogById = new Map<string, SubagentCatalogEntry>()
  for (const entry of catalog) {
    catalogById.set(String(entry.id), entry)
    if ('name' in entry) {
      catalogByName.set(entry.name, entry)
    }
  }

  const usedEntryIds = new Set<string>()
  const resolvedTiles = parsedChildren.map((child) => {
    let catalogEntry = child.childId !== undefined
      ? catalogById.get(child.childId)
      : undefined
    if (catalogEntry === undefined && child.name !== undefined) {
      catalogEntry = catalogByName.get(child.name)
    }
    if (catalogEntry === undefined) {
      const expectedLabel = `${description}: ${child.item}`.slice(0, 80)
      catalogEntry = catalog.find(entry => !usedEntryIds.has(entry.id) && (
        entry.label === expectedLabel
        || entry.label?.endsWith(`: ${child.item}`) === true
        || entry.label === child.item
      ))
    }
    if (catalogEntry !== undefined) {
      usedEntryIds.add(catalogEntry.id)
    }

    const resolvedSessionId: SessionId | undefined = catalogEntry?.id
      ?? (child.childId !== undefined ? brandString<SessionId>(child.childId) : undefined)
    const liveStatus = resolvedSessionId !== undefined ? statusMap.get(resolvedSessionId) : undefined
    const summaryRow = resolvedSessionId !== undefined ? summaries[resolvedSessionId] : undefined
    const activity = summaryRow?.projectionValues?.subagentActivity ?? null

    let tileState: 'starting' | 'running' | 'done' | 'error' | 'aborted' = phase === 'result' ? 'running' : 'starting'
    if (child.outcome === 'completed') {
      tileState = 'done'
    } else if (child.outcome === 'aborted') {
      tileState = 'aborted'
    } else if (child.outcome === 'failed' || (phase === 'result' && isError)) {
      tileState = 'error'
    } else if (resolvedSessionId !== undefined) {
      const hasBusyActivity = activity?.busyKind !== null && activity?.busyKind !== undefined
      const isRunning = (liveStatus?.running ?? summaryRow?.running) === true || hasBusyActivity
      if (isRunning) {
        tileState = 'running'
      } else if (liveStatus?.completionFailed === true) {
        tileState = 'error'
      } else if (
        liveStatus?.running === false
        || summaryRow?.projectionValues?.subagentTiming?.lastTurnCompleted === true
        || summaryRow?.running === false
      ) {
        tileState = 'done'
      }
    }

    const address: SubagentAddress | undefined = catalogEntry && catalogEntry.mode !== 'external'
      ? {
        parentSessionId,
        childSessionId: catalogEntry.id,
        mode: catalogEntry.mode,
      }
      : (resolvedSessionId !== undefined
        ? {
          parentSessionId,
          childSessionId: resolvedSessionId,
          mode: 'continuable',
        }
        : undefined)

    const resolvedName = child.name ?? (catalogEntry && 'name' in catalogEntry ? catalogEntry.name : undefined)
    const busyKind = tileState === 'running' ? (activity?.busyKind ?? null) : null
    const toolCount = activity?.toolCallCount ?? child.toolCallCount
    const summaryText = activity?.summary ?? child.summary

    return {
      ...child,
      ...(resolvedName === undefined ? {} : { name: resolvedName }),
      tileState,
      busyKind,
      toolCount,
      summaryText,
      address,
    }
  })

  const hasUnresolvedTile = resolvedTiles.some(tile => tile.address === undefined)
  useEffect(() => {
    if (catalogRaw === undefined) {
      ensureParentCatalog?.(parentSessionId)
    }
    if (phase !== 'result' && hasUnresolvedTile && ensureParentCatalog !== undefined) {
      ensureParentCatalog(parentSessionId, true)
      const timer = setInterval(() => {
        ensureParentCatalog(parentSessionId, true)
      }, 1_000)
      return () => {
        clearInterval(timer)
      }
    }
    return undefined
  }, [catalogRaw, ensureParentCatalog, hasUnresolvedTile, parentSessionId, phase])

  const doneCount = resolvedTiles.filter(tile => tile.tileState === 'done').length
  const anyStarted = resolvedTiles.some(tile => tile.tileState !== 'starting')
  const totalCount = resolvedTiles.length
  const progressText = totalCount === 0 || (phase !== 'result' && !anyStarted)
    ? t('card.creating')
    : t('card.progress', { done: String(doneCount), total: String(totalCount) })

  return (
    <div className={css.card}>
      <div className={css.header}>
        <div className={css.headerLeft}>
          <span className={css.headerGlyph} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3.2" r="2" stroke="currentColor" strokeWidth="1.35" />
              <circle cx="3.4" cy="12" r="2" stroke="currentColor" strokeWidth="1.35" />
              <circle cx="12.6" cy="12" r="2" stroke="currentColor" strokeWidth="1.35" />
              <path d="M6.9 4.9L4.5 10.2M9.1 4.9L11.5 10.2M5.4 12H10.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </span>
          <span className={css.title}>{description}</span>
        </div>
        <span className={css.progress}>{progressText}</span>
      </div>
      {resolvedTiles.length > 0 && (
        <div className={css.grid}>
          {resolvedTiles.map((tile, index) => {
            const statusLabel = tile.tileState === 'done'
              ? t('card.status.done')
              : tile.tileState === 'aborted'
                ? t('card.status.aborted')
                : tile.tileState === 'error'
                  ? t('card.status.error')
                  : tile.tileState === 'running'
                    ? (tile.busyKind !== null ? t(busyLabelKey(tile.busyKind)) : t('card.status.running'))
                    : t('card.status.starting')
            const tileAddress = tile.address
            const showRoleBadge = tile.role !== undefined && tile.role.trim() !== '' && tile.role !== tile.item
            const content = (
              <>
                <div className={css.tileTop}>
                  <span className={css.statusRow}>
                    <span
                      className={clsx(
                        css.dot,
                        tile.tileState === 'running' && css.dotRunning,
                        tile.tileState === 'done' && css.dotDone,
                        (tile.tileState === 'error' || tile.tileState === 'aborted') && css.dotError,
                      )}
                    />
                    <span className={css.statusText}>{statusLabel}</span>
                  </span>
                  <span className={css.badgeGroup}>
                    {showRoleBadge && <span className={css.roleBadge}>{tile.role}</span>}
                    <span className={css.presetBadge}>{t(presetLabelKey(tile.preset))}</span>
                  </span>
                </div>
                <div className={css.itemTitle}>{tile.role ?? tile.item}</div>
                {tile.summaryText !== undefined && tile.summaryText !== '' && (
                  <div className={css.summaryPreview}>{tile.summaryText}</div>
                )}
                {(tile.name !== undefined || (tile.toolCount !== undefined && tile.toolCount > 0)) && (
                  <div className={css.tileFooter}>
                    <span className={css.agentHandle}>{tile.name ?? ''}</span>
                    {tile.toolCount !== undefined && tile.toolCount > 0 && (
                      <span className={css.toolCount}>{t('card.tools', { tools: String(tile.toolCount) })}</span>
                    )}
                  </div>
                )}
              </>
            )
            const key = tile.name ?? `${tile.item}-${String(index)}`
            if (tileAddress !== undefined) {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { openChildAside(tileAddress) }}
                  aria-label={t('card.openAside', { name: tile.name ?? tile.role ?? tile.item })}
                  className={clsx(css.tile, css.tileInteractive)}
                >
                  {content}
                </button>
              )
            }
            return (
              <div key={key} className={css.tile}>
                {content}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Parallel Assistant Matrix Card for `agent_swarm` calls.
 * Connects child agent handles with `subagentCatalog`, live `useSessionStatus`,
 * and `subagentActivity` (`busyKind`, `toolCallCount`, `summary`) so users see
 * fine-grained real-time progress, inline role conclusion digests, and one-click
 * Right Sidebar transcripts.
 * @param props - Tool view runtime props, session status hooks, and localized copy.
 * @returns Parallel Assistant Matrix Card element.
 */
export function SwarmToolView(props: SwarmToolViewProps): ReactNode {
  const { sessionId: parentSessionId, phase, block, useSessions, useSessionStatus, openChildAside, t } = props
  const meta = phase === 'result' ? asRecord(block.meta) : undefined
  const argDesc = block.args.text('description')
  const argPreset = block.args.text('agent_preset') ?? block.args.text('subagent_type')
  const argFork = block.args.value('fork')
  const argItems = block.args.value('items')
  const argRoles = block.args.value('roles')
  const argResume = asRecord(block.args.value('resume_agent_ids'))

  const description = typeof meta?.description === 'string'
    ? meta.description
    : (argDesc !== undefined && argDesc.trim() !== ''
      ? argDesc
      : t('chip.label'))

  const fallbackPreset = typeof meta?.preset === 'string' && meta.preset !== 'roles'
    ? meta.preset
    : (argFork === true
      ? 'fork'
      : (argPreset ?? 'coder'))

  const parsedChildren: SwarmTurnChildItem[] = []
  if (Array.isArray(meta?.children)) {
    for (const entry of meta.children) {
      const rec = asRecord(entry)
      if (!rec || typeof rec.item !== 'string') continue
      parsedChildren.push({
        ...(typeof rec.name === 'string' ? { name: rec.name } : {}),
        ...(typeof rec.childId === 'string' ? { childId: rec.childId } : {}),
        item: rec.item,
        ...(typeof rec.role === 'string' ? { role: rec.role } : {}),
        preset: typeof rec.preset === 'string' ? rec.preset : fallbackPreset,
        ...(isChildMode(rec.mode) ? { mode: rec.mode } : {}),
        ...(isChildOutcome(rec.outcome) ? { outcome: rec.outcome } : {}),
        ...(typeof rec.summary === 'string' ? { summary: rec.summary } : {}),
        ...(typeof rec.toolCallCount === 'number' ? { toolCallCount: rec.toolCallCount } : {}),
      })
    }
  } else {
    if (Array.isArray(argItems)) {
      for (const rawItem of argItems) {
        if (typeof rawItem === 'string' && rawItem.trim() !== '') {
          parsedChildren.push({ item: rawItem.trim(), preset: fallbackPreset })
        }
      }
    }
    if (Array.isArray(argRoles)) {
      for (const rawRole of argRoles) {
        const rec = asRecord(rawRole)
        if (!rec || typeof rec.role !== 'string' || rec.role.trim() === '') continue
        const roleName = rec.role.trim()
        const rolePreset = argFork === true
          ? 'fork'
          : (typeof rec.preset === 'string' && rec.preset.trim() !== '' ? rec.preset.trim() : fallbackPreset)
        parsedChildren.push({
          item: roleName,
          role: roleName,
          preset: rolePreset,
        })
      }
    }
    if (argResume !== undefined) {
      for (const rawId of Object.keys(argResume)) {
        const agentId = rawId.trim()
        if (agentId !== '') {
          parsedChildren.push({
            name: agentId,
            item: agentId,
            preset: 'resume',
            mode: 'resume',
          })
        }
      }
    }
  }

  return (
    <SwarmBatchMatrixCard
      parentSessionId={parentSessionId}
      phase={phase}
      isError={phase === 'result' && block.isError}
      description={description}
      parsedChildren={parsedChildren}
      useSessions={useSessions}
      useSessionStatus={useSessionStatus}
      openChildAside={openChildAside}
      ensureParentCatalog={props.ensureParentCatalog}
      t={t}
    />
  )
}

/**
 * Persistent Turn-tail renderer keeping `agent_swarm` and grouped parallel
 * `subagent` Matrix Cards visible inline below the assistant's final synthesis
 * after `ui-chat` collapses intermediate tool steps.
 * @param props - Closing Turn currency, session status hooks, and localized copy.
 * @returns Matrix cards for all parallel assistant batches in the Turn, or `null` when none ran.
 */
export function SwarmTurnTail(props: SwarmTurnTailProps): ReactNode {
  const batches = selectSwarmTurnBatches(props)
  if (batches === null) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
      {batches.map(batch => (
        <SwarmBatchMatrixCard
          key={batch.callId}
          parentSessionId={props.sessionId}
          phase="result"
          isError={false}
          description={batch.isRoleGroup === true ? props.t('card.parallelGroup') : batch.description}
          parsedChildren={batch.children}
          useSessions={props.useSessions}
          useSessionStatus={props.useSessionStatus}
          openChildAside={props.openChildAside}
          ensureParentCatalog={props.ensureParentCatalog}
          t={props.t}
        />
      ))}
    </div>
  )
}
