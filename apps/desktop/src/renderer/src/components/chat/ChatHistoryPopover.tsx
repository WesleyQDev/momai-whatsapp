import { useState, useEffect, useRef } from 'react'
import { fetchSessions, ChatSession, clearChatHistory } from '../../services/api'

interface Props {
  threadId: string
  setThreadId: (id: string) => void
}

export function ChatHistoryPopover({ threadId, setThreadId }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      loadSessions()
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const loadSessions = async () => {
    try {
      setIsLoading(true)
      const data = await fetchSessions()
      setSessions(data)
    } catch (e) {
      console.error('Failed to load sessions', e)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    try {
      await clearChatHistory(sessionId)
      if (threadId === sessionId) {
        setThreadId(`sessao_${Date.now()}`)
      }
      await loadSessions()
    } catch (e) {
      console.error('Failed to clear session', e)
    }
  }

  const handleSelect = (sessionId: string) => {
    setThreadId(sessionId)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border/20 bg-card/40 text-text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-all font-semibold"
        title="Histórico de Conversas"
      >
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-[14px] h-[14px]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-10 right-0 w-64 bg-card border border-border/20 shadow-2xl rounded-xl z-50 overflow-hidden flex flex-col max-h-[400px]">
          <div className="p-3 border-b border-border/10 bg-black/10 text-xs font-semibold text-text-muted flex justify-between items-center">
            <span>Sessões Recentes</span>
            <button 
               onClick={() => { setThreadId(`sessao_${Date.now()}`); setIsOpen(false); }}
               className="text-[10px] text-accent hover:underline rounded bg-accent/10 px-1.5 py-0.5"
            >
              Nova +
            </button>
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-text-muted">Carregando...</div>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-text-muted">Nenhuma sessão encontrada.</div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className={`group relative flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border ${
                    threadId === s.id ? 'bg-accent/15 border-accent/30 shadow-[inset_0_0_10px_rgba(var(--color-accent),0.1)]' : 'hover:bg-white/5 border-transparent'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 w-[85%]">
                    <span className={`text-[11px] font-medium truncate ${threadId === s.id ? 'text-accent font-semibold' : 'text-text/80'}`}>
                      {s.id === 'default' ? 'Sessão Inicial' : new Date(s.lastActivity || '').toLocaleString()}
                    </span>
                    <span className="text-[9px] text-text-muted uppercase tracking-wider">
                      {s.messageCount} msg
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, s.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 rounded-md hover:bg-black/20 transition-all"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
