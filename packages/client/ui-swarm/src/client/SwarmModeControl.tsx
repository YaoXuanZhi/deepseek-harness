import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCloseCircleFillRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-swarm-mode/client'
import type { SwarmControlInjected } from './index.ts'
import css from './SwarmModeControl.module.css'

/** Composed props for the Composer Swarm toggle chip. */
export type SwarmChipProps =
  PropsRuntime<'conversation.input.left'> & InjectFace<SwarmControlInjected> & PropsLocale<'swarm'>

function SwarmClusterSvg({ className }: { readonly className?: string | undefined }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="3.2" r="2" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="3.4" cy="12" r="2" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="12.6" cy="12" r="2" stroke="currentColor" strokeWidth="1.35" />
      <path d="M6.9 4.9L4.5 10.2M9.1 4.9L11.5 10.2M5.4 12H10.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Kimi Work-style `集群` (`Swarm`) composer toggle chip.
 * Renders inactive toggle when `swarm` projection is present and off, and active
 * highlighted chip when Swarm mode is selected.
 */
export function SwarmModeControl({ useProjection, toggleSwarmMode, t }: SwarmChipProps) {
  const swarm = useProjection('swarm')
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Hide on presets without `@deepseek-ai/dsh-swarm-mode` or on subagent read-only views.
  if (swarm === undefined) return null
  const active = swarm.pending ? !swarm.active : swarm.active

  const onToggle = (): void => {
    setSwitching(true)
    setError(null)
    void toggleSwarmMode(!active).then((failure) => {
      if (!aliveRef.current) return
      setSwitching(false)
      setError(failure)
    }, (reason: unknown) => {
      if (!aliveRef.current) return
      setSwitching(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <span className={css.wrap}>
      <button
        type="button"
        className={clsx(css.chip, active && css.chipActive)}
        aria-pressed={active}
        aria-label={active ? t('chip.on.aria') : t('chip.off.aria')}
        title={active ? t('chip.on.title') : t('chip.off.title')}
        disabled={switching}
        onClick={onToggle}
      >
        <span className={css.icon} aria-hidden>
          <SwarmClusterSvg className={css.clusterGlyph} />
          {active && <IconCloseCircleFillRegular className={css.closeGlyph} size={14} />}
        </span>
        <span>{t('chip.label')}</span>
      </button>
      {error !== null && <span className={css.error} role="status" title={error}>{t('chip.failed')}</span>}
    </span>
  )
}
