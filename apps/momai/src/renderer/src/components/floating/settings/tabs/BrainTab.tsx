import { Settings } from '../../../../hooks/useSettingsCard'
import React, { useState, useEffect, useMemo } from 'react'
import { api } from '../../../../services/api'

interface BrainTabProps {
  t: any
  settings: Settings
  tiersConfig?: any
  updateField: (f: string, v: any, s?: boolean) => Promise<void>
}

function clampTokens(n: number) {
  return Math.max(1024, Math.min(16384, Math.round(n / 256) * 256))
}

export const BrainTab = React.memo(({ t, settings, tiersConfig, updateField }: BrainTabProps) => {
  const [memoryFiles, setMemoryFiles] = useState<Record<string, string>>({})
  const [savingFile, setSavingFile] = useState<string | null>(null)
  const [editingMemory, setEditingMemory] = useState<string | null>(null)

  const currentMode =
    settings.context_window_mode === 'max' ? 'medium' : settings.context_window_mode || 'min'
  const currentTokens = Number(settings.context_window_tokens || 4096)
  const modeTokens = useMemo(
    () => ({
      min: Math.floor(Number(tiersConfig?.[settings.ai_tier]?.ctx_size || 8192) / 2),
      medium: Number(tiersConfig?.[settings.ai_tier]?.ctx_size || 8192),
      max: Number(tiersConfig?.[settings.ai_tier]?.ctx_size || 8192) * 2
    }),
    [tiersConfig, settings.ai_tier]
  )
  const estimatedModelGb = useMemo(() => {
    const f = tiersConfig?.[settings.ai_tier]?.file || ''
    return f.includes('0.8B') ? 0.7 : f.includes('2B') ? 1.5 : 2.8
  }, [tiersConfig, settings.ai_tier])
  const estimatedCtxGb = (currentTokens / 8192) * 0.5

  const loadMemoryFile = async (name: string) => {
    try {
      const res = await api.get(`/memories/${name}`)
      setMemoryFiles((prev) => ({ ...prev, [name]: String(res?.data?.content || '') }))
    } catch {
      setMemoryFiles((prev) => ({ ...prev, [name]: '' }))
    }
  }
  const saveMemoryFile = async (name: string) => {
    setSavingFile(name)
    try {
      await api.post(`/memories/${name}`, { content: memoryFiles[name] || '' })
    } catch {}
    setSavingFile(null)
  }
  const resetMemoryFile = async (name: string) => {
    try {
      await api.delete(`/memories/${name}`)
      loadMemoryFile(name)
    } catch {}
  }
  useEffect(() => {
    loadMemoryFile('usuario')
    loadMemoryFile('persona')
    loadMemoryFile('conhecimento')
  }, [])

  const preview = (text: string) => {
    const s = text.trim()
    if (!s) return '(vazio)'
    return (
      s
        .split('\n')[0]
        .replace(/^#+\s*/, '')
        .trim()
        .slice(0, 60) || '(vazio)'
    )
  }

  return (
    <div className="space-y-5">
      {/* Memória */}
      <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">
        Memória
      </span>
      <div className="rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden">
        {[
          { key: 'usuario', label: 'Sobre o usuário' },
          { key: 'persona', label: 'Personalidade da IA' },
          { key: 'conhecimento', label: 'Conhecimento geral' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setEditingMemory(key)}
            className="flex items-center justify-between w-full p-4 border-b border-border/20 last:border-none text-left hover:bg-white/[0.02] transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-text">{label}</div>
              <div className="text-[11px] text-text-muted font-medium mt-0.5 truncate">
                {preview(memoryFiles[key] || '')}
              </div>
            </div>
            <span className="text-[10px] text-text-muted/50 ml-3 shrink-0">
              {(memoryFiles[key] || '').length}/2200
            </span>
          </button>
        ))}
      </div>

      {editingMemory && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setEditingMemory(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] bg-zinc-900 border border-border/30 rounded-2xl shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/10">
              <span className="text-sm font-semibold text-text capitalize">{editingMemory}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => resetMemoryFile(editingMemory)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-text-muted hover:text-red-400 border border-border/20 hover:border-red-400/30 transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => saveMemoryFile(editingMemory)}
                  disabled={savingFile === editingMemory}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-colors disabled:opacity-50"
                >
                  {savingFile === editingMemory ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  onClick={() => setEditingMemory(null)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  <svg
                    className="w-4 h-4 text-text-muted"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <textarea
              value={memoryFiles[editingMemory] || ''}
              autoFocus
              onChange={(e) =>
                setMemoryFiles((prev) => ({ ...prev, [editingMemory]: e.target.value }))
              }
              className="flex-1 min-h-[300px] bg-transparent p-5 text-sm text-text font-mono leading-relaxed outline-none resize-none"
            />
            <div className="px-5 py-2 border-t border-border/10 text-[10px] text-text-muted/50">
              {(memoryFiles[editingMemory] || '').length}/2200
            </div>
          </div>
        </div>
      )}

      {/* Contexto */}
      <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">
        Contexto
      </span>
      <div className="rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-text">Janela de Contexto</div>
            <div className="text-[11px] text-text-muted font-medium mt-0.5">
              {(estimatedModelGb + estimatedCtxGb).toFixed(2)} GB total ·{' '}
              {estimatedModelGb.toFixed(1)} GB modelo + {estimatedCtxGb.toFixed(2)} GB ctx
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <div className="relative">
              <select
                value={currentMode}
                onChange={async (e) => {
                  const mode = e.target.value as 'min' | 'medium' | 'custom'
                  await updateField('context_window_mode', mode, true)
                  if (mode !== 'custom')
                    await updateField('context_window_tokens', modeTokens[mode], true)
                }}
                className="bg-zinc-800 border border-border/30 rounded-lg pl-3 pr-7 py-1.5 text-xs text-text outline-none focus:border-accent/40 cursor-pointer min-w-[90px]"
              >
                <option value="min">Mínimo</option>
                <option value="medium">Médio</option>
                <option value="custom">Custom</option>
              </select>
              <svg
                className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted/50 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            <input
              type="number"
              min={1024}
              max={16384}
              step={256}
              value={currentTokens}
              onChange={(e) => {
                const n = clampTokens(Number(e.target.value))
                updateField('context_window_mode', 'custom', true)
                updateField('context_window_tokens', n, true)
              }}
              className="w-20 bg-zinc-800 border border-border/30 rounded-lg px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent/40 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        </div>
      </div>
    </div>
  )
})
BrainTab.displayName = 'BrainTab'
