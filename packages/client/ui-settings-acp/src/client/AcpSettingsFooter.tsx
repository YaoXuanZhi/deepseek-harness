import { useEffect, useId, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Button, IconPlusOutlineRegular, Modal, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {
  AcpAuthFlowView,
  AcpLlmCatalog,
  AcpLlmProviderView,
  AcpProviderEnvInput,
  AcpProviderModelEntry,
  AcpRegistryAgentSummary,
  AcpRegistryDistributionKind,
  AcpTerminalAuthSessionView,
  UpsertAcpProviderInput,
} from '@deepseek-ai/dsh-llm-acp/client'
import type {} from './locales.ts'
import { ProviderAuthTerminal } from './ProviderAuthTerminal.tsx'
import css from './AcpSettingsFooter.module.css'

/** Client state snapshot held by `ui-settings-acp`. */
export interface AcpSettingsClientState {
  readonly loaded: boolean
  readonly catalog: AcpLlmCatalog
}

/** Injected operations and state hooks for `AcpSettingsFooter`. */
export interface AcpSettingsInjected {
  readonly hooks: {
    readonly acpState: HostObservable<AcpSettingsClientState>
  }
  readonly searchRegistry: (query: string, forceRefresh?: boolean) => Promise<readonly AcpRegistryAgentSummary[]>
  readonly upsertProvider: (input: UpsertAcpProviderInput) => Promise<AcpLlmProviderView>
  readonly removeProvider: (providerId: string) => Promise<void>
  readonly probeProvider: (providerId: string) => Promise<AcpLlmProviderView>
  readonly startAuth: (providerId: string, methodId?: string) => Promise<AcpAuthFlowView>
  readonly launchTerminalLogin: (providerId: string, commandLine?: string) => Promise<string>
  readonly startTerminalAuth?: (
    providerId: string,
    commandLine?: string,
    cols?: number,
    rows?: number,
  ) => Promise<AcpTerminalAuthSessionView>
  readonly writeTerminalAuth?: (sessionId: string, data?: string, cols?: number, rows?: number) => Promise<void>
  readonly stopTerminalAuth?: (sessionId: string) => Promise<void>
}

/** Composed props delivered to `AcpSettingsFooter` in `settings.models.footer`. */
export type AcpSettingsFooterProps =
  InjectFace<AcpSettingsInjected>
  & PropsLocale<'settingsAcp'>

interface EnvDraftRow {
  readonly name: string
  readonly value: string
  readonly secret: boolean
  readonly hadSavedSecret: boolean
}

interface ModelDraftRow {
  readonly id: string
  readonly name: string
}

function sanitizeProviderSlug(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 56)
  return cleaned || 'acp-agent'
}

/**
 * Models-settings footer section for searching/installing ACP Registry agents,
 * completing subscription OAuth or terminal login, and managing local ACP LLM routes.
 * @param props - Slot owner props, ACP Remote actions, and localized copy.
 * @returns Interactive ACP subscription providers section.
 */
export function AcpSettingsFooter(props: AcpSettingsFooterProps): ReactNode {
  const {
    useAcpState,
    searchRegistry,
    upsertProvider,
    removeProvider,
    probeProvider,
    startAuth,
    launchTerminalLogin,
    startTerminalAuth,
    writeTerminalAuth,
    stopTerminalAuth,
    t,
  } = props

  const state = useAcpState(s => s)
  const providers = state.catalog.providers
  const authFlows = state.catalog.authFlows
  const terminalSessions = state.catalog.terminalSessions ?? []

  const modeControlId = useId()
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<'registry' | 'local'>('registry')

  // Registry search state
  const [searchQuery, setSearchQuery] = useState('')
  const [registryAgents, setRegistryAgents] = useState<readonly AcpRegistryAgentSummary[]>([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [selectedDistByAgent, setSelectedDistByAgent] = useState<Record<string, AcpRegistryDistributionKind>>({})
  const [installingAgentId, setInstallingAgentId] = useState<string | null>(null)

  // Local / Edit form state
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [draftId, setDraftId] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftSource, setDraftSource] = useState<'registry' | 'local'>('local')
  const [draftRegistryId, setDraftRegistryId] = useState('')
  const [draftCommand, setDraftCommand] = useState('')
  const [draftArgs, setDraftArgs] = useState('')
  const [draftEnv, setDraftEnv] = useState<EnvDraftRow[]>([])
  const [draftModels, setDraftModels] = useState<ModelDraftRow[]>([])
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Auth & Probe per-row state
  const [authPanelProviderId, setAuthPanelProviderId] = useState<string | null>(null)
  const [probingId, setProbingId] = useState<string | null>(null)
  const [terminalCmdDraft, setTerminalCmdDraft] = useState('')
  const [terminalLaunchedFor, setTerminalLaunchedFor] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AcpLlmProviderView | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!addOpen || addMode !== 'registry') return
    let cancelled = false
    const timer = setTimeout(() => {
      setRegistryLoading(true)
      setRegistryError(null)
      void searchRegistry(searchQuery, false).then(
        (items) => {
          if (!cancelled) {
            setRegistryAgents(items)
            setRegistryLoading(false)
          }
        },
        (err: unknown) => {
          if (!cancelled) {
            setRegistryError(err instanceof Error ? err.message : String(err))
            setRegistryLoading(false)
          }
        },
      )
    }, searchQuery.trim() === '' ? 0 : 260)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [addMode, addOpen, searchQuery, searchRegistry])

  const openCreateLocal = (): void => {
    setEditingProviderId(null)
    setDraftId('')
    setDraftName('')
    setDraftSource('local')
    setDraftRegistryId('')
    setDraftCommand('')
    setDraftArgs('')
    setDraftEnv([])
    setDraftModels([])
    setFormError(null)
  }

  const openEditProvider = (p: AcpLlmProviderView): void => {
    setAddOpen(false)
    setAuthPanelProviderId(null)
    setEditingProviderId(p.id)
    setDraftId(p.id)
    setDraftName(p.displayName)
    setDraftSource(p.source)
    setDraftRegistryId(p.registryAgentId ?? '')
    setDraftCommand(p.command)
    setDraftArgs(p.args.join(' '))
    setDraftEnv(p.env.map(e => ({
      name: e.name,
      value: e.secret ? '' : e.value,
      secret: e.secret,
      hadSavedSecret: e.secret && e.configured,
    })))
    setDraftModels(p.models.map(m => ({ id: m.id, name: m.name })))
    setFormError(null)
  }

  const handleInstallRegistryAgent = async (agent: AcpRegistryAgentSummary): Promise<void> => {
    setInstallingAgentId(agent.id)
    setRegistryError(null)
    try {
      const baseSlug = sanitizeProviderSlug(agent.id.endsWith('-acp') ? agent.id : `${agent.id}-acp`)
      let uniqueId = baseSlug
      let suffix = 2
      while (providers.some(p => p.id === uniqueId)) {
        uniqueId = `${baseSlug}-${String(suffix)}`
        suffix += 1
      }
      const chosenDist = selectedDistByAgent[agent.id] ?? agent.distribution
      const created = await upsertProvider({
        id: uniqueId,
        displayName: agent.name,
        source: 'registry',
        registryAgentId: agent.id,
        distribution: chosenDist,
        autoProbe: true,
      })
      setAddOpen(false)
      if (created.status === 'auth_required') {
        setAuthPanelProviderId(created.id)
      }
    } catch (err) {
      setRegistryError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallingAgentId(null)
    }
  }

  const handleSaveForm = async (): Promise<void> => {
    setFormSaving(true)
    setFormError(null)
    try {
      const envPayload: AcpProviderEnvInput[] = draftEnv
        .filter(row => row.name.trim() !== '')
        .map(row => ({
          name: row.name.trim(),
          secret: row.secret,
          ...(row.secret && row.value.trim() === '' && row.hadSavedSecret
            ? { keepExistingSecret: true }
            : { value: row.value }),
        }))
      const modelsPayload: AcpProviderModelEntry[] = draftModels
        .filter(m => m.id.trim() !== '')
        .map(m => ({
          id: m.id.trim(),
          name: m.name.trim() || m.id.trim(),
        }))
      const argsList = draftArgs
        .trim()
        .split(/\s+/)
        .filter(Boolean)

      const saved = await upsertProvider({
        id: editingProviderId ?? draftId.trim(),
        displayName: draftName.trim() || draftId.trim(),
        source: draftSource,
        ...(draftSource === 'registry' && draftRegistryId ? { registryAgentId: draftRegistryId } : {}),
        command: draftCommand.trim(),
        args: argsList,
        env: envPayload,
        ...(modelsPayload.length > 0 ? { models: modelsPayload } : {}),
        autoProbe: modelsPayload.length === 0,
      })
      setEditingProviderId(null)
      setAddOpen(false)
      if (saved.status === 'auth_required') {
        setAuthPanelProviderId(saved.id)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setFormSaving(false)
    }
  }

  const handleProbe = async (providerId: string): Promise<void> => {
    setProbingId(providerId)
    setAuthError(null)
    try {
      await probeProvider(providerId)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    } finally {
      setProbingId(null)
    }
  }

  const handleStartOAuth = async (providerId: string, methodId?: string): Promise<void> => {
    setAuthError(null)
    try {
      const flow = await startAuth(providerId, methodId)
      if (flow.authUrl) {
        window.open(flow.authUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleOpenTerminal = async (p: AcpLlmProviderView): Promise<void> => {
    setAuthError(null)
    try {
      await launchTerminalLogin(p.id, terminalCmdDraft.trim() || undefined)
      setTerminalLaunchedFor(p.id)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleStartEmbeddedTerminal = async (p: AcpLlmProviderView): Promise<void> => {
    if (!startTerminalAuth) return
    setAuthError(null)
    try {
      await startTerminalAuth(p.id, terminalCmdDraft.trim() || undefined)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleStopEmbeddedTerminal = async (sessionId: string): Promise<void> => {
    if (!stopTerminalAuth) return
    setAuthError(null)
    try {
      await stopTerminalAuth(sessionId)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    }
  }

  const renderProviderForm = (isEditing: boolean): ReactNode => (
    <div className={css.subPanel}>
      <div className={css.field}>
        <label className={css.fieldLabel}>{t('field.providerId')}</label>
        <input
          type="text"
          className={css.input}
          value={draftId}
          disabled={isEditing || formSaving}
          placeholder="claude-acp"
          onChange={(ev) => { setDraftId(ev.target.value) }}
        />
        {!isEditing && <p className={css.hint}>{t('field.providerIdHint')}</p>}
      </div>

      <div className={css.field}>
        <label className={css.fieldLabel}>{t('field.displayName')}</label>
        <input
          type="text"
          className={css.input}
          value={draftName}
          disabled={formSaving}
          placeholder={t('field.displayName')}
          onChange={(ev) => { setDraftName(ev.target.value) }}
        />
      </div>

      <div className={css.field}>
        <label className={css.fieldLabel}>{t('field.command')}</label>
        <input
          type="text"
          className={css.input}
          value={draftCommand}
          disabled={formSaving}
          placeholder="claude-code-acp"
          onChange={(ev) => { setDraftCommand(ev.target.value) }}
        />
      </div>

      <div className={css.field}>
        <label className={css.fieldLabel}>{t('field.args')}</label>
        <input
          type="text"
          className={css.input}
          value={draftArgs}
          disabled={formSaving}
          placeholder={t('field.args')}
          onChange={(ev) => { setDraftArgs(ev.target.value) }}
        />
      </div>

      <div className={css.field}>
        <span className={css.fieldLabel}>{t('field.env')}</span>
        {draftEnv.map((row, idx) => (
          <div key={idx} className={css.inlineRow}>
            <input
              type="text"
              className={css.input}
              placeholder={t('field.envNamePlaceholder')}
              value={row.name}
              onChange={(ev) => {
                const val = ev.target.value
                setDraftEnv(prev => prev.map((r, i) => (i === idx ? { ...r, name: val } : r)))
              }}
            />
            <input
              type={row.secret ? 'password' : 'text'}
              autoComplete="new-password"
              className={css.input}
              placeholder={row.secret && row.hadSavedSecret ? t('field.envSecretSaved') : t('field.envValuePlaceholder')}
              value={row.value}
              onChange={(ev) => {
                const val = ev.target.value
                setDraftEnv(prev => prev.map((r, i) => (i === idx ? { ...r, value: val } : r)))
              }}
            />
            <label className={css.checkboxLabel}>
              <input
                type="checkbox"
                checked={row.secret}
                onChange={(ev) => {
                  const checked = ev.target.checked
                  setDraftEnv(prev => prev.map((r, i) => (i === idx ? { ...r, secret: checked } : r)))
                }}
              />
              {t('field.envSecretToggle')}
            </label>
            <button
              type="button"
              className={clsx(css.btn, css.btnDanger)}
              onClick={() => { setDraftEnv(prev => prev.filter((_, i) => i !== idx)) }}
            >
              {t('action.remove')}
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className={css.btn}
            onClick={() => {
              setDraftEnv(prev => [...prev, { name: '', value: '', secret: false, hadSavedSecret: false }])
            }}
          >
            + {t('field.addEnv')}
          </button>
        </div>
      </div>

      <div className={css.field}>
        <span className={css.fieldLabel}>{t('field.models')}</span>
        {draftModels.map((m, idx) => (
          <div key={idx} className={css.inlineRow}>
            <input
              type="text"
              className={css.input}
              placeholder={t('field.modelIdPlaceholder')}
              value={m.id}
              onChange={(ev) => {
                const val = ev.target.value
                setDraftModels(prev => prev.map((r, i) => (i === idx ? { ...r, id: val } : r)))
              }}
            />
            <input
              type="text"
              className={css.input}
              placeholder={t('field.modelNamePlaceholder')}
              value={m.name}
              onChange={(ev) => {
                const val = ev.target.value
                setDraftModels(prev => prev.map((r, i) => (i === idx ? { ...r, name: val } : r)))
              }}
            />
            <button
              type="button"
              className={clsx(css.btn, css.btnDanger)}
              onClick={() => { setDraftModels(prev => prev.filter((_, i) => i !== idx)) }}
            >
              {t('action.remove')}
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className={css.btn}
            onClick={() => { setDraftModels(prev => [...prev, { id: '', name: '' }]) }}
          >
            + {t('field.addModel')}
          </button>
        </div>
      </div>

      {formError !== null && <p role="alert" className={css.errorText}>{formError}</p>}

      <div className={css.footerActions}>
        <button
          type="button"
          className={css.btn}
          disabled={formSaving}
          onClick={() => {
            if (isEditing) setEditingProviderId(null)
            else setAddOpen(false)
          }}
        >
          {t('action.cancel')}
        </button>
        <button
          type="button"
          className={clsx(css.btn, css.btnPrimary)}
          disabled={formSaving || (!isEditing && draftId.trim() === '') || draftCommand.trim() === ''}
          onClick={() => { void handleSaveForm() }}
        >
          {formSaving ? t('action.saving') : t('action.save')}
        </button>
      </div>
    </div>
  )

  return (
    <section className={css.wrapper} aria-label={t('section.title')}>
      <div className={css.header}>
        <h3 className={css.title}>{t('section.title')}</h3>
        <p className={css.intro}>{t('section.intro')}</p>
      </div>

      {providers.length > 0 && (
        <ul className={css.rows}>
          {providers.map((p) => {
            const isEditingThis = editingProviderId === p.id
            const isAuthOpen = authPanelProviderId === p.id
            const isProbing = probingId === p.id
            const latestFlow = [...authFlows].reverse().find(f => f.providerId === p.id)
            const activeTerm = [...terminalSessions].reverse().find(s => s.providerId === p.id)

            const statusLabel = p.status === 'ready'
              ? t('status.ready', { count: String(p.models.length) })
              : p.status === 'auth_required'
                ? t('status.authRequired')
                : p.status === 'error'
                  ? t('status.error')
                  : t('status.unprobed')

            return (
              <li key={p.id} className={css.rowCard}>
                <div className={css.rowHead}>
                  <span className={css.rowIdentity}>
                    <span className={css.rowName}>{p.displayName}</span>
                    <span className={css.badge}>
                      {p.source === 'registry' ? t('tag.registry') : t('tag.local')}
                    </span>
                    <span className={css.statusBadge}>
                      <span
                        className={clsx(
                          css.dot,
                          p.status === 'ready' && css.dotReady,
                          p.status === 'auth_required' && css.dotWarn,
                          p.status === 'error' && css.dotError,
                        )}
                      />
                      <span>{statusLabel}</span>
                    </span>
                  </span>

                  <span className={css.rowActions}>
                    <button
                      type="button"
                      className={clsx(css.btn, p.status === 'auth_required' && css.btnPrimary)}
                      onClick={() => {
                        setEditingProviderId(null)
                        setAuthError(null)
                        const termCmd = p.authMethods.find(m => m.type === 'terminal')?.terminalCommand ?? ''
                        setTerminalCmdDraft(termCmd)
                        setAuthPanelProviderId(isAuthOpen ? null : p.id)
                      }}
                    >
                      {isAuthOpen ? t('action.close') : t('action.auth')}
                    </button>
                    <button
                      type="button"
                      className={css.btn}
                      disabled={isProbing}
                      onClick={() => { void handleProbe(p.id) }}
                    >
                      {isProbing ? t('action.probing') : t('action.probe')}
                    </button>
                    <button
                      type="button"
                      className={css.btn}
                      onClick={() => {
                        if (isEditingThis) setEditingProviderId(null)
                        else openEditProvider(p)
                      }}
                    >
                      {t('action.edit')}
                    </button>
                    <button
                      type="button"
                      className={clsx(css.btn, css.btnDanger)}
                      onClick={() => { setDeleteTarget(p) }}
                    >
                      {t('action.remove')}
                    </button>
                  </span>
                </div>

                {p.models.length > 0 && !isEditingThis && (
                  <div className={css.modelPills}>
                    {p.models.slice(0, 8).map(m => (
                      <span key={m.id} className={css.modelPill} title={m.name}>
                        {m.id}
                      </span>
                    ))}
                    {p.models.length > 8 && (
                      <span className={css.modelPill}>+{String(p.models.length - 8)}</span>
                    )}
                  </div>
                )}

                {p.statusMessage && p.status !== 'ready' && (
                  <p className={css.errorText}>{p.statusMessage}</p>
                )}

                {isAuthOpen && (
                  <div className={css.subPanel}>
                    <div className={css.field}>
                      <span className={css.fieldLabel}>{t('auth.title', { name: p.displayName })}</span>
                      <p className={css.hint}>{t('auth.subtitle')}</p>
                    </div>

                    <div className={css.inlineRow}>
                      {p.authMethods.filter(m => m.type === 'agent').length > 0 ? (
                        p.authMethods.filter(m => m.type === 'agent').map(m => (
                          <button
                            key={m.id}
                            type="button"
                            className={clsx(css.btn, css.btnPrimary)}
                            onClick={() => { void handleStartOAuth(p.id, m.id) }}
                          >
                            {m.name || t('auth.oauthButton')}
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          className={clsx(css.btn, css.btnPrimary)}
                          onClick={() => { void handleStartOAuth(p.id) }}
                        >
                          {t('auth.oauthButton')}
                        </button>
                      )}
                    </div>

                    {latestFlow?.status === 'url_required' && latestFlow.authUrl && (
                      <div className={css.field}>
                        <a
                          href={latestFlow.authUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={css.authUrlLink}
                        >
                          {t('auth.openUrl')}: {latestFlow.authUrl}
                        </a>
                        <p className={css.hint}>{t('auth.waiting')}</p>
                      </div>
                    )}
                    {latestFlow?.status === 'pending' && (
                      <p className={css.hint}>{t('auth.waiting')}</p>
                    )}
                    {latestFlow?.status === 'succeeded' && (
                      <p className={css.successText}>{t('auth.succeeded')}</p>
                    )}
                    {latestFlow?.status === 'failed' && latestFlow.message && (
                      <p className={css.errorText}>{latestFlow.message}</p>
                    )}

                    <div className={css.field}>
                      <span className={css.fieldLabel}>{t('auth.terminalTitle')}</span>
                      <div className={css.inlineRow}>
                        <input
                          type="text"
                          className={css.input}
                          placeholder={t('auth.terminalCommandPlaceholder')}
                          value={terminalCmdDraft}
                          onChange={(ev) => { setTerminalCmdDraft(ev.target.value) }}
                        />
                        {startTerminalAuth && (
                          <button
                            type="button"
                            className={clsx(css.btn, css.btnPrimary)}
                            onClick={() => { void handleStartEmbeddedTerminal(p) }}
                          >
                            {t('auth.embedTerminalStart')}
                          </button>
                        )}
                        <button
                          type="button"
                          className={css.btn}
                          onClick={() => { void handleOpenTerminal(p) }}
                        >
                          {t('auth.openTerminal')}
                        </button>
                        <button
                          type="button"
                          className={css.btn}
                          disabled={isProbing}
                          onClick={() => { void handleProbe(p.id) }}
                        >
                          {isProbing ? t('action.probing') : t('auth.doneProbe')}
                        </button>
                      </div>
                      {activeTerm && (
                        <div className={css.embeddedTerminalBox}>
                          <div className={css.embeddedTerminalBar}>
                            <span className={css.embeddedTerminalStatus}>
                              <span
                                className={clsx(
                                  css.dot,
                                  activeTerm.status === 'running' && css.dotWarn,
                                  activeTerm.status === 'exited' && css.dotReady,
                                  activeTerm.status === 'failed' && css.dotError,
                                )}
                              />
                              <span>
                                {activeTerm.status === 'running'
                                  ? t('auth.embedStatusRunning')
                                  : activeTerm.status === 'exited'
                                    ? t('auth.embedStatusSucceeded')
                                    : t('auth.embedStatusFailed', { code: String(activeTerm.exitCode ?? '—') })}
                              </span>
                            </span>
                            <span className={css.embeddedTerminalActions}>
                              {activeTerm.detectedUrl && (
                                <a
                                  href={activeTerm.detectedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={css.btn}
                                >
                                  {t('auth.openUrl')}
                                </a>
                              )}
                              <button
                                type="button"
                                className={css.btn}
                                onClick={() => { void handleStartEmbeddedTerminal(p) }}
                              >
                                {t('auth.embedRestart')}
                              </button>
                              <button
                                type="button"
                                className={css.btn}
                                onClick={() => { void handleStopEmbeddedTerminal(activeTerm.sessionId) }}
                              >
                                {t('auth.embedClose')}
                              </button>
                            </span>
                          </div>
                          <ProviderAuthTerminal
                            sessionId={activeTerm.sessionId}
                            output={activeTerm.output}
                            outputOffset={activeTerm.outputOffset}
                            status={activeTerm.status}
                            ariaLabel={t('auth.embedTerminalAria')}
                            onInput={(data) => {
                              void writeTerminalAuth?.(activeTerm.sessionId, data).catch(() => {})
                            }}
                            onResize={(cols, rows) => {
                              void writeTerminalAuth?.(activeTerm.sessionId, undefined, cols, rows).catch(() => {})
                            }}
                          />
                        </div>
                      )}
                      {terminalLaunchedFor === p.id && (
                        <p className={css.successText}>{t('auth.terminalLaunched')}</p>
                      )}
                    </div>

                    {authError !== null && <p className={css.errorText}>{authError}</p>}
                  </div>
                )}

                {isEditingThis && renderProviderForm(true)}
              </li>
            )
          })}
        </ul>
      )}

      {addOpen ? (
        <div className={css.card}>
          <SegmentedControl
            id={modeControlId}
            label={t('mode.label')}
            value={addMode}
            options={[
              { value: 'registry', label: t('mode.registry') },
              { value: 'local', label: t('mode.local') },
            ]}
            onChange={(next) => {
              setAddMode(next)
              if (next === 'local') openCreateLocal()
            }}
          />
          <p className={css.hint}>
            {addMode === 'registry' ? t('mode.registryHint') : t('mode.localHint')}
          </p>

          {addMode === 'registry' ? (
            <>
              <div className={css.searchBar}>
                <input
                  type="search"
                  className={css.input}
                  placeholder={t('registry.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(ev) => { setSearchQuery(ev.target.value) }}
                />
                <button
                  type="button"
                  className={css.btn}
                  disabled={registryLoading}
                  onClick={() => {
                    setRegistryLoading(true)
                    setRegistryError(null)
                    void searchRegistry(searchQuery, true).then(
                      (items) => {
                        setRegistryAgents(items)
                        setRegistryLoading(false)
                      },
                      (err: unknown) => {
                        setRegistryError(err instanceof Error ? err.message : String(err))
                        setRegistryLoading(false)
                      },
                    )
                  }}
                >
                  {t('registry.refresh')}
                </button>
              </div>

              {registryError !== null && <p role="alert" className={css.errorText}>{registryError}</p>}

              {registryLoading ? (
                <p className={css.hint}>{t('registry.loading')}</p>
              ) : registryAgents.length === 0 ? (
                <p className={css.hint}>{t('registry.empty')}</p>
              ) : (
                <div className={css.registryList}>
                  {registryAgents.map((agent) => {
                    const alreadyAdded = providers.some(p => p.registryAgentId === agent.id)
                    const isInstalling = installingAgentId === agent.id
                    const activeDist = selectedDistByAgent[agent.id] ?? agent.distribution
                    return (
                      <div key={agent.id} className={css.registryItem}>
                        <div className={css.registryMeta}>
                          <div className={css.registryTitleRow}>
                            <span className={css.registryName}>{agent.name}</span>
                            <span className={css.registryVersion}>{agent.version}</span>
                            {agent.prepared && <span className={css.badge}>{t('tag.prepared')}</span>}
                          </div>
                          {agent.description && <p className={css.registryDesc}>{agent.description}</p>}
                        </div>
                        <div className={css.registryRight}>
                          {agent.availableDistributions.length > 1 ? (
                            <select
                              className={css.select}
                              value={activeDist}
                              disabled={isInstalling}
                              onChange={(ev) => {
                                const val = ev.target.value as AcpRegistryDistributionKind
                                setSelectedDistByAgent(prev => ({ ...prev, [agent.id]: val }))
                              }}
                            >
                              {agent.availableDistributions.map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={css.badge}>{agent.distribution}</span>
                          )}
                          <button
                            type="button"
                            className={clsx(css.btn, !alreadyAdded && css.btnPrimary)}
                            disabled={installingAgentId !== null}
                            onClick={() => { void handleInstallRegistryAgent(agent) }}
                          >
                            {isInstalling
                              ? t('registry.installing')
                              : alreadyAdded
                                ? t('registry.added')
                                : t('registry.install')}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className={css.footerActions}>
                <button
                  type="button"
                  className={css.btn}
                  onClick={() => { setAddOpen(false) }}
                >
                  {t('action.close')}
                </button>
              </div>
            </>
          ) : (
            renderProviderForm(false)
          )}
        </div>
      ) : (
        <button
          type="button"
          className={css.addButton}
          onClick={() => {
            setEditingProviderId(null)
            setAddMode('registry')
            setAddOpen(true)
          }}
        >
          <IconPlusOutlineRegular size={14} />
          <span>{t('action.add')}</span>
        </button>
      )}

      <Modal
        open={deleteTarget !== null}
        onClose={() => { if (!deleting) setDeleteTarget(null) }}
        title={deleteTarget ? t('delete.title', { name: deleteTarget.displayName }) : ''}
        closeLabel={t('action.cancel')}
        description={t('delete.description')}
        footer={(
          <>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => { setDeleteTarget(null) }}
            >
              {t('action.cancel')}
            </Button>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => {
                if (!deleteTarget || deleting) return
                setDeleting(true)
                void removeProvider(deleteTarget.id)
                  .finally(() => {
                    setDeleting(false)
                    setDeleteTarget(null)
                  })
              }}
            >
              {t('delete.confirm')}
            </Button>
          </>
        )}
      >
        {null}
      </Modal>
    </section>
  )
}
