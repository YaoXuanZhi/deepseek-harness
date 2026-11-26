/** Progress card section: projects Session todo items into the floating Session panel. */
import { useState, type ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import type {} from './slots.ts'
import css from './ProgressSection.module.css'

/** Full props of the built-in Progress section. */
export type ProgressSectionProps =
  PropsRuntime<'conversation.session.panel.section'>
  & PropsRenderFactories
  & PropsLocale<typeof NS>

/** Maximum todo rows shown before folding behind the shared fold row. */
const FOLD_LIMIT = 6

/**
 * Render the current session's `todos` projection as a Kimi-style Progress card.
 * Returns null when no todos exist so the panel hides the card automatically.
 * @param props - Session projection hook, factory renderer, and locale seat.
 * @returns Todo rows and optional fold row, or null when empty.
 */
export function ProgressSection({ useProjection, renderFactorySlot, t }: ProgressSectionProps): ReactNode {
  const todos = useProjection('todos')
  const [expanded, setExpanded] = useState(false)
  if (todos == null || todos.length === 0) return null

  const canFold = todos.length > FOLD_LIMIT + 1
  const visible = canFold && !expanded ? todos.slice(0, FOLD_LIMIT) : todos
  const hiddenCount = todos.length - visible.length

  return (
    <div className={css.list} data-session-panel-progress="">
      {visible.map((item) => {
        const label = item.status === 'completed'
          ? t('progress.status.completed')
          : item.status === 'in_progress'
            ? t('progress.status.inProgress')
            : t('progress.status.pending')
        return (
          <div key={item.content} className={css.row} data-session-panel-row="" data-progress-status={item.status}>
            <div data-row-part="body">
              <span data-row-part="icon" role="img" aria-label={label}>
                {item.status === 'completed' ? (
                  <span className={css.checkBadge} aria-hidden="true">
                    <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
                      <path
                        d="M3.8 7.2L6.1 9.5L10.4 4.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : item.status === 'in_progress' ? (
                  <StateDot state="ongoing" />
                ) : (
                  <span className={css.pendingRing} aria-hidden="true">
                    <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
                      <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </span>
                )}
              </span>
              <span data-row-part="content" className={css.text}>{item.content}</span>
            </div>
          </div>
        )
      })}
      {canFold && renderFactorySlot('conversation.session.panel.fold', {
        expanded,
        label: expanded ? t('fold.collapse') : t('fold.expand', { count: hiddenCount }),
        name: `${expanded ? t('fold.collapse') : t('fold.expand', { count: hiddenCount })} ${t('section.progress')}`,
        onToggle: () => { setExpanded(value => !value) },
      })}
    </div>
  )
}
