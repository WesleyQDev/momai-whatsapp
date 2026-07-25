import { useState, useEffect, useMemo, useRef } from 'react'
import { FunnelIcon, ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline'
import ConfirmDialog from '../../ConfirmDialog'

interface LogEntry {
  timestamp: string
  level: string
  component: string
  message: string
  raw: string
}

const COMPONENT_META: Record<string, { icon: string; color: string; label: string }> = {
  model: { icon: '♦', color: 'text-purple-400', label: 'MODEL' },
  chat: { icon: '◊', color: 'text-cyan-400', label: 'CHAT' },
  voice: { icon: '✺', color: 'text-yellow-400', label: 'VOICE' },
  embedding: { icon: '◎', color: 'text-green-400', label: 'EMBED' },
  python: { icon: '🐍', color: 'text-blue-400', label: 'PYTHON' },
  system: { icon: '⚙', color: 'text-gray-400', label: 'SYSTEM' }
}

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-gray-500',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400'
}

const LEVEL_ICONS: Record<string, string> = {
  debug: '●',
  info: '✔',
  warn: '⚠',
  error: '✗'
}

interface DeveloperTabProps {
  t: any
  handleDevMode: () => void
  onClose?: () => void
}

export default function DeveloperTab({ t, handleDevMode, onClose }: DeveloperTabProps) {
  const [isDevMode, setIsDevMode] = useState(
    () => localStorage.getItem('momai_dev_mode') === 'true'
  )
  const [showContextRing, setShowContextRing] = useState(
    () => localStorage.getItem('momai_show_context_ring') === 'true'
  )
  const [observabilityEnabled, setObservabilityEnabled] = useState(
    () => localStorage.getItem('momai_observability_enabled') === 'true'
  )
  const [logsEnabled, setLogsEnabled] = useState(
    () => localStorage.getItem('momai_logs_enabled') === 'true'
  )
  const [showDevResetConfirm, setShowDevResetConfirm] = useState(false)
  const [isDevResetting, setIsDevResetting] = useState(false)
  const [logPaths, setLogPaths] = useState({ logs: '', data: '', install: '', logFile: '', models: '', llama: '' })
  const isElectronDev = (window as any).momaiAPI?.isDev?.() === true

  useEffect(() => {
    const logsP = window.api.getLogsPath()
    const dataP = (window.api as any).getDataPath?.()?.catch?.() ?? Promise.resolve('')
    const installP = (window.api as any).getInstallPath?.()?.catch?.() ?? Promise.resolve('')
    const modelsP = (window.api as any).getModelsPath?.()?.catch?.() ?? Promise.resolve('')
    const llamaP = (window.api as any).getLlamaPath?.()?.catch?.() ?? Promise.resolve('')
    Promise.all([logsP, dataP, installP, modelsP, llamaP]).then(([logs, data, install, models, llama]) => {
      setLogPaths({ logs, data, install, logFile: logs ? logs.replace(/\/$/, '') + '\\main.log' : '', models, llama })
    }).catch(() => {})
  }, [])

  const handleDevReset = async () => {
    setIsDevResetting(true)
    try {
      // Stop any TTS that's currently speaking and close the overlay window
      // so the reset state is clean (no audio continuing, no popups lingering).
      try {
        await (window as any).momaiAPI?.stopTts?.()
      } catch {}
      try {
        ;(window as any).momaiAPI?.closeOverlay?.()
      } catch {}

      // Clear renderer-side per-user state so the next session is truly fresh
      // (user name, AI tier, dev-mode flag, etc). Mirrors what a fresh install
      // would have.
      try {
        localStorage.removeItem('momai_user_name')
        localStorage.removeItem('momai_ai_tier')
        localStorage.removeItem('momai_skip_intro')
        localStorage.removeItem('momai_dev_mode')
        localStorage.removeItem('momai_show_context_ring')
        localStorage.removeItem('momai_observability_enabled')
        localStorage.removeItem('momai_logs_enabled')
        localStorage.removeItem('momai_seen_panels')
        localStorage.removeItem('momai_mode_changing')
        localStorage.removeItem('momai_default_note_created')
      } catch (e) {
        console.warn('Failed to clear localStorage on dev reset:', e)
      }

      // Transition the UI to welcome/onboarding screen immediately.
      // Settings sync listener in useAppInitialization will pick up onboarding_completed === false
      // and show the welcome/onboarding screens instantly.
      window.dispatchEvent(new CustomEvent('momai_new_session'))
      window.dispatchEvent(
        new CustomEvent('momai_settings_sync', {
          detail: { onboarding_completed: false }
        })
      )

      // Close the settings panel and confirmation dialog immediately so the UI doesn't freeze.
      setShowDevResetConfirm(false)
      onClose?.()

      // Run backend reset in the background
      ;(window as any).momaiAPI?.privacy
        ?.devReset?.()
        .then(async (result) => {
          if (!result || result.ok !== true) {
            throw new Error(result?.error || 'unknown error')
          }
          // Once reset is done on the backend, call resetOnboarding to mark first launch
          ;(window as any).momaiAPI?.resetOnboarding?.()
        })
        .catch((e) => {
          console.error('Background dev reset failed:', e)
        })
        .finally(() => {
          setIsDevResetting(false)
        })
    } catch (e) {
      console.error('Dev reset failed:', e)
      setIsDevResetting(false)
      throw e
    }
  }

  useEffect(() => {
    const syncDevMode = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') {
        setIsDevMode(detail)
        return
      }
      setIsDevMode(localStorage.getItem('momai_dev_mode') === 'true')
      setShowContextRing(localStorage.getItem('momai_show_context_ring') === 'true')
    }

    const handleObservabilitySync = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') setObservabilityEnabled(detail)
      else setObservabilityEnabled(localStorage.getItem('momai_observability_enabled') === 'true')
    }

    window.addEventListener('momai_dev_mode_sync', syncDevMode as EventListener)
    window.addEventListener('momai_observability_sync', handleObservabilitySync as EventListener)
    return () => {
      window.removeEventListener('momai_dev_mode_sync', syncDevMode as EventListener)
      window.removeEventListener(
        'momai_observability_sync',
        handleObservabilitySync as EventListener
      )
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-text tracking-tight">Modo Desenvolvedor</h2>
        <p className="text-xs text-text-muted font-medium">
          Ative para desbloquear ferramentas avançadas de debug e diagnóstico.
        </p>
      </div>

      {/* Toggle Principal */}
      <div className="flex items-center justify-between gap-2 p-4 rounded-xl bg-white/[0.03] border border-border/40">
        <div className="flex flex-col gap-0.5 pr-4 min-w-0">
          <span className="text-xs font-semibold text-text">Ativar Modo Desenvolvedor</span>
          <span className="text-[11px] text-text-muted font-medium">
            Habilita recursos extras voltados para diagnóstico e desenvolvimento.
          </span>
        </div>
        <button
          onClick={() => {
            handleDevMode()
            setIsDevMode(!isDevMode)
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            isDevMode ? 'bg-accent/80' : 'bg-white/10'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              isDevMode ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Recursos */}
      {isDevMode && (
        <div className="bg-white/[0.03] rounded-xl border border-border/40 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border/20">
            <div className="flex items-center gap-3 min-w-0">
              <svg
                className="shrink-0 text-accent"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="Logs do sistema em tempo real"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="10" x2="16" y2="10" />
                <line x1="8" y1="14" x2="12" y2="14" />
                <circle cx="6" cy="10" r="0.5" fill="currentColor" />
                <circle cx="6" cy="14" r="0.5" fill="currentColor" />
              </svg>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-text">Logs do Sistema</span>
                <span className="text-[11px] text-text-muted font-medium">
                  Visualize logs detalhados em tempo real.
                </span>
              </div>
            </div>
            <button
              data-testid="logs-toggle"
              title={logsEnabled ? 'Desativar logs do sistema' : 'Ativar logs do sistema'}
              aria-label={logsEnabled ? 'Desativar Logs do Sistema' : 'Ativar Logs do Sistema'}
              onClick={() => {
                const next = !logsEnabled
                setLogsEnabled(next)
                localStorage.setItem('momai_logs_enabled', String(next))
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${logsEnabled ? 'bg-accent/80' : 'bg-white/10'}`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${logsEnabled ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 border-b border-border/20">
            <div className="flex items-center gap-3 min-w-0">
              <svg
                className="shrink-0 text-accent"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="Monitoramento de chamadas ao LLM"
              >
                <path d="M12 20V10M18 20V4M6 20v-4" />
              </svg>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-text">Observabilidade de IA</span>
                <span className="text-[11px] text-text-muted font-medium">
                  Monitore chamadas ao LLM em tempo real.
                </span>
              </div>
            </div>
            <button
              data-testid="observability-toggle"
              title={observabilityEnabled ? 'Desativar observabilidade' : 'Ativar observabilidade'}
              aria-label={
                observabilityEnabled
                  ? 'Desativar Observabilidade de IA'
                  : 'Ativar Observabilidade de IA'
              }
              onClick={() => {
                const next = !observabilityEnabled
                setObservabilityEnabled(next)
                localStorage.setItem('momai_observability_enabled', String(next))
                window.dispatchEvent(new CustomEvent('momai_observability_sync', { detail: next }))
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${observabilityEnabled ? 'bg-accent/80' : 'bg-white/10'}`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${observabilityEnabled ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              <svg
                className="shrink-0 text-accent"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="Indicador visual de contexto usado"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-text">Ver contexto total usado</span>
                <span className="text-[11px] text-text-muted font-medium">
                  Mostra no chat uma circunferência com contexto usado e restante.
                </span>
              </div>
            </div>
            <button
              title={
                showContextRing ? 'Desativar indicador de contexto' : 'Ativar indicador de contexto'
              }
              aria-label={
                showContextRing ? 'Desativar indicador de contexto' : 'Ativar indicador de contexto'
              }
              onClick={() => {
                const next = !showContextRing
                localStorage.setItem('momai_show_context_ring', String(next))
                window.dispatchEvent(new CustomEvent('momai_context_ring_sync', { detail: next }))
                setShowContextRing(next)
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showContextRing ? 'bg-accent/80' : 'bg-white/10'}`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showContextRing ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Pastas do Sistema */}
      <div className="bg-white/[0.03] rounded-xl border border-border/40 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/20">
          <svg className="shrink-0 text-accent" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
          <span className="text-xs font-bold text-text">Pastas do Sistema</span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onClick={() => window.api.openLogsFolder()} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-border/20 text-left transition-colors">
            <span className="text-base">📂</span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-text">Abrir pasta de logs</span>
              <span className="text-[10px] text-text-muted/60 truncate">{logPaths.logs}</span>
            </div>
          </button>
          <button onClick={() => window.api.openDataFolder()} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-border/20 text-left transition-colors">
            <span className="text-base">📁</span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-text">Abrir pasta de dados</span>
              <span className="text-[10px] text-text-muted/60 truncate">{logPaths.data || logPaths.logs?.replace(/\\logs$/, '')}</span>
            </div>
          </button>
          <button onClick={() => window.api.openInstallPath()} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-border/20 text-left transition-colors">
            <span className="text-base">📦</span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-text">Abrir pasta de instalação</span>
              <span className="text-[10px] text-text-muted/60 truncate">{logPaths.install}</span>
            </div>
          </button>
          <button onClick={() => window.api.openLogFile()} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-border/20 text-left transition-colors">
            <span className="text-base">📄</span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-text">Abrir arquivo de log</span>
              <span className="text-[10px] text-text-muted/60 truncate">{logPaths.logFile}</span>
            </div>
          </button>
          <button onClick={() => window.api.openModelsFolder()} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-border/20 text-left transition-colors">
            <span className="text-base">🤖</span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-text">Abrir pasta de modelos</span>
              <span className="text-[10px] text-text-muted/60 truncate">{logPaths.models}</span>
            </div>
          </button>
          <button onClick={() => window.api.openLlamaFolder()} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-border/20 text-left transition-colors">
            <span className="text-base">⚙️</span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-text">Abrir pasta llama.cpp</span>
              <span className="text-[10px] text-text-muted/60 truncate">{logPaths.llama}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Dev Only — reset tool */}
      {isElectronDev && (
        <div className="bg-white/[0.03] rounded-xl border border-red-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-red-500/10">
            <TrashIcon className="shrink-0 text-red-400" width={16} height={16} />
            <span className="text-xs font-bold text-red-300">Reset to Zero</span>
            <span className="ml-auto text-[10px] text-red-400/50 font-mono">dev only</span>
          </div>
          <div className="flex items-center justify-between p-4 gap-4">
            <span className="text-[11px] text-text-muted leading-relaxed">
              Apaga cache, mensagens, modelos locais e dados das skills. Preserva o código do monorepo.
            </span>
            <button
              data-testid="dev-reset-button"
              onClick={() => setShowDevResetConfirm(true)}
              className="shrink-0 px-3 py-1.5 text-[11px] font-bold tracking-wider text-red-300 hover:text-white bg-red-500/10 hover:bg-red-500/30 rounded-lg border border-red-500/20 border-b-red-500/40 transition-all active:scale-95"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {showDevResetConfirm && (
        <ConfirmDialog
          variant="destructive"
          title={t('settings.dev.resetTitle')}
          description={t('settings.dev.resetDescription')}
          confirmText={t('settings.dev.resetConfirmButton')}
          cancelText={t('settings.dev.resetCancelButton')}
          isLoading={isDevResetting}
          onConfirm={handleDevReset}
          onCancel={() => !isDevResetting && setShowDevResetConfirm(false)}
        />
      )}
    </div>
  )
}

function LogsPanel() {
  const [loading, setLoading] = useState(true)
  const [streamLines, setStreamLines] = useState<LogEntry[]>([])
  const streamContainerRef = useRef<HTMLDivElement>(null)

  // Load existing logs + start streaming new ones
  useEffect(() => {
    // Load existing logs first
    window.api.readLogs(500).then((result) => {
      if (result?.success) {
        setStreamLines(result.entries || [])
      }
    }).catch(() => {}).finally(() => setLoading(false))

    // Start streaming new log lines
    window.api.startLogStream?.()
    const cleanup = window.api.onLogLine?.((line) => {
      setStreamLines((prev) => {
        const next = [...prev, line]
        return next.length > 1000 ? next.slice(-1000) : next
      })
    })

    return () => {
      cleanup?.()
      window.api.stopLogStream?.()
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (streamContainerRef.current) {
      streamContainerRef.current.scrollTop = streamContainerRef.current.scrollHeight
    }
  }, [streamLines])

  const handleClearLogs = async () => {
    try {
      await (window as any).momaiAPI?.privacy?.devReset?.()
      setStreamLines([])
    } catch {}
  }

  return (
    <div
      className="rounded-xl border border-border/40 overflow-hidden bg-card flex flex-col"
      style={{ height: '520px' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar/50">
        <h3 className="text-xs font-black text-text/80 uppercase tracking-widest">
          Logs do Sistema
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearLogs}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <TrashIcon className="w-3 h-3" />
            Limpar
          </button>
        </div>
      </div>

      <div
        ref={streamContainerRef}
        className="flex-1 overflow-y-auto bg-[#0d1117] p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all"
        style={{ fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace" }}
      >
        {loading && (
          <div className="text-text-muted/40 italic">Carregando logs...</div>
        )}
        {!loading && streamLines.length === 0 && (
          <div className="text-text-muted/40 italic">Nenhum log encontrado.</div>
        )}
        {streamLines.map((line, i) => (
          <div key={i} className="hover:bg-white/[0.02]">
            <span className="text-text-muted/40">{line.timestamp}</span>{' '}
            <span className={`${line.level === 'error' ? 'text-red-400' : line.level === 'warn' ? 'text-yellow-400' : 'text-text-muted/60'}`}>
              [{line.level.toUpperCase()}]
            </span>{' '}
            <span className="text-gray-300">{line.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
