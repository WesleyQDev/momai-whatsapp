import { useState, useEffect } from 'react'
import { getTraces, subscribe } from '../stores/observabilityStore'
import { API_URL } from '../constants'

interface ToolCall {
  tool_name: string
  args: Record<string, unknown>
  result?: string
  duration_ms?: number
}

interface Trace {
  id: string
  timestamp: number
  type: 'llm_call' | 'skill' | 'fallback'
  total_duration: number
  pre_llm_duration?: number
  first_token_duration?: number
  generation_duration?: number
  system_prompt?: string
  messages?: { role: string; content: string }[]
  response?: string
  tokens_per_second: number
  total_tokens: number
  estimated_prompt_tokens?: number
  generated_tokens?: number
  model: string
  tier: string
  tools_count?: number
  tool_calls?: ToolCall[]
  active_skill?: string
  thread_id: string
  status: 'success' | 'error'
  error?: string
}

interface ObservabilityViewProps {
  initialTraces?: Trace[]
}

const TYPE_ICONS: Record<string, string> = { llm_call: '🤖', skill: '⚡', fallback: '⚠' }
const TYPE_COLORS: Record<string, string> = {
  llm_call: 'text-blue-400',
  skill: 'text-green-400',
  fallback: 'text-yellow-400'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function TokenSpeedBar({ speed, maxSpeed }: { speed: number; maxSpeed: number }) {
  const pct = maxSpeed > 0 ? Math.min(100, (speed / maxSpeed) * 100) : 0
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-muted w-10 text-right tabular-nums">{speed}</span>
    </div>
  )
}

function TrendGraph({ traces }: { traces: Trace[] }) {
  const llmTraces = traces
    .filter((t) => t.type === 'llm_call' && t.tokens_per_second > 0)
    .slice(-30)
  if (llmTraces.length < 2) return null

  const maxTps = Math.max(...llmTraces.map((t) => t.tokens_per_second))
  const w = 160
  const h = 40
  const points = llmTraces
    .map((t, i) => {
      const x = (i / (llmTraces.length - 1)) * w
      const y = h - (t.tokens_per_second / maxTps) * h
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="bg-white/5 rounded-xl p-4 mx-4 mt-4">
      <div className="text-sm text-text-muted mb-2">
        Token Speed (tok/s) — últimos {llmTraces.length}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[200px] h-10">
        <polyline fill="none" stroke="rgb(99,102,241)" strokeWidth="2" points={points} />
      </svg>
    </div>
  )
}

function TraceDetail({ trace, maxTps }: { trace: Trace; maxTps: number }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b border-white/5 last:border-none">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <span className={TYPE_COLORS[trace.type]}>{TYPE_ICONS[trace.type]}</span>
        <span className="text-xs text-text-muted w-10">{formatTime(trace.timestamp)}</span>
        <span className="text-xs text-text-muted w-16">
          {trace.type === 'llm_call' ? 'LLM' : trace.active_skill || trace.type}
        </span>
        <span className="text-xs text-text-muted w-16">{formatDuration(trace.total_duration)}</span>
        {trace.type === 'llm_call' && (
          <div className="flex-1">
            <TokenSpeedBar speed={trace.tokens_per_second} maxSpeed={maxTps} />
          </div>
        )}
        <span className="text-xs text-text-muted w-14 tabular-nums">
          {trace.total_tokens || '-'}
        </span>
        <span className="text-xs text-text-muted">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3 animate-fade-in">
          {trace.status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
              Error: {trace.error || 'Unknown error'}
            </div>
          )}

          {trace.system_prompt && (
            <div>
              <div className="text-xs text-text-muted mb-1">
                ▶ System Prompt ({trace.estimated_prompt_tokens || 0} tokens)
              </div>
              <pre className="text-xs text-text bg-white/5 rounded-lg p-3 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                {trace.system_prompt.slice(0, 2000)}
              </pre>
            </div>
          )}

          {trace.messages && trace.messages.length > 0 && (
            <div>
              <div className="text-xs text-text-muted mb-1">
                ▶ Messages ({trace.messages.length})
              </div>
              <div className="space-y-1">
                {trace.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-xs rounded-lg p-2 ${msg.role === 'user' ? 'bg-blue-500/10' : msg.role === 'tool' ? 'bg-green-500/10' : 'bg-white/5'}`}
                  >
                    <span className="font-bold text-text-muted">{msg.role}: </span>
                    <span className="text-text">{msg.content.slice(0, 300)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-text-muted mb-1">▶ Timing</div>
            <div className="bg-white/5 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">├─ Pre-LLM</span>
                <span className="text-text">{formatDuration(trace.pre_llm_duration || 0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">├─ First Token</span>
                <span className="text-text">{formatDuration(trace.first_token_duration || 0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">├─ Generation</span>
                <span className="text-text">{formatDuration(trace.generation_duration || 0)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold border-t border-white/10 pt-1 mt-1">
                <span className="text-text-muted">└─ Total</span>
                <span className="text-text">{formatDuration(trace.total_duration)}</span>
              </div>
            </div>
          </div>

          {trace.tool_calls && trace.tool_calls.length > 0 && (
            <div>
              <div className="text-xs text-text-muted mb-1">
                ▶ Tools ({trace.tool_calls.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-muted border-b border-white/10">
                      <th className="text-left py-1 pr-2">Tool</th>
                      <th className="text-left py-1 pr-2">Args</th>
                      <th className="text-left py-1 pr-2">Duration</th>
                      <th className="text-left py-1">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trace.tool_calls.map((tc, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="py-1 pr-2 text-accent">{tc.tool_name}</td>
                        <td className="py-1 pr-2 text-text-muted font-mono max-w-[120px] truncate">
                          {JSON.stringify(tc.args)}
                        </td>
                        <td className="py-1 pr-2 text-text-muted">
                          {tc.duration_ms ? formatDuration(tc.duration_ms) : '-'}
                        </td>
                        <td className="py-1 text-text-muted max-w-[120px] truncate">
                          {tc.result || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ObservabilityView({ initialTraces }: ObservabilityViewProps) {
  const [traces, setTraces] = useState<Trace[]>(() => {
    const stored = getTraces()
    return stored.length ? stored : initialTraces || []
  })
  const [filter, setFilter] = useState<'all' | 'llm_call' | 'skill' | 'error'>('all')
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/observability/stats`)
        if (res.ok && !cancelled) setStats(await res.json())
      } catch (_) {}
    }
    fetchStats()
    const interval = setInterval(fetchStats, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    console.debug('[observability] Component mounted, store has', getTraces().length, 'traces')

    // Poll traces from HTTP endpoint (fallback when WS is down)
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const fetchTraces = async () => {
      try {
        const res = await fetch(`${API_URL}/observability/traces`)
        if (res.ok) {
          const data = await res.json()
          if (data?.traces?.length && !cancelled) {
            setTraces(data.traces)
            // Sync into store so other components see them
            data.traces.forEach((t: any) => getTraces().push(t))
            if (getTraces().length > 50) getTraces().length = 50
          }
        }
      } catch (_) {
        /* server not ready yet */
      }
    }

    fetchTraces()
    pollTimer = setInterval(fetchTraces, 2000)

    const handler = (event: Event) => {
      const trace = (event as CustomEvent<Trace>).detail
      console.debug('[observability] CustomEvent received:', trace?.id, trace?.status)
      setTraces((prev) => [trace, ...prev].slice(0, 50))
    }
    window.addEventListener('momai_observability_trace', handler as EventListener)

    const unsub = subscribe((trace: any) => {
      setTraces((prev) => [trace, ...prev].slice(0, 50))
    })

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
      window.removeEventListener('momai_observability_trace', handler as EventListener)
      unsub()
    }
  }, [])

  const filteredTraces = traces
    .filter((t) => {
      if (filter === 'error') return t.status === 'error'
      if (filter !== 'all') return t.type === filter
      return true
    })
    .filter((t) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        t.model?.toLowerCase().includes(q) ||
        t.active_skill?.toLowerCase().includes(q) ||
        t.tool_calls?.some((tc) => tc.tool_name.toLowerCase().includes(q)) ||
        t.response?.toLowerCase().includes(q) ||
        t.messages?.some((m) => m.content.toLowerCase().includes(q))
      )
    })

  const llmTraces = traces.filter((t) => t.type === 'llm_call' && t.tokens_per_second > 0)
  const maxDisplayTps = Math.max(
    ...filteredTraces
      .filter((t) => t.type === 'llm_call' && t.tokens_per_second > 0)
      .map((t) => t.tokens_per_second),
    1
  )

  return (
    <div className="w-full h-full flex flex-col bg-bg text-text">
      <div className="p-4 border-b border-white/5">
        <h2 className="text-lg font-semibold mb-1">Observabilidade</h2>
        <p className="text-xs text-text-muted">Monitoramento de chamadas ao LLM em tempo real</p>
      </div>

      {llmTraces.length >= 2 && <TrendGraph traces={llmTraces} />}

      {stats && stats.total > 0 && (
        <div className="mx-4 mt-3 p-3 bg-white/5 rounded-xl">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-text-muted">{stats.total} chamadas</span>
            <span className="text-text-muted">·</span>
            <span className="text-text">
              Média: <strong>{stats.avg_tps}</strong> tok/s
            </span>
            <span className="text-text-muted">·</span>
            <span className="text-text">{stats.avg_duration}ms / chamada</span>
            <span className="text-text-muted">·</span>
            <span className="text-text">{stats.avg_tokens} tokens / chamada</span>
          </div>
          {stats.trend && (
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-text-muted">Tendência (últimos 10 vs anteriores):</span>
              <span className={stats.trend.improving ? 'text-green-400' : 'text-red-400'}>
                {stats.trend.recent_avg_tps} vs {stats.trend.previous_avg_tps} tok/s (
                {stats.trend.change_pct > 0 ? '+' : ''}
                {stats.trend.change_pct}%)
                {stats.trend.improving ? ' ↑' : ' ↓'}
              </span>
            </div>
          )}
          {stats.by_hour && stats.by_hour.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-text-muted mb-1">Últimas horas</div>
              <div className="flex items-end gap-1 h-8">
                {stats.by_hour.slice(-12).map((h: any, i: number) => {
                  const maxTps = Math.max(...stats.by_hour.map((x: any) => x.avg_tps), 1)
                  const pct = (h.avg_tps / maxTps) * 100
                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center gap-0.5"
                      title={`${h.hour}h: ${h.avg_tps} tok/s (${h.count} chamadas)`}
                    >
                      <div
                        className="w-full bg-accent/20 rounded-t"
                        style={{ height: `${Math.max(pct, 5)}%` }}
                      />
                      <span className="text-[9px] text-text-muted">{h.hour}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5">
        {(['all', 'llm_call', 'skill', 'error'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${filter === f ? 'bg-accent/20 text-accent' : 'bg-white/5 text-text-muted hover:bg-white/10'}`}
          >
            {f === 'all' ? 'Todas' : f === 'llm_call' ? 'LLM' : f === 'skill' ? 'Skills' : 'Erros'}
          </button>
        ))}
        <div className="flex-1" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-text placeholder-text-muted w-32 focus:outline-none focus:border-accent/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filteredTraces.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            {traces.length === 0
              ? 'Nenhum trace ainda. Faça uma pergunta à MomAI para começar.'
              : 'Nenhum resultado para este filtro.'}
          </div>
        ) : (
          <div>
            {filteredTraces.map((trace) => (
              <TraceDetail key={trace.id} trace={trace} maxTps={maxDisplayTps} />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/5 text-xs text-text-muted flex items-center">
        <span>{traces.length} traces coletados</span>
        <span className="mx-2">·</span>
        <span>
          {llmTraces.length > 0
            ? `Média: ${(llmTraces.reduce((a, t) => a + t.tokens_per_second, 0) / llmTraces.length).toFixed(1)} tok/s`
            : 'Aguardando dados...'}
        </span>
      </div>
    </div>
  )
}
