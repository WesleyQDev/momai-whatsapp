import { useState, useEffect, useMemo } from 'react'
import { FunnelIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import FloatingCard from './FloatingCard'

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

interface LogsCardProps {
  onClose: () => void
}

export default function LogsCard({ onClose }: LogsCardProps) {
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
    <FloatingCard title="Logs do Sistema" onClose={onClose} width="max-w-5xl">
      <div className="flex h-[600px] -mx-6 -my-6 bg-card">
        {/* Sidebar de Filtros */}
        <div className="w-48 border-r border-border bg-sidebar p-4 flex flex-col gap-3">
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

          <div className="flex-1" />

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            Atualizar
          </button>
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
    </FloatingCard>
  )
}
