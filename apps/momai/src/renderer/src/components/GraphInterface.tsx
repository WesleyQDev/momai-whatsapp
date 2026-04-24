import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import FloatingCard from './floating/FloatingCard'
import { DynamicRenderer, type UIComponent } from './DynamicRenderer'
import { useI18n } from '../i18n'

interface GraphInterfaceProps {
  view: 'center' | 'side'
  content: string
  onClose: () => void
}

export default function GraphInterface({ view, content, onClose }: GraphInterfaceProps) {
  const { t, formatDate } = useI18n()

  // Renderizadores de Componentes
  const MarkdownArea = (
    <div className="max-w-none leading-relaxed text-text/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1
              className="text-2xl font-black text-white mb-6 mt-2 tracking-tight animate-fade-in"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="text-xl font-bold text-white/90 mb-5 mt-10 tracking-tight animate-fade-in"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="text-lg font-bold text-white/80 mb-4 mt-8 tracking-tight animate-fade-in"
              {...props}
            />
          ),
          p: ({ node, ...props }) => (
            <p className="mb-6 leading-relaxed text-sm animate-fade-in" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="flex flex-col gap-3 mb-8 animate-fade-in" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li
              className="flex flex-col justify-center px-5 py-4 min-h-[4rem] rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 transition-all cursor-default text-sm text-text/80 animate-fade-up shadow-sm break-words overflow-hidden"
              {...props}
            />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-accent bg-accent/5 px-6 py-4 my-8 italic text-white/80 rounded-r-lg animate-fade-in"
              {...props}
            />
          ),
          strong: ({ node, ...props }) => <strong className="text-white font-bold" {...props} />,
          code: ({ node, ...props }) => (
            <code
              className="bg-accent/10 px-1.5 py-0.5 rounded text-[11px] font-mono text-accent border border-accent/20"
              {...props}
            />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-6 animate-fade-in">
              <table className="min-w-full border-collapse" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="border-b border-white/10" {...props} />,
          th: ({ node, ...props }) => (
            <th
              className="px-4 py-3 text-left text-[10px] font-black text-accent/70 uppercase tracking-widest"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-3 text-sm text-text-muted border-b border-white/5" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-white/[0.02] transition-colors" {...props} />
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )

  // Renderização Condicional baseada na View
  if (view === 'center') {
    return (
      <FloatingCard onClose={onClose}>
        <div className="flex flex-col gap-10">{MarkdownArea}</div>
      </FloatingCard>
    )
  }

  if (view === 'side') {
    return (
      <div className="flex flex-col h-full bg-transparent overflow-hidden relative">
        {/* Minimal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/10 bg-black/20 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_rgba(var(--accent),0.5)] animate-pulse" />
            <span className="text-xs font-bold text-text/90 uppercase tracking-[0.2em]">
              {t('graphInterface.header')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-text/40 hover:text-white transition-all group"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="group-hover:scale-110 transition-transform"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Clean Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-5 md:px-8 py-8 md:py-10">
            <div className="max-w-none">{MarkdownArea}</div>

            {/* Footer do Relatório */}
            <div className="mt-16 pt-8 border-t border-white/5 flex items-center justify-between opacity-40 italic text-[10px] text-white/50">
              <span className="uppercase tracking-[0.3em] font-medium">
                {t('graphInterface.footer')}
              </span>
              <span>{formatDate(new Date())}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
