import React, { useMemo, useState } from 'react'
import { API_URL } from '../../constants'
import StructuredResponseRenderer from './StructuredResponseRenderer'

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
  const [resultResponse, setResultResponse] = useState<any | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const endpoint = data?.endpoint || '/extensions/dev/action'
  const disabled = !data?.mutationId || !!loading

  const actionLabel = useMemo(() => {
    if (!data?.action) return 'mutação'
    if (data.action === 'dev_write') return 'escrita'
    if (data.action === 'dev_patch') return 'patch'
    if (data.action === 'dev_delete') return 'remoção'
    if (data.action === 'generate_html_write') return 'criação'
    return data.action
  }, [data?.action])

  const title = useMemo(() => {
    if (data?.summary) return data.summary
    if (data?.action === 'generate_html_write') {
      return 'Permissao para criar arquivo no diretorio autorizado'
    }
    return `Permissao para ${actionLabel}`
  }, [data?.summary, data?.action, actionLabel])

  const execute = async (action: 'confirm_mutation' | 'cancel_mutation') => {
    if (!data?.mutationId) return
    const traceId = `dev-mutation-${data.mutationId}-${Date.now()}`
    setLoading(action === 'confirm_mutation' ? 'confirm' : 'cancel')
    if (action === 'confirm_mutation') {
      setDismissed(true)
      window.dispatchEvent(
        new CustomEvent('momai_dev_exec_trace', {
          detail: {
            traceId,
            phase: 'start',
            action,
            mutationId: data.mutationId,
            summary: title,
            path: data.path
          }
        })
      )
    }
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
      setStatus({
        ok,
        message: String(result?.message || (ok ? 'Ação concluída.' : 'Falha na ação.'))
      })
      setResultResponse(result?.structuredResponse || null)
      if (action === 'confirm_mutation') {
        window.dispatchEvent(
          new CustomEvent('momai_dev_exec_trace', {
            detail: {
              traceId,
              phase: ok ? 'done' : 'error',
              action,
              mutationId: data.mutationId,
              summary: title,
              path: data.path,
              message: String(result?.message || ''),
              structuredResponse: result?.structuredResponse || null
            }
          })
        )
      }
    } catch {
      setStatus({ ok: false, message: 'Falha de conexão ao executar confirmação.' })
      setResultResponse(null)
      if (action === 'confirm_mutation') {
        window.dispatchEvent(
          new CustomEvent('momai_dev_exec_trace', {
            detail: {
              traceId,
              phase: 'error',
              action,
              mutationId: data.mutationId,
              summary: title,
              path: data.path,
              message: 'Falha de conexão ao executar confirmação.'
            }
          })
        )
      }
    } finally {
      setLoading(null)
    }
  }

  if (dismissed) return null

  return (
    <div className="my-1.5 rounded-lg border border-white/8 bg-white/[0.02] text-text overflow-hidden">
      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-amber-300/90 font-bold">
                Permissão
              </span>
              <span className="text-[11px] text-text-muted">Dev Skill</span>
            </div>
            <p className="text-sm font-medium mt-1">{title}</p>
            <p className="text-[11px] text-text-muted mt-0.5 break-all">{data?.path}</p>
          </div>
          {data?.details && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="shrink-0 text-[11px] text-text-muted hover:text-text"
            >
              {showDetails ? 'Ocultar' : 'Detalhes'}
            </button>
          )}
        </div>
      </div>

      <div className="px-3 pb-2 space-y-2">
        {data?.summary && <p className="text-xs text-text/80">{data.summary}</p>}
        {showDetails && data?.details && (
          <div className="rounded-lg border border-white/8 bg-black/10 p-2.5 space-y-2">
            {data.details.objective && (
              <p className="text-[11px] text-text-muted leading-relaxed">
                <span className="text-text font-medium">Pedido:</span> {data.details.objective}
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-[11px] text-text-muted">
              {data.details.kind && (
                <span className="rounded-md bg-white/5 px-2 py-1">{data.details.kind}</span>
              )}
            </div>
            {Array.isArray(data.details.routes) && data.details.routes.length > 0 && (
              <p className="text-[11px] text-text-muted">
                <span className="text-text font-medium">Rotas:</span>{' '}
                {data.details.routes.join(', ')}
              </p>
            )}
          </div>
        )}
        {data?.preview && (
          <pre className="text-[11px] leading-relaxed p-3 rounded-xl bg-black/35 border border-white/10 overflow-auto max-h-[180px] whitespace-pre-wrap">
            {data.preview}
          </pre>
        )}

        {status && (
          <div
            className={`text-xs rounded-lg px-2.5 py-2 ${status.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}
          >
            {status.message}
          </div>
        )}

        {resultResponse && (
          <div className="pt-1">
            <StructuredResponseRenderer response={resultResponse} />
          </div>
        )}
      </div>

      <div className="px-3 pb-3 flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => execute('confirm_mutation')}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/90 text-white hover:bg-accent disabled:opacity-50"
        >
          {loading === 'confirm' ? 'Confirmando...' : 'Confirmar'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => execute('cancel_mutation')}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border/30 text-text-muted hover:text-text hover:bg-white/5 disabled:opacity-50"
        >
          {loading === 'cancel' ? 'Cancelando...' : 'Cancelar'}
        </button>
      </div>
    </div>
  )
}

export default DevConfirmationCard
