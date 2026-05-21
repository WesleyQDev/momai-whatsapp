import React from 'react'

const TrelloBoards = ({ data }) => {
  const { boards } = data
  return (
    <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 text-white overflow-hidden shadow-xl">
      <div className="px-5 pt-4 pb-2">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">Quadros Trello</h4>
      </div>
      <div className="px-5 pb-3">
        <div className="flex flex-col gap-2">
          {boards.map((board) => (
            <div key={board.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 text-sm">
                B
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-white/90 truncate">{board.name}</div>
                {board.desc && (
                  <div className="text-[11px] text-white/40 mt-0.5 line-clamp-1">{board.desc}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-2.5 border-t border-white/5">
        <span className="text-[10px] text-white/30">Trello</span>
      </div>
    </div>
  )
}

const TrelloLists = ({ data }) => {
  const { lists, boardName } = data
  return (
    <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 text-white overflow-hidden shadow-xl">
      <div className="px-5 pt-4 pb-2">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">
          {boardName || 'Listas do Quadro'}
        </h4>
      </div>
      <div className="px-5 pb-3">
        <div className="flex flex-col gap-1">
          {lists.map((list, idx) => (
            <div
              key={list.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <span className="w-5 h-5 rounded bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 font-mono">
                {idx + 1}
              </span>
              <span className="text-[13px] text-white/80">{list.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-2.5 border-t border-white/5">
        <span className="text-[10px] text-white/30">Trello</span>
      </div>
    </div>
  )
}

const TrelloCards = ({ data }) => {
  const { cards } = data
  if (!cards || cards.length === 0) {
    return (
      <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 text-white p-5">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">Cartoes</h4>
        <p className="mt-3 text-[14px] text-white/60">Nenhum cartao nesta lista.</p>
      </div>
    )
  }
  return (
    <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 text-white overflow-hidden shadow-xl">
      <div className="px-5 pt-4 pb-2">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">Cartoes ({cards.length})</h4>
      </div>
      <div className="px-5 pb-3">
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <div key={card.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/5">
              <div
                className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                style={{ backgroundColor: card.labels?.[0]?.color || '#6366f1' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-white/90">{card.name}</div>
                {card.desc && (
                  <div className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{card.desc}</div>
                )}
                {card.due && (
                  <div className="text-[11px] text-amber-400/60 mt-1">
                    Vence: {new Date(card.due).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-2.5 border-t border-white/5">
        <span className="text-[10px] text-white/30">Trello</span>
      </div>
    </div>
  )
}

const TrelloCardDetail = ({ data }) => {
  const { card, comments } = data
  if (!card) {
    return (
      <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 text-white p-5">
        <p className="text-[14px] text-white/60">Cartao nao encontrado.</p>
      </div>
    )
  }
  return (
    <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 text-white overflow-hidden shadow-xl">
      <div className="px-5 pt-4 pb-2">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">{card.name}</h4>
      </div>
      <div className="px-5 pb-3 space-y-3">
        {card.desc && (
          <div className="text-[12px] text-white/60 leading-relaxed whitespace-pre-wrap">
            {card.desc}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {card.due && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400/80">
              Vence: {new Date(card.due).toLocaleDateString('pt-BR')}
            </span>
          )}
          {card.start && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400/80">
              Inicio: {new Date(card.start).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
        {card.labels && card.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {card.labels.map((label, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-full text-white/80"
                style={{ backgroundColor: label.color ? `#${label.color}` : '#6366f1' }}
              >
                {label.name || label.color}
              </span>
            ))}
          </div>
        )}
        {comments && comments.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-white/50 mb-2 uppercase tracking-wider">
              Comentarios ({comments.length})
            </div>
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="text-[12px] text-white/50 bg-white/5 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white/70 text-[11px]">
                      {c.member || 'Usuario'}
                    </span>
                    <span className="text-[10px] text-white/30">
                      {new Date(c.date).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className="text-white/60">{c.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="px-5 py-2.5 border-t border-white/5">
        <span className="text-[10px] text-white/30">Trello</span>
      </div>
    </div>
  )
}

const TrelloCard = ({ data }) => {
  if (!data) return null

  if (data.boards) return <TrelloBoards data={data} />
  if (data.lists && !data.cards && !data.card) return <TrelloLists data={data} />
  if (data.cards && !data.card) return <TrelloCards data={data} />
  if (data.card) return <TrelloCardDetail data={data} />

  return null
}

export default TrelloCard
