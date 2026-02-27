import { RefObject, JSX, useState, useEffect, useMemo } from 'react'
import { MessageList, ChatInput } from './chat'
import { Message, StatusData, SettingsData, fetchSettings, listMemoryNotes } from '../services/api'
import { cleanMomaiActions } from '../utils/text'
import { WelcomeHeader, WelcomeActions } from './chat/WelcomeTips'

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
  isFirstLaunch?: boolean
}

const ALL_SUGGESTIONS = [
  'O que tenho na agenda para hoje?',
  'Quais são as novidades sobre tecnologia?',
  'Me ajude a organizar minhas notas',
  'Como está o uso dos recursos do sistema?',
  'Resuma minhas notas mais recentes',
  'Quais são as suas capacidades?',
  'Mostre a interface de lembretes',
  'Como configurar o FortScript?',
  'Liste meus lembretes pendentes',
  'Qual é a previsão do tempo para hoje?',
  'Me conte uma curiosidade aleatória',
  'Verifique meus compromissos de amanhã'
]

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

const LoadingAnimation = ({
  progress,
  message,
  onComplete,
  isFirstLaunch
}: {
  progress: number
  message?: string
  onComplete?: () => void
  isFirstLaunch?: boolean
}) => {
  const [visualProgress, setVisualProgress] = useState(2) // Start at 2% so it's never empty
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setVisualProgress((prev) => {
        if (progress >= 100) {
          if (prev >= 100) return 100
          // Snappy jump to 100: completing the rest in very few steps
          const remaining = 100 - prev
          const step = Math.max(25, remaining / 2) 
          return Math.min(100, prev + step)
        }
        
        const baseIncrement = prev < 15 ? 0.4 : 0.02
        const randomFactor = Math.random() * 0.05
        const next = prev + baseIncrement + randomFactor
        
        // Clamp at 88% only if real progress is far behind
        // If real progress is > 80%, we allow the visual crawl to go higher
        const cap = progress > 90 ? 99 : 88
        const targetValue = Math.max(next, progress * 0.9)
        
        return Math.min(targetValue, cap)
      })
    }, 100)
    return () => clearInterval(interval)
  }, [progress])

  useEffect(() => {
    if (visualProgress >= 100) {
      const timer = setTimeout(() => {
        setIsFadingOut(true)
        if (onComplete) {
          setTimeout(onComplete, 500)
        }
      }, 200)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [visualProgress, onComplete])

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center p-12 transition-all duration-500 ${
        isFadingOut ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100'
      }`}
    >
      <div className="flex flex-col items-center text-center mb-12 animate-fade-in w-full px-4">
        <h1 className="text-[12px] font-black text-text/60 tracking-[0.2em] uppercase max-w-[600px] leading-tight">
          {progress < 100 && isFirstLaunch
            ? "A primeira inicialização pode levar de 1 a 3 minutos" 
            : "Bem-vinda à MomAI"}
        </h1>
      </div>

      <div className="w-full max-w-sm mb-8 relative z-10">
        <div className="flex justify-between items-end mb-3 px-1">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/80 animate-pulse mb-1">
              Inicializando Sistema
            </span>
            {localStorage.getItem('momai_dev_mode') === 'true' && (
              <span className="text-[14px] font-bold text-text/80 tracking-tight">
                {message || 'Preparando ambiente...'}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[18px] font-black text-text font-mono leading-none mb-1">
              {Math.round(visualProgress)}%
            </span>
          </div>
        </div>

        <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10 shadow-inner">
          <div
            className="absolute top-0 left-0 h-full bg-accent shadow-[0_0_20px_rgba(139,92,246,0.6)] transition-all duration-300 ease-out rounded-full"
            style={{ width: `${visualProgress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] transition-all duration-1000"
          style={{
            opacity: isFadingOut ? 0 : 1,
            transform: `translate(-50%, -50%) scale(${0.8 + visualProgress / 200})`
          }}
        />
      </div>
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
  onRemoveMessage,
  isFirstLaunch = false
}: ContainerChatProps): JSX.Element {
  const [localSessionTitle, setLocalSessionTitle] = useState<string | null>(null)
  const [animationFinished, setAnimationFinished] = useState(() => {
    const isBrainReady = statusInfo?.brain_ready ?? false
    const isBrainLoading = statusInfo?.is_loading ?? false
    return (initProgress ?? 0) >= 100 && isBrainReady && !isBrainLoading
  })
  
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [dynamicSuggestion, setDynamicSuggestion] = useState<string | null>(null)
  
  const isBrainReady = statusInfo?.brain_ready ?? false
  const isBrainLoading = statusInfo?.is_loading ?? false
  const isEmpty = messages.length === 0

  const randomSuggestions = useMemo(() => {
    // Shuffling inside memo to keep consistency while empty
    return ALL_SUGGESTIONS.sort(() => Math.random() - 0.5).slice(0, 4)
  }, [threadId])

  const [dataLoaded, setDataLoaded] = useState(false)

  useEffect(() => {
    if (isEmpty && !dataLoaded) {
      const loadData = async () => {
        try {
          const s = await fetchSettings()
          setSettings(s)
          setDataLoaded(true)
          
          if (isBrainReady) {
            const notes = await listMemoryNotes()
            const validNotes = notes?.filter(n => n.title.trim() !== '') || []
            if (validNotes.length > 0) {
              const randomNote = validNotes[Math.floor(Math.random() * validNotes.length)]
              setDynamicSuggestion(`Anotação: ${randomNote.title}`)
            }
          }
        } catch (e) {
          console.error(e)
          // Avoid infinite retry loop on failure
          setDataLoaded(true) 
        }
      }
      loadData()
    }
  }, [isEmpty, isBrainReady, dataLoaded])

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

  const isReallyReady = initProgress >= 100 && isBrainReady && !isBrainLoading
  const displayProgress = !isReallyReady ? Math.min(initProgress, 99) : 100
  const showLoading = !animationFinished

  const defaultWaitingMessage = isBrainLoading ? 'Loading AI Model...' : 'Waiting for AI Model...'
  const displayMessage = (initProgress >= 100 && (!isBrainReady || isBrainLoading))
    ? (!initMessage || initMessage === 'Sistema pronto.' ? defaultWaitingMessage : initMessage)
    : initMessage

  const tier = statusInfo?.ai_tier || settings?.ai_tier || 'pro'

  return (
    <div className="bg-transparent w-full h-full flex flex-col overflow-hidden relative">
      {showLoading ? (
        <LoadingAnimation
          progress={displayProgress}
          message={displayMessage}
          onComplete={() => setAnimationFinished(true)}
          isFirstLaunch={isFirstLaunch}
        />
      ) : isCallMode ? (
        <CallModeUI
          onEndCall={onToggleCallMode || (() => {})}
          history={callHistory}
          status={voiceStatus}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 px-4 pt-4 pb-2 z-20">
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

          {/* Inline Loading / Init Progress indicator when loading locally */}
          {isBrainLoading && initProgress < 100 && (
            <div className="px-4 py-1 mx-4 mt-2 bg-black/40 border border-accent/20 rounded-lg flex items-center justify-between animate-fade-in backdrop-blur-md z-20 shadow-lg">
              <span className="text-[10px] font-bold text-accent tracking-wider uppercase animate-pulse">
                Iniciando Módulo de IA... {Math.round(initProgress)}%
              </span>
              <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-accent relative transition-all duration-300 ease-out shadow-[0_0_10px_rgba(139,92,246,0.6)]" 
                  style={{ width: `${initProgress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-hidden relative flex flex-col">
             {/* Message Area */}
             <div className="flex-1 relative overflow-hidden">
                <div className={`absolute inset-0 transition-opacity duration-500 ${isEmpty ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                   {!isEmpty && (
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
                   )}
                </div>
                
                {/* Home Content Layer */}
                {isEmpty && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                     {/* Smaller top spacer to keep things higher */}
                     <div className="flex-1" /> 
                     
                     <div className="w-full max-w-4xl flex flex-col items-center animate-in fade-in duration-1000">
                        <WelcomeHeader statusInfo={statusInfo} settings={settings} />
                        <div className="mb-10">
                           <WelcomeActions 
                             onSendMessage={onSendMessage} 
                             tier={tier} 
                             dynamicSuggestion={dynamicSuggestion} 
                             randomSuggestions={randomSuggestions} 
                           />
                        </div>
                     </div>

                     {/* Larger bottom spacer to push content up from the input */}
                     <div className="flex-[2]" />
                  </div>
                )}
             </div>

             {/* Fixed Input Area */}
             <div className="w-full max-w-4xl mx-auto z-30 pb-2">
                <ChatInput
                  text={text}
                  onSend={onSendMessage}
                  isLoading={isLoading}
                  isModeChanging={isModeChanging}
                  statusInfo={statusInfo}
                  onStopGeneration={stopCurrentGeneration}
                  isCallMode={isCallMode}
                  onToggleCallMode={onToggleCallMode}
                  speakingIndex={speakingIndex}
                  voiceStatus={voiceStatus}
                />
             </div>
          </div>
        </>
      )}
    </div>
  )
}
