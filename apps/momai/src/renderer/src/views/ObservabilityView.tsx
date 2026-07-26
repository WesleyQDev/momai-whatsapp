import { useState, useEffect, useRef } from 'react'
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
  content?: string
  fallback_msg?: string
  assembled_text?: string
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function ObservabilityView({ initialTraces }: { initialTraces?: Trace[] } = {}) {
  const [traces, setTraces] = useState<Trace[]>(() => {
    const stored = getTraces()
    return stored.length ? stored : initialTraces || []
  })
  const [selected, setSelected] = useState<Trace | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let cancelled = false
    const fetchTraces = async () => {
      try {
        const res = await window.api.apiFetch(`${API_URL}/observability/traces`)
        if (res.ok) {
          const data = await res.json()
          if (data?.traces?.length && !cancelled) {
            setTraces(data.traces)
            data.traces.forEach((t: any) => getTraces().push(t))
            if (getTraces().length > 50) getTraces().length = 50
          }
        }
      } catch {}
    }
    fetchTraces()
    pollTimer = setInterval(fetchTraces, 2000)
    const handler = (event: Event) => {
      const trace = (event as CustomEvent<Trace>).detail
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

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
  }, [selected])

  const lastUserMsg = (trace: Trace): string => {
    if (trace.content) return trace.content
    if (trace.messages) {
      const user = [...trace.messages].reverse().find((m) => m.role === 'user')
      if (user) return user.content
    }
    return ''
  }

  const totalToolTime = (trace: Trace): number =>
    trace.tool_calls?.reduce((acc, tc) => acc + (tc.duration_ms || 0), 0) || 0

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="flex items-center gap-2.5 px-4 h-10 border-b border-border/8 bg-sidebar/40 shrink-0">
        <span className="text-xs font-semibold text-text/70">Observabilidade</span>
        <span className="text-[10px] text-text-muted/40 ml-auto">{traces.length} registros</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r border-border/8 overflow-y-auto shrink-0 bg-sidebar/20">
          {traces.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-text-muted/40 px-4 text-center leading-relaxed">
              Faça uma pergunta para começar.
            </div>
          ) : (
            <div>
              {traces.map((trace) => (
                <button
                  key={trace.id}
                  onClick={() => setSelected(selected?.id === trace.id ? null : trace)}
                  className={`w-full text-left px-4 py-3 transition-colors border-b border-border/5 ${
                    selected?.id === trace.id ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${
                        trace.status === 'error'
                          ? 'bg-red-400'
                          : trace.type === 'skill'
                            ? 'bg-emerald-400'
                            : 'bg-blue-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-text truncate">
                        {lastUserMsg(trace).slice(0, 60) || '(vazio)'}
                      </p>
                      <p className="text-[10px] text-text-muted/30 mt-0.5">
                        {formatTime(trace.timestamp)}
                        <span className="mx-1">·</span>
                        {formatDuration(trace.total_duration)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto" ref={containerRef}>
          {!selected ? (
            <div className="flex items-center justify-center h-full text-xs text-text-muted/40">
              Selecione um registro
            </div>
          ) : (
            <div className="px-6 py-5 lg:max-w-4xl lg:mx-auto">
              {/* User Message */}
              <div className="mb-6">
                <div className="text-xs font-medium text-text-muted/50 mb-2">Usuário</div>
                <div className="text-sm text-text leading-relaxed">
                  {lastUserMsg(selected) || '(vazio)'}
                </div>
              </div>

              <Divider />

              {/* System Prompt */}
              {selected.system_prompt && (
                <>
                  <div className="mb-4">
                    <div className="text-xs font-medium text-text-muted/50 mb-2">System Prompt</div>
                    <div className="text-xs text-text-muted/70 font-mono leading-relaxed whitespace-pre-wrap">
                      {selected.system_prompt}
                    </div>
                  </div>
                  <Divider />
                </>
              )}

              {/* Messages */}
              {selected.messages && selected.messages.length > 0 && (
                <>
                  <div className="mb-4">
                    <div className="text-xs font-medium text-text-muted/50 mb-2">
                      Mensagens ({selected.messages.length})
                    </div>
                    <div className="space-y-1">
                      {selected.messages.map((msg, i) => (
                        <div
                          key={i}
                          className={`text-sm px-3 py-2 rounded-lg leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-blue-500/5'
                              : msg.role === 'tool'
                                ? 'bg-emerald-500/5'
                                : ''
                          }`}
                        >
                          <span className="text-[10px] font-semibold text-text-muted/40 uppercase mr-2">
                            {msg.role}
                          </span>
                          <span className="text-text/80">{msg.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Divider />
                </>
              )}

              {/* Tools */}
              {selected.tool_calls && selected.tool_calls.length > 0 && (
                <>
                  <div className="mb-4">
                    <div className="text-xs font-medium text-text-muted/50 mb-2">
                      Tools ({selected.tool_calls.length})
                    </div>
                    <div className="space-y-2">
                      {selected.tool_calls.map((tc, i) => (
                        <div key={i} className="border border-border/8 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] border-b border-border/8">
                            <svg
                              className="w-3.5 h-3.5 text-accent shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                            </svg>
                            <span className="text-xs font-semibold text-accent">
                              {tc.tool_name}
                            </span>
                            {tc.duration_ms != null && (
                              <span className="ml-auto text-[10px] text-text-muted/50 tabular-nums">
                                {formatDuration(tc.duration_ms)}
                              </span>
                            )}
                          </div>
                          {tc.args && Object.keys(tc.args).length > 0 && (
                            <div className="px-3 py-2 border-b border-border/5">
                              <div className="text-[10px] text-text-muted/40 mb-0.5">Args</div>
                              <pre className="text-xs text-text-muted/70 font-mono">
                                {JSON.stringify(tc.args)}
                              </pre>
                            </div>
                          )}
                          {tc.result && (
                            <div className="px-3 py-2">
                              <div className="text-[10px] text-text-muted/40 mb-0.5">Resultado</div>
                              <pre className="text-xs text-text-muted/70 font-mono whitespace-pre-wrap max-h-20 overflow-y-auto">
                                {tc.result}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Divider />
                </>
              )}

              {/* Response */}
              {selected.response && (
                <>
                  <div className="mb-4">
                    <div className="text-xs font-medium text-text-muted/50 mb-2">Resposta</div>
                    <div className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                      {selected.response}
                    </div>
                  </div>
                  <Divider />
                </>
              )}

              {/* Error */}
              {selected.status === 'error' && (
                <>
                  <div className="mb-4 px-3 py-2 bg-red-500/5 border border-red-500/15 rounded-lg">
                    <div className="text-xs font-semibold text-red-400 mb-0.5">Erro</div>
                    <p className="text-sm text-red-300/90">
                      {selected.error || 'Erro desconhecido'}
                    </p>
                  </div>
                  <Divider />
                </>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="border border-border/8 rounded-lg p-3">
                  <div className="text-xs font-medium text-text-muted/50 mb-2">Tempos</div>
                  <div className="space-y-1">
                    {[
                      ['Pre-LLM', selected.pre_llm_duration],
                      ['First Token', selected.first_token_duration],
                      ['Geração', selected.generation_duration]
                    ].map(([label, value]) =>
                      value != null ? (
                        <div key={label as string} className="flex items-center justify-between">
                          <span className="text-xs text-text-muted/60">{label as string}</span>
                          <span className="text-xs text-text font-mono tabular-nums">
                            {formatDuration(value as number)}
                          </span>
                        </div>
                      ) : null
                    )}
                    {selected.tool_calls && selected.tool_calls.length > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted/60">Tools</span>
                        <span className="text-xs text-text font-mono tabular-nums">
                          {formatDuration(totalToolTime(selected))}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1 mt-1 border-t border-border/8">
                      <span className="text-xs text-text-muted">Total</span>
                      <span className="text-xs text-text font-mono tabular-nums font-semibold">
                        {formatDuration(selected.total_duration)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border border-border/8 rounded-lg p-3">
                  <div className="text-xs font-medium text-text-muted/50 mb-2">Tokens</div>
                  <div className="space-y-1">
                    {[
                      ['Prompt', selected.estimated_prompt_tokens],
                      ['Gerados', selected.generated_tokens]
                    ].map(([label, value]) => (
                      <div key={label as string} className="flex items-center justify-between">
                        <span className="text-xs text-text-muted/60">{label as string}</span>
                        <span className="text-xs text-text font-mono tabular-nums">
                          {value ?? '-'}
                        </span>
                      </div>
                    ))}
                    {selected.tokens_per_second > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted/60">Velocidade</span>
                        <span className="text-xs text-text font-mono tabular-nums">
                          {selected.tokens_per_second.toFixed(1)} tok/s
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1 mt-1 border-t border-border/8">
                      <span className="text-xs text-text-muted">Total</span>
                      <span className="text-xs text-text font-mono tabular-nums font-semibold">
                        {selected.total_tokens}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-1.5 text-[10px] text-text-muted/30 pb-4">
                <span>{selected.model}</span>
                <span>·</span>
                <span>{selected.tier}</span>
                <span>·</span>
                <span>{formatTime(selected.timestamp)}</span>
                {selected.thread_id && (
                  <>
                    <span>·</span>
                    <span>#{selected.thread_id.slice(0, 8)}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-border/5 mb-4" />
}
