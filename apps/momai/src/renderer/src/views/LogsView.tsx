import { useState, useEffect, useRef, useCallback } from 'react'

const LEVEL_OPTIONS = [
  { key: 'all', label: 'Todos' },
  { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warn' },
  { key: 'error', label: 'Error' },
  { key: 'other', label: 'Outros' }
]

const LEVEL_COLOR: Record<string, string> = {
  ERROR: 'text-red-400 font-bold',
  WARN: 'text-yellow-400 font-bold',
  INFO: 'text-blue-400',
  info: 'text-blue-400',
  warn: 'text-yellow-400 font-bold',
  error: 'text-red-400 font-bold'
}

export default function LogsView() {
  const [lines, setLines] = useState<string[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)

  // Merge continuation lines (no leading [) into previous line (stack traces)
  function mergeLines(raw: string[]): string[] {
    const merged: string[] = []
    for (const line of raw) {
      if (line.startsWith('[')) {
        merged.push(line)
      } else {
        if (merged.length > 0) merged[merged.length - 1] += '\n' + line
        else merged.push(line)
      }
    }
    return merged
  }

  useEffect(() => {
    window.api.readLogs(500).then((r) => {
      if (r?.success) {
        const raw = (r.entries || []).map((e: any) => e.raw || '').filter(Boolean)
        setLines(mergeLines(raw))
      }
    }).catch(() => {}).finally(() => setLoading(false))

    window.api.startLogStream?.()
    const cleanup = window.api.onLogLine?.((line: any) => {
      setLines((prev) => {
        const next = mergeLines([...prev, line.raw || ''])
        return next.length > 2000 ? next.slice(-2000) : next
      })
    })

    return () => {
      cleanup?.()
      window.api.stopLogStream?.()
    }
  }, [])

  // Only auto-scroll if user hasn't scrolled up
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  useEffect(() => {
    if (autoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function hasErr(raw: string): boolean {
    return /err|erro/i.test(raw)
  }

  function lineLevel(raw: string): string | null {
    const matches = [...raw.matchAll(/\[(info|warn|error)\]/gi)]
    if (matches.length === 0) return hasErr(raw) ? 'error' : null
    const last = matches.length === 1 ? matches[0] : matches[matches.length - 1]
    return last[1].toLowerCase()
  }

  function lineClass(raw: string): string {
    if (hasErr(raw)) return 'text-red-400'
    return ''
  }

  const filtered = filter === 'all' ? lines : lines.filter((l) => {
    const level = lineLevel(l)
    if (filter === 'error') return level === 'error' || hasErr(l)
    if (filter === 'warn') return level === 'warn'
    if (filter === 'other') return level === null && !hasErr(l)
    return level === filter
  })

  const activeLabel = LEVEL_OPTIONS.find((o) => o.key === filter)?.label || 'Filtrar'

  function colorizeLine(raw: string) {
    const hasLevel = /\[(info|warn|error)\]/i.test(raw)
    const parts: { text: string; color?: string }[] = []
    if (!hasLevel) {
      // No level tag — colorize all [...] tags yellow
      const tagRe = /\[([^\]]+)\]/g
      let last = 0
      let t: RegExpExecArray | null
      while ((t = tagRe.exec(raw)) !== null) {
        if (t.index > last) parts.push({ text: raw.slice(last, t.index) })
        parts.push({ text: t[0], color: 'text-cyan-400' })
        last = t.index + t[0].length
      }
      if (last < raw.length) parts.push({ text: raw.slice(last) })
    } else {
      // Has level tag — only colorize INFO/WARN/ERROR tags
      const regex = /\[(INFO|WARN|ERROR)\]/gi
      let last = 0
      let m: RegExpExecArray | null
      while ((m = regex.exec(raw)) !== null) {
        if (m.index > last) parts.push({ text: raw.slice(last, m.index) })
        parts.push({ text: m[0], color: LEVEL_COLOR[m[1].toLowerCase()] || '' })
        last = m.index + m[0].length
      }
      if (last < raw.length) parts.push({ text: raw.slice(last) })
    }
    return parts
  }

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/10 bg-sidebar/30 shrink-0">
        <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="12" y2="14" /></svg>
        <span className="text-xs font-bold text-text/60 uppercase tracking-wider">Logs</span>
        <div className="ml-auto relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold bg-white/[0.04] hover:bg-white/[0.08] border border-border/20 text-text-muted hover:text-text transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            {activeLabel}
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-[#1a1b1e] border border-border/30 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
              {LEVEL_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setFilter(opt.key); setFilterOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-[12px] font-medium transition-colors flex items-center gap-2 ${
                    filter === opt.key
                      ? opt.key === 'error' ? 'text-red-400 bg-red-500/10'
                        : opt.key === 'warn' ? 'text-yellow-400 bg-yellow-500/10'
                        : opt.key === 'info' ? 'text-blue-400 bg-blue-500/10'
                        : opt.key === 'other' ? 'text-cyan-400 bg-cyan-500/10'
                        : 'text-accent bg-accent/10'
                      : 'text-text-muted hover:text-text hover:bg-white/[0.04]'
                  }`}
                >
                  {opt.key !== 'all' && (
                    <span className={`w-1.5 h-1.5 rounded-full ${opt.key === 'error' ? 'bg-red-400' : opt.key === 'warn' ? 'bg-yellow-400' : opt.key === 'info' ? 'bg-blue-400' : 'bg-cyan-400'}`} />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        onContextMenu={(e) => e.stopPropagation()}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-[#0d1117] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all select-text"
        style={{ fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace" }}
      >
        {loading && <div className="text-text-muted/40 italic p-2">Carregando...</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-text-muted/40 italic p-2">Nenhum log.</div>
        )}
        {filtered.map((raw, i) => {
          const cls = lineClass(raw)
          const isErrStyle = cls === 'text-red-400'
          return (
            <div key={i} className="hover:bg-white/[0.02] px-1.5 py-0.5">
              {isErrStyle ? (
                <span className={cls}>{raw}</span>
              ) : (
                colorizeLine(raw).map((part, j) =>
                  part.color ? <span key={j} className={part.color}>{part.text}</span> : <span key={j} className="text-gray-400">{part.text}</span>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
