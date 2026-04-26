import React from 'react'

type DevResultData = {
  title?: string
  subtitle?: string
  lines?: string[]
}

const DevResultCard = ({ data }: { data?: DevResultData }) => {
  const lines = Array.isArray(data?.lines) ? data.lines : []

  return (
    <div className="my-3 rounded-2xl border border-border/20 bg-[#12141d] text-text overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <h4 className="text-sm font-semibold">{data?.title || 'Resultado Dev Skill'}</h4>
        {data?.subtitle && <p className="text-xs text-text-muted mt-1">{data.subtitle}</p>}
      </div>

      <div className="px-4 py-3">
        {lines.length > 0 ? (
          <ul className="space-y-1.5 max-h-[260px] overflow-auto custom-scrollbar">
            {lines.map((line, idx) => (
              <li key={`${idx}-${line.slice(0, 20)}`} className="text-xs text-text/90 break-all">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">Sem dados adicionais.</p>
        )}
      </div>
    </div>
  )
}

export default DevResultCard
