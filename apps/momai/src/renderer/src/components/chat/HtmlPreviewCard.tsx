import React from 'react'

type HtmlPreviewData = {
  html?: string
  title?: string
}

const HtmlPreviewCard = ({ data }: { data?: HtmlPreviewData }) => {
  const html = String(data?.html || '').trim()
  if (!html) return null

  return (
    <div className="my-3 rounded-2xl border border-border/20 bg-[#12131a] text-white overflow-hidden shadow-xl">
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/90">
          Preview
        </span>
        <span className="text-[10px] text-white/45 truncate max-w-[70%]">
          {data?.title || 'HTML gerado'}
        </span>
      </div>

      <div className="p-3">
        <iframe
          title="MomAI HTML Preview"
          srcDoc={html}
          sandbox="allow-popups"
          className="w-full h-[340px] rounded-xl border border-white/10 bg-white"
        />
      </div>
    </div>
  )
}

export default HtmlPreviewCard
