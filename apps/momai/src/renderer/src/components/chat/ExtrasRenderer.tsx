import { Message, Source, Snippet, Card } from '../../services/api'

interface ExtrasRendererProps {
  sources?: Source[]
  snippets?: Snippet[]
  cards?: Card[]
  isLoading?: boolean
}

export function ExtrasRenderer({ sources, snippets, cards, isLoading }: ExtrasRendererProps) {
  const hasSources = sources && sources.length > 0
  const hasSnippets = snippets && snippets.length > 0
  const hasCards = cards && cards.length > 0

  if (!hasSources && !hasSnippets && !hasCards) {
    return null
  }

  return (
    <div className="flex flex-col gap-2 mt-2">
      {hasCards && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cards.map((card, idx) => (
            <CardItem key={`card-${idx}`} card={card} />
          ))}
        </div>
      )}

      {hasSnippets && (
        <div className="flex flex-col gap-1">
          {snippets.map((snippet, idx) => (
            <SnippetItem key={`snippet-${idx}`} snippet={snippet} />
          ))}
        </div>
      )}

      {hasSources && (
        <div className="flex flex-col gap-1">
          {sources.map((source, idx) => (
            <SourceItem key={`source-${idx}`} source={source} />
          ))}
        </div>
      )}
    </div>
  )
}

function SourceItem({ source }: { source: Source }) {
  const isNote = source.url.startsWith('momai://note/')
  const urlObj = (() => {
    if (isNote) return null
    try {
      return new URL(source.url)
    } catch {
      return null
    }
  })()
  const domain = isNote
    ? 'Memória Local'
    : urlObj
      ? urlObj.hostname.replace('www.', '')
      : source.url
  const hasValidTitle = source.title && source.title.length > 3 && source.title !== domain
  const displayTitle = hasValidTitle ? source.title : domain

  return (
    <a
      href={isNote ? '#' : source.url}
      target={isNote ? '_self' : '_blank'}
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-2 -ml-2 rounded-xl hover:bg-accent/5 transition-all duration-300"
    >
      <div
        className={`w-8 h-8 rounded-lg ${isNote ? 'bg-purple-500/10' : 'bg-zinc-100 dark:bg-white/5'} flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:bg-accent/10 transition-all duration-300`}
      >
        {isNote ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-purple-500 group-hover:text-accent transition-colors"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        ) : (
          <svg
            className="w-4 h-4 text-zinc-400 group-hover:text-accent transition-colors"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[14px] font-semibold text-text group-hover:text-accent transition-colors truncate">
          {displayTitle}
        </span>
        {source.snippet && source.snippet.trim() && (
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
            {source.snippet}
          </span>
        )}
      </div>
    </a>
  )
}

function SnippetItem({ snippet }: { snippet: Snippet }) {
  const isNews = snippet.icon === 'news' || snippet.icon === '📰'

  return (
    <div className="flex items-start gap-3 p-3 mt-1 rounded-lg bg-zinc-100/80 dark:bg-[#1a1b1e] border border-zinc-200/60 dark:border-white/5 shadow-sm">
      {snippet.icon && (
        <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
          {isNews ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
              <rect x="9" y="9" width="6" height="6" />
              <line x1="9" y1="5" x2="15" y2="5" />
            </svg>
          ) : (
            <span className="text-sm">{snippet.icon}</span>
          )}
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1 pt-[2px]">
        <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 truncate">
          {snippet.title}
        </span>
        {snippet.content && (
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400 line-clamp-3 leading-snug">
            {snippet.content}
          </span>
        )}
      </div>
    </div>
  )
}

function CardItem({ card }: { card: Card }) {
  return (
    <div className="flex items-start gap-3 p-3 -ml-2 rounded-xl bg-gradient-to-br from-accent/5 to-accent/10 border border-accent/20 hover:border-accent/40 transition-all duration-300 cursor-pointer group">
      {card.image && (
        <img
          src={card.image}
          alt={card.title}
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
        />
      )}
      <div className="flex flex-col min-w-0 flex-1">
        {card.type && (
          <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
            {card.type}
          </span>
        )}
        <span className="text-[14px] font-semibold text-text group-hover:text-accent transition-colors truncate">
          {card.title}
        </span>
        {card.description && (
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
            {card.description}
          </span>
        )}
        {card.price && <span className="text-[14px] font-bold text-accent mt-1">{card.price}</span>}
        {card.link && (
          <a
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-accent hover:underline mt-1"
          >
            Ver mais →
          </a>
        )}
      </div>
    </div>
  )
}
