import { RefObject, JSX, useState, useEffect } from 'react'
import { MessageList, ChatInput } from './chat'
import { Message, StatusData } from '../services/api'
import { cleanMomaiActions } from '../utils/text'

interface ContainerChatProps {
  messages: Message[]
  isLoading: boolean
  text: string
  onSendMessage: (text?: string) => void
  onClearHistory?: () => void
  messagesEndRef: RefObject<HTMLDivElement | null>
  isModeChanging?: boolean
  onReopenGraph: (data: any) => void
  onGraphOption: (option: string) => void
  statusInfo: StatusData | null
  stopCurrentGeneration?: () => void
  stopCurrentVoice?: () => void
  speakingIndex?: number | null
  isCallMode?: boolean
  voiceStatus?: 'idle' | 'listening' | 'processing'
  onToggleCallMode?: () => void
  callHistory?: { id: string; role: 'user' | 'assistant'; content: string }[]
  initProgress?: number
  initMessage?: string
  isBooting?: boolean
  threadId: string
  setThreadId: (id: string) => void
  setHistoryOpen?: (open: boolean) => void
  onSpeakMessage?: (content: string, index: number) => void
  onRemoveMessage?: (index: number) => void
}

const CallModeUI = ({
  onEndCall,
  history = [],
  status = 'idle'
}: {
  onEndCall: () => void
  history?: { id: string; role: 'user' | 'assistant'; content: string }[]
  status?: 'idle' | 'listening' | 'processing'
}) => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-transparent">
    {/* Visual Center Piece */}
    <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
      {/* Dynamic Glows */}
      <div
        className={`absolute inset-0 bg-accent/20 rounded-full blur-2xl transition-all duration-700 ${status !== 'idle' ? 'opacity-100 scale-150' : 'opacity-20 scale-100'}`}
      />
      <div
        className={`absolute inset-2 bg-accent/10 rounded-full blur-xl transition-all duration-1000 ${status === 'listening' ? 'opacity-100 scale-110' : 'opacity-0 scale-90'}`}
      />

      {/* Animated Rings */}
      {status === 'listening' && (
        <>
          <div className="absolute inset-[-4px] border-2 border-accent/30 rounded-full animate-[ping_2s_infinite]" />
          <div className="absolute inset-[-12px] border border-accent/10 rounded-full animate-[ping_3s_infinite]" />
        </>
      )}

      {/* Core Icon Container */}
      <div
        className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 z-10 backdrop-blur-md shadow-2xl ${
          status === 'processing'
            ? 'bg-accent/30 border-2 border-accent animate-pulse shadow-accent/40'
            : 'bg-accent/20 border-2 border-accent/40 shadow-accent/10'
        }`}
      >
        {status === 'processing' ? (
          <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin" />
        ) : (
          <svg
            width="36"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        )}
      </div>
    </div>

    {/* Status Message */}
    <div className="h-6 mb-8 text-center flex flex-col justify-center">
      <span
        className={`text-[11px] font-black uppercase tracking-[0.5em] transition-all duration-500 ${
          status === 'listening' ? 'text-accent animate-pulse' : 'text-text-muted/40'
        }`}
      >
        {status === 'listening'
          ? 'Escutando'
          : status === 'processing'
            ? 'Processando'
            : 'Aguardando'}
      </span>
    </div>

    {/* Main Content Area - Mostra usuário e IA separados */}
    <div
      className="w-full max-w-[500px] mb-8 overflow-hidden relative flex flex-col items-center justify-center gap-1"
      style={{
        height: '80px'
      }}
    >
      {(() => {
        const lastUser = history.filter((h) => h.role === 'user').pop()
        const lastAssistant = history.filter((h) => h.role === 'assistant').pop()

        return (
          <>
            {/* Mensagem do Usuário */}
            {lastUser && (
              <p
                className="text-center text-[10px] text-white/60 font-medium px-4 w-full"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {lastUser.content.replace(/__MOMAI_ACTIONS__[\s\S]*$/, '').trim()}
              </p>
            )}

            {/* Mensagem da IA - máx 2 linhas com ... */}
            {lastAssistant && (
              <p
                className="text-center text-xs text-text font-medium px-4 w-full"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {lastAssistant.content.replace(/__MOMAI_ACTIONS__[\s\S]*$/, '').trim()}
              </p>
            )}
          </>
        )
      })()}
    </div>

    {/* Footer Action */}
    <button
      type="button"
      onClick={onEndCall}
      className="group relative flex items-center gap-4 px-10 py-4 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-text hover:text-red-500 rounded-3xl transition-all duration-500 active:scale-95 shadow-2xl backdrop-blur-xl"
    >
      <div className="w-2.5 h-2.5 bg-red-500 rounded-full group-hover:animate-ping" />
      <span className="font-extrabold text-xs uppercase tracking-widest">Desconectar</span>
    </button>
  </div>
)

const LoadingAnimation = ({ progress, message }: { progress: number; message?: string }) => {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="relative w-32 h-32 mb-6">
        <svg className="w-full h-full animate-[spin_3s_linear_infinite]" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="loaderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#loaderGradient)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${progress * 2.83} 283`}
            transform="rotate(-90 50 50)"
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-text drop-shadow-lg">
            {Math.round(progress)}%
          </span>
          <span className="text-xs text-text-muted/50">{seconds}s</span>
        </div>
      </div>
      <p className="text-sm text-text-muted/60 text-center max-w-[280px]">
        {message || 'Carregando...'}
      </p>
    </div>
  )
}

export default function ContainerChat({
  messages,
  isLoading,
  text,
  onSendMessage,
  onClearHistory,
  messagesEndRef,
  isModeChanging = false,
  onReopenGraph,
  onGraphOption,
  statusInfo,
  stopCurrentGeneration,
  stopCurrentVoice,
  speakingIndex,
  isCallMode = false,
  voiceStatus = 'idle',
  onToggleCallMode,
  callHistory = [],
  initProgress = 0,
  initMessage,
  isBooting = false,
  threadId,
  setThreadId,
  setHistoryOpen,
  onSpeakMessage,
  onRemoveMessage
}: ContainerChatProps): JSX.Element {
  const [localSessionTitle, setLocalSessionTitle] = useState<string | null>(null)
  
  useEffect(() => {
    setLocalSessionTitle(null)
  }, [threadId])

  useEffect(() => {
    const handleTitleGenerated = (e: CustomEvent) => {
      if (e.detail?.threadId === threadId) {
        setLocalSessionTitle(e.detail.title)
      }
    }
    window.addEventListener('momai_session_title_generated', handleTitleGenerated as EventListener)
    return () => window.removeEventListener('momai_session_title_generated', handleTitleGenerated as EventListener)
  }, [threadId])

  const isBrainReady = statusInfo?.brain_ready ?? false
  const isBrainLoading = statusInfo?.is_loading ?? false
  // Keep loading visible until init is done AND the LLM model is actually ready
  const isInitializing = initProgress < 100 || (!isBrainReady || isBrainLoading)
  // Don't show 100% until brain is truly ready — clamp at 99%
  const displayProgress = (!isBrainReady || isBrainLoading) ? Math.min(initProgress, 99) : initProgress
  
  // Show contextual message when init is done but model isn't loaded yet
  const defaultWaitingMessage = isBrainLoading ? 'Carregando modelo de IA...' : 'Aguardando modelo de IA...'
  const displayMessage = (initProgress >= 100 && (!isBrainReady || isBrainLoading))
    ? (!initMessage || initMessage === 'Sistema pronto.' ? defaultWaitingMessage : initMessage)
    : initMessage


  return (
    <div className="bg-transparent w-full h-full flex flex-col overflow-hidden relative">
      {isInitializing ? (
        <LoadingAnimation progress={displayProgress} message={displayMessage} />
      ) : isCallMode ? (
        <CallModeUI
          onEndCall={onToggleCallMode || (() => {})}
          history={callHistory}
          status={voiceStatus}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 px-4 pt-4 pb-2">
            <span className="flex-1 text-[11px] font-bold text-text/40 uppercase tracking-wider truncate">
              {(() => {
                if (threadId === 'default') return 'Sessão Inicial'
                if (localSessionTitle) return localSessionTitle
                const firstUserMsg = messages.find(m => m.role === 'user')
                if (!firstUserMsg) return 'Nova Sessão'
                const clean = cleanMomaiActions(firstUserMsg.content)
                return clean
              })()}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setThreadId(`sessao_${Date.now()}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/20 border border-accent/20 hover:border-accent/40 rounded-full transition-all uppercase tracking-wider h-[34px]"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Nova
              </button>
              <button
                type="button"
                data-history-trigger="true"
                onClick={() => setHistoryOpen?.(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border bg-accent/10 text-accent border-accent/30 hover:bg-accent/20 hover:border-accent/50 hover:shadow-accent-glow transition-all duration-300 font-semibold text-[11px] tracking-wide h-[34px]"
                title="Conversas anteriores"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-3.5 h-3.5"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>Conversas anteriores</span>
              </button>
            </div>
          </div>

          <MessageList
            messages={messages}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
            onReopenGraph={onReopenGraph}
            onGraphOption={onGraphOption}
            onSendMessage={onSendMessage}
            onStopVoice={stopCurrentVoice}
            onStopGeneration={stopCurrentGeneration}
            onSpeakMessage={onSpeakMessage}
            onRemoveMessage={onRemoveMessage}
            speakingIndex={speakingIndex}
            statusInfo={statusInfo}
          />

          <ChatInput
            text={text}
            onSend={onSendMessage}
            isLoading={isLoading}
            isModeChanging={isModeChanging}
            statusInfo={statusInfo}
            onStopGeneration={stopCurrentGeneration}
            isCallMode={isCallMode}
            onToggleCallMode={onToggleCallMode}
          />
        </>
      )}
    </div>
  )
}
