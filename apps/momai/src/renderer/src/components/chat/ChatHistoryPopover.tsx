import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchSessions, ChatSession, clearChatHistory } from '../../services/api'

interface Props {
  threadId: string
  setThreadId: (id: string) => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  isSidebarVariant?: boolean
  stopCurrentGeneration?: () => void
  stopCurrentVoice?: () => void
}

export function ChatHistoryPopover({
  threadId,
  setThreadId,
  isOpen,
  setIsOpen,
  isSidebarVariant,
  stopCurrentGeneration,
  stopCurrentVoice
}: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node

      // Check if the click was on the trigger button in ContainerChat
      const isTriggerClick =
        target instanceof Element && target.closest('[data-history-trigger="true"]')

      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        !isTriggerClick &&
        (!buttonRef.current || !buttonRef.current.contains(target))
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, setIsOpen])

  useEffect(() => {
    const handleTitleGenerated = (e: CustomEvent) => {
      if (!isOpen) return
      const { threadId: titleThreadId, title } = e.detail || {}
      if (titleThreadId && title) {
        setSessions((prev) => prev.map((s) => (s.id === titleThreadId ? { ...s, title } : s)))
      }
    }
    window.addEventListener('momai_session_title_generated', handleTitleGenerated as EventListener)
    return () =>
      window.removeEventListener(
        'momai_session_title_generated',
        handleTitleGenerated as EventListener
      )
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
        stopCurrentGeneration?.()
        stopCurrentVoice?.()
        setThreadId(`sessao_${Date.now()}`)
      }
      await loadSessions()
    } catch (e) {
      console.error('Failed to clear session', e)
    }
  }

  const handleSelect = (sessionId: string) => {
    stopCurrentGeneration?.()
    stopCurrentVoice?.()
    setThreadId(sessionId)
    setIsOpen(false)
  }

  return (
    <>
      {!isSidebarVariant && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border transition-all duration-300 font-semibold text-[11px] tracking-wide ${
            isOpen
              ? 'bg-accent text-white border-accent shadow-accent-glow'
              : 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20 hover:border-accent/50 hover:shadow-accent-glow'
          }`}
          title="Conversas anteriores"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span>Conversas anteriores</span>
        </button>
      )}

      {/* Full-screen overlay covering the entire chat container */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-xl animate-fade-in rounded-xl overflow-hidden"
          style={{ top: 0, left: 0, right: 0, bottom: 0 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-accent">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">Sessões Recentes</h3>
                <p className="text-[10px] text-text-muted">
                  {sessions.length} {sessions.length === 1 ? 'conversa' : 'conversas'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  stopCurrentGeneration?.()
                  stopCurrentVoice?.()
                  setThreadId(`sessao_${Date.now()}`)
                  setIsOpen(false)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/20 border border-accent/20 hover:border-accent/40 rounded-full transition-all uppercase tracking-wider"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Nova
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-text-muted hover:text-text hover:bg-white/5 transition-all"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
                  <span className="text-xs text-text-muted">Carregando sessões...</span>
                </div>
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-accent/5 border border-accent/10 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-accent/40">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                  <p className="text-xs text-text-muted">Nenhuma conversa anterior</p>
                  <p className="text-[10px] text-text-muted/50">Suas conversas aparecerão aqui</p>
                </div>
              </div>
            ) : (
              sessions.map((s, index) => (
                <div
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className={`group relative flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all duration-200 border ${
                    threadId === s.id
                      ? 'bg-accent/10 border-accent/25 shadow-[0_0_20px_rgba(139,92,246,0.08)]'
                      : 'hover:bg-white/[0.03] border-transparent hover:border-border/10'
                  }`}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex items-center gap-3 w-[calc(100%-36px)]">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        threadId === s.id
                          ? 'bg-accent/20 text-accent'
                          : 'bg-white/[0.03] text-text-muted/50 group-hover:bg-white/[0.06] group-hover:text-text-muted'
                      }`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                        />
                      </svg>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span
                        className={`text-xs font-medium truncate ${
                          threadId === s.id ? 'text-accent font-semibold' : 'text-text/80'
                        }`}
                      >
                        {(() => {
                          if (s.id === 'default') return 'Sessão Inicial'
                          if (s.title) return s.title
                          const displayTitle = s.firstMessage || 'Nova Sessão'
                          const clean = displayTitle.replace(/__MOMAI_ACTIONS__[\s\S]*$/, '').trim()
                          return clean.length > 20 ? clean.slice(0, 20).trim() + '...' : clean
                        })()}
                      </span>
                      <span className="text-[10px] text-text-muted/60">
                        {s.messageCount} {s.messageCount === 1 ? 'mensagem' : 'mensagens'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, s.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all shrink-0"
                    title="Excluir sessão"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}
