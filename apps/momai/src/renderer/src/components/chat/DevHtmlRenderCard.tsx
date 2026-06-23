import React, { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'

type DevHtmlRenderData = {
  title?: string
  subtitle?: string
  html?: string
  code?: string
}

const DevHtmlRenderCard = ({ data }: { data?: DevHtmlRenderData }) => {
  const rawHtml = String(data?.html || '').trim()
  const html = useMemo(() => {
    if (!rawHtml) return ''
    return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } })
  }, [rawHtml])
  const code = String(data?.code || rawHtml || '')
  const [showRender, setShowRender] = useState(false)
  const [showCode, setShowCode] = useState(false)

  if (!html) return null

  return (
    <div className="my-3 rounded-2xl border border-border/25 bg-[#11131b] text-text shadow-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-[10px] uppercase tracking-[0.14em] text-accent/90 font-bold">HTML</p>
        <h4 className="text-sm font-semibold mt-1">{data?.title || 'Renderização sob demanda'}</h4>
        {data?.subtitle && <p className="text-xs text-text-muted mt-1">{data.subtitle}</p>}
      </div>

      <div className="px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowRender((v) => !v)}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent/90 text-white hover:bg-accent"
        >
          {showRender ? 'Ocultar render' : 'Renderizar HTML'}
        </button>
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          className="px-3 py-2 rounded-lg text-xs font-semibold border border-border/30 text-text-muted hover:text-text hover:bg-white/5"
        >
          {showCode ? 'Ocultar código' : 'Ver código'}
        </button>
      </div>

      {showRender && (
        <div className="px-4 pb-4">
          <iframe
            title="Dev HTML Render"
            srcDoc={html}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            className="w-full h-[360px] rounded-xl border border-white/10 bg-white"
          />
        </div>
      )}

      {showCode && (
        <div className="px-4 pb-4">
          <pre className="text-[11px] leading-relaxed p-3 rounded-xl bg-black/35 border border-white/10 overflow-auto max-h-[320px] whitespace-pre-wrap">
            {code}
          </pre>
        </div>
      )}
    </div>
  )
}

export default DevHtmlRenderCard
