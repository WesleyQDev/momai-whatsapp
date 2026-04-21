import React from 'react'

const RemindersCard = ({ data }) => {
  const { items, mode } = data

  if (!items || items.length === 0) {
    return (
      <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 text-white p-5">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">Lembretes</h4>
        <p className="mt-3 text-[14px] text-white/60">Nenhum lembrete ativo.</p>
      </div>
    )
  }

  const isListMode = mode === 'list'

  return (
    <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 text-white overflow-hidden shadow-xl">
      <div className="px-5 pt-4 pb-2">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">
          {isListMode ? 'Seus lembretes' : 'Lembrete criado'}
        </h4>
      </div>

      <div className="px-5 pb-2">
        <div className="flex flex-col gap-3">
          {items.map((item, idx) => (
            <div
              key={item.id || idx}
              className="flex items-start gap-3 py-2"
            >
              <span className="text-[20px] leading-none mt-0.5">⏰</span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-white/90 truncate">
                  {item.title || item.datetime || 'Lembrete'}
                </div>
                {item.datetime && (
                  <div className="text-[12px] text-white/60 mt-0.5">
                    {item.datetime}
                  </div>
                )}
                {item.content && (
                  <div className="text-[12px] text-white/40 mt-1 line-clamp-2">
                    {item.content}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 py-2.5 border-t border-white/5">
        <span className="text-[10px] text-white/30">MomAI Lembretes</span>
      </div>
    </div>
  )
}

export default RemindersCard