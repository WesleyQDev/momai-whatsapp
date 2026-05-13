import { useState, useEffect, useMemo } from 'react'
import { FunnelIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

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
}

export default function DeveloperTab({ t, handleDevMode }: DeveloperTabProps) {
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
    () => localStorage.getItem('momai_logs_enabled') !== 'false'
  )

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
      window.removeEventListener('momai_observability_sync', handleObservabilitySync as EventListener)
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
              <svg className="shrink-0 text-accent" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="10" x2="16" y2="10" />
                <line x1="8" y1="14" x2="12" y2="14" />
                <circle cx="6" cy="10" r="0.5" fill="currentColor" />
                <circle cx="6" cy="14" r="0.5" fill="currentColor" />
              </svg>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-text">Logs do Sistema</span>
                <span className="text-[11px] text-text-muted font-medium">Visualize logs detalhados em tempo real.</span>
              </div>
            </div>
            <button
              data-testid="logs-toggle"
              onClick={() => { const next = !logsEnabled; setLogsEnabled(next); localStorage.setItem('momai_logs_enabled', String(next)) }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${logsEnabled ? 'bg-accent/80' : 'bg-white/10'}`}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${logsEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 border-b border-border/20">
            <div className="flex items-center gap-3 min-w-0">
              <svg className="shrink-0 text-accent" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10M18 20V4M6 20v-4" />
              </svg>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-text">Observabilidade de IA</span>
                <span className="text-[11px] text-text-muted font-medium">Monitore chamadas ao LLM em tempo real.</span>
              </div>
            </div>
            <button
              data-testid="observability-toggle"
              onClick={() => { const next = !observabilityEnabled; setObservabilityEnabled(next); localStorage.setItem('momai_observability_enabled', String(next)); window.dispatchEvent(new CustomEvent('momai_observability_sync', { detail: next })) }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${observabilityEnabled ? 'bg-accent/80' : 'bg-white/10'}`}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${observabilityEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              <svg className="shrink-0 text-accent" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-text">Ver contexto total usado</span>
                <span className="text-[11px] text-text-muted font-medium">Mostra no chat uma circunferência com contexto usado e restante.</span>
              </div>
            </div>
            <button
              onClick={() => { const next = !showContextRing; localStorage.setItem('momai_show_context_ring', String(next)); window.dispatchEvent(new CustomEvent('momai_context_ring_sync', { detail: next })); setShowContextRing(next) }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showContextRing ? 'bg-accent/80' : 'bg-white/10'}`}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showContextRing ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>
      )}

      {isDevMode && logsEnabled && <LogsPanel />}
    </div>
  )
}

function LogsPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterLevel, setFilterLevel] = useState<string>('all')
  const [filterComponent, setFilterComponent] = useState<string>('all')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const result = await window.api.readLogs(300)
      if (result?.success) {
        setEntries(result.entries || [])
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    let interval: NodeJS.Timeout | null = null
    if (autoRefresh) {
      interval = setInterval(fetchLogs, 2000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh])

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterLevel !== 'all' && e.level !== filterLevel) return false
      if (filterComponent !== 'all' && e.component !== filterComponent) return false
      return true
    })
  }, [entries, filterLevel, filterComponent])

  const groupedByComponent = useMemo(() => {
    const groups: Record<string, LogEntry[]> = {}
    filteredEntries.forEach((e) => {
      if (!groups[e.component]) groups[e.component] = []
      groups[e.component].push(e)
    })
    return groups
  }, [filteredEntries])

  const components = Object.keys(COMPONENT_META)

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
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
              autoRefresh ? 'bg-green-500/20 text-green-400' : 'bg-text/5 text-text-muted'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-400 animate-pulse' : 'bg-text-muted'}`}
            />
            Auto-refresh
          </button>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar de Filtros */}
        <div className="w-48 border-r border-border bg-sidebar p-4 flex flex-col gap-3 shrink-0">
          <div className="flex items-center gap-2 text-sm font-bold text-text-muted mb-2">
            <FunnelIcon className="w-4 h-4" />
            Filtros
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-text-muted/50 uppercase">Nível</span>
            {['all', 'debug', 'info', 'warn', 'error'].map((level) => (
              <button
                key={level}
                onClick={() => setFilterLevel(level)}
                className={`text-left px-2 py-1 rounded text-xs font-mono transition-colors ${
                  filterLevel === level
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-muted hover:bg-text/5 hover:text-text'
                }`}
              >
                {level === 'all' ? 'Todos' : level.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1 mt-3">
            <span className="text-xs font-bold text-text-muted/50 uppercase">Componente</span>
            {['all', ...components].map((comp) => (
              <button
                key={comp}
                onClick={() => setFilterComponent(comp)}
                className={`text-left px-2 py-1 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                  filterComponent === comp
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-muted hover:bg-text/5 hover:text-text'
                }`}
              >
                {comp !== 'all' && (
                  <span className={COMPONENT_META[comp]?.color}>{COMPONENT_META[comp]?.icon}</span>
                )}
                {comp === 'all' ? 'Todos' : COMPONENT_META[comp]?.label || comp}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo Principal - Tabelas por Componente */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              Carregando logs...
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedByComponent).map(([component, logs]) => {
                const meta = COMPONENT_META[component] || COMPONENT_META.system
                return (
                  <div
                    key={component}
                    className="bg-zinc-900/50 rounded-xl border border-border/20 overflow-hidden"
                  >
                    <div
                      className={`flex items-center gap-2 px-4 py-3 bg-zinc-900 border-b border-border/20`}
                    >
                      <span className={`text-lg ${meta.color}`}>{meta.icon}</span>
                      <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
                      <span className="ml-auto text-xs text-text-muted">{logs.length} eventos</span>
                    </div>
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-border/10">
                          <th className="px-4 py-2 text-left text-text-muted/50 font-bold">Time</th>
                          <th className="px-4 py-2 text-left text-text-muted/50 font-bold">
                            Level
                          </th>
                          <th className="px-4 py-2 text-left text-text-muted/50 font-bold">
                            Message
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs
                          .slice(-20)
                          .reverse()
                          .map((entry, idx) => (
                            <tr
                              key={idx}
                              className="border-b border-border/5 hover:bg-white/[0.02] transition-colors"
                            >
                              <td className="px-4 py-2 text-text-muted whitespace-nowrap">
                                {entry.timestamp}
                              </td>
                              <td
                                className={`px-4 py-2 font-bold ${LEVEL_COLORS[entry.level] || ''}`}
                              >
                                <span className="mr-1">{LEVEL_ICONS[entry.level]}</span>
                                {entry.level.toUpperCase()}
                              </td>
                              <td className="px-4 py-2 text-zinc-300 truncate max-w-md">
                                {entry.message}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}

              {Object.keys(groupedByComponent).length === 0 && (
                <div className="text-center text-text-muted text-sm py-10">
                  Nenhum log encontrado para os filtros selecionados
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
