import React, { useMemo, useState } from 'react'
import { API_URL } from '../../constants'

type DevConfirmationData = {
  mutationId: string
  action: string
  path: string
  summary?: string
  preview?: string
  details?: {
    objective?: string
    topic?: string
    kind?: string
    routes?: string[]
    knowledgeHints?: string[]
    estimatedLines?: number
    estimatedChars?: number
  } | null
  endpoint?: string
}

const DevConfirmationCard = ({ data }: { data?: DevConfirmationData }) => {
  const [loading, setLoading] = useState<'confirm' | 'cancel' | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  const endpoint = data?.endpoint || '/extensions/dev/action'
  const disabled = !data?.mutationId || !!loading

  const actionLabel = useMemo(() => {
    if (!data?.action) return 'mutação'
    if (data.action === 'dev_write') return 'escrita'
    if (data.action === 'dev_patch') return 'patch'
    if (data.action === 'dev_delete') return 'remoção'
    return data.action
  }, [data?.action])

  const execute = async (action: 'confirm_mutation' | 'cancel_mutation') => {
    if (!data?.mutationId) return
    setLoading(action === 'confirm_mutation' ? 'confirm' : 'cancel')
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          payload: { mutationId: data.mutationId }
        })
      })
      const result = await response.json().catch(() => ({}))
      const ok = Boolean(result?.ok ?? response.ok)
      setStatus({ ok, message: String(result?.message || (ok ? 'Ação concluída.' : 'Falha na ação.')) })
    } catch {
      setStatus({ ok: false, message: 'Falha de conexão ao executar confirmação.' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="my-3 rounded-2xl border border-border/25 bg-[#14161f] text-text shadow-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300/90 font-bold">HITL</p>
        <h4 className="text-sm font-semibold mt-1">Confirmação necessária para {actionLabel}</h4>
        <p className="text-xs text-text-muted mt-1 break-all">{data?.path}</p>
      </div>

      <div className="px-4 py-3 space-y-2">
        {data?.summary && <p className="text-xs text-text/90">{data.summary}</p>}
        {data?.details && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            {data.details.objective && (
              <p className="text-[11px] text-text-muted">
                <span className="text-text font-medium">Objetivo:</span> {data.details.objective}
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-[11px] text-text-muted">
              {data.details.kind && <span className="rounded-md bg-white/5 px-2 py-1">{data.details.kind}</span>}
              {typeof data.details.estimatedLines === 'number' && (
                <span className="rounded-md bg-white/5 px-2 py-1">{data.details.estimatedLines} linhas</span>
              )}
              {typeof data.details.estimatedChars === 'number' && (
                <span className="rounded-md bg-white/5 px-2 py-1">{data.details.estimatedChars} chars</span>
              )}
            </div>
            {Array.isArray(data.details.routes) && data.details.routes.length > 0 && (
              <p className="text-[11px] text-text-muted">
                <span className="text-text font-medium">Rotas:</span> {data.details.routes.join(', ')}
              </p>
            )}
            {Array.isArray(data.details.knowledgeHints) && data.details.knowledgeHints.length > 0 && (
              <div className="space-y-1">
                {data.details.knowledgeHints.map((hint) => (
                  <p key={hint} className="text-[11px] text-text-muted">
                    {hint}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        {data?.preview && (
          <pre className="text-[11px] leading-relaxed p-3 rounded-xl bg-black/35 border border-white/10 overflow-auto max-h-[180px] whitespace-pre-wrap">
            {data.preview}
          </pre>
        )}

        {status && (
          <div className={`text-xs rounded-lg px-2.5 py-2 ${status.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
            {status.message}
          </div>
        )}
      </div>

      <div className="px-4 pb-4 flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => execute('confirm_mutation')}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent/90 text-white hover:bg-accent disabled:opacity-50"
        >
          {loading === 'confirm' ? 'Confirmando...' : 'Confirmar'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => execute('cancel_mutation')}
          className="px-3 py-2 rounded-lg text-xs font-semibold border border-border/30 text-text-muted hover:text-text hover:bg-white/5 disabled:opacity-50"
        >
          {loading === 'cancel' ? 'Cancelando...' : 'Cancelar'}
        </button>
      </div>
    </div>
  )
}

export default DevConfirmationCard
