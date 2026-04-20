import { RefObject, JSX, useState, useEffect, useMemo } from 'react'
import { MessageList, ChatInput, LoadingAnimation } from './chat'
import { Message, StatusData, SettingsData, fetchSettings, listMemoryNotes } from '../services/api'
import { cleanMomaiActions } from '../utils/text'
import { WelcomeHeader, WelcomeActions } from './chat/WelcomeTips'
import { useI18n } from '../i18n'

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
  voiceEngineLoading?: { loading: boolean; pendingAutoTts: boolean; message: string } | null
  onToggleCallMode?: () => void
  callHistory?: { id: string; role: 'user' | 'assistant'; content: string }[]
  initProgress?: number
  visualProgress?: number
  initMessage?: string
  isBooting?: boolean
  threadId: string
  setThreadId: (id: string) => void
  setHistoryOpen?: (open: boolean) => void
  onSpeakMessage?: (content: string, index: number) => void
  onRemoveMessage?: (index: number) => void
  onRegenerateMessage?: (index: number) => void
  isFirstLaunch?: boolean
}

const CallModeUI = ({
  onEndCall,
  history = [],
  status = 'idle'
}: {
  onEndCall: () => void
  history?: { id: string; role: 'user' | 'assistant'; content: string }[]
  status?: 'idle' | 'listening' | 'processing'
}) => <CallModeContent onEndCall={onEndCall} history={history} status={status} />

const CallModeContent = ({
  onEndCall,
  history = [],
  status = 'idle'
}: {
  onEndCall: () => void
  history?: { id: string; role: 'user' | 'assistant'; content: string }[]
  status?: 'idle' | 'listening' | 'processing'
}) => {
  const { t } = useI18n()
  const isSttReady = status === 'idle' || status === 'listening'

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-transparent relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div 
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[600px] aspect-square rounded-full blur-[120px] transition-all duration-1000 ${
            status === 'listening' ? 'bg-accent/15 scale-125' : 
            status === 'processing' ? 'bg-amber-500/10 scale-110' : 'bg-accent/5 scale-100'
          }`}
        />
      </div>

      {/* Visual Center Piece - The Dynamic Orb */}
      <div className="relative w-48 h-48 mb-12 flex items-center justify-center translate-y-[-20px]">
        {/* Outer Halo */}
        <div
          className={`absolute inset-0 bg-accent/20 rounded-full blur-2xl transition-all duration-700 ${
            status !== 'idle' ? 'opacity-100 scale-125' : 'opacity-10 scale-90'
          }`}
        />
        
        {/* Liquid Rings */}
        <div className={`absolute inset-0 border-2 rounded-full transition-all duration-700 ${status === 'listening' ? 'border-accent/40 scale-110' : 'border-white/5 scale-100'}`} />
        <div className={`absolute inset-4 border rounded-full transition-all duration-1000 ${status === 'listening' ? 'border-accent/30 scale-105' : 'border-white/5 scale-100'}`} />
        
        {/* Pulse Waves */}
        {status === 'listening' && (
          <>
            <div className="absolute inset-0 border border-accent/40 rounded-full animate-[ping_3s_linear_infinite]" />
            <div className="absolute inset-0 border border-accent/20 rounded-full animate-[ping_4.5s_linear_infinite]" />
          </>
        )}

        {/* Core Persona Orb */}
        <div
          className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 z-10 backdrop-blur-3xl shadow-[0_0_50px_rgba(0,0,0,0.3)] border-t border-white/20 ${
            status === 'processing'
              ? 'bg-amber-500/30 border-amber-500/50 shadow-amber-500/20'
              : status === 'listening'
                ? 'bg-accent/40 border-accent/60 shadow-accent/40 scale-105'
                : 'bg-white/10 border-white/10'
          }`}
        >
          {/* Internal Glow */}
          <div className={`absolute inset-2 rounded-full blur-md mix-blend-screen transition-all duration-500 ${
            status === 'listening' ? 'bg-accent/40 animate-pulse' : 
            status === 'processing' ? 'bg-amber-400/30 animate-pulse' : 'bg-transparent'
          }`} />

          {status === 'processing' ? (
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-4 border-white/5 border-t-amber-400 rounded-full animate-spin" />
              <div className="absolute inset-2 border-2 border-white/5 border-b-amber-300 rounded-full animate-[spin_1.5s_linear_infinite_reverse]" />
            </div>
          ) : (
            <div className="relative group">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-all duration-500 ${status === 'listening' ? 'text-white scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-white/40'}`}
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              
              {/* Voice Equality Bars */}
              {isSttReady && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-end gap-[3px] h-6">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full bg-accent transition-all duration-300 ${
                        status === 'listening' ? 'opacity-100 animate-[stt-bounce_1s_ease-in-out_infinite]' : 'opacity-20 h-1'
                      }`}
                      style={{
                        animationDelay: `${i * 0.15}s`,
                        height: status === 'listening' ? `${30 + Math.random() * 70}%` : '4px'
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Label */}
      <div className="text-center mb-8 h-12 flex flex-col justify-center animate-fade-in">
        <h2 className={`text-sm font-bold tracking-[0.3em] uppercase transition-all duration-500 ${
          status === 'listening' ? 'text-accent drop-shadow-accent-glow' : 
          status === 'processing' ? 'text-amber-400' : 'text-white/20'
        }`}>
          {status === 'listening'
            ? t('home.call.listening')
            : status === 'processing'
              ? t('home.call.processing')
              : t('home.call.waiting')}
        </h2>
        <div className={`mt-2 flex justify-center gap-1 transition-opacity duration-500 ${status === 'listening' ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0s' }} />
          <div className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0.1s' }} />
          <div className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0.2s' }} />
        </div>
      </div>

      {/* Dynamic Conversation Bubble */}
      <div className="w-full max-w-[540px] px-6 py-8 rounded-[40px] bg-white/[0.03] border border-white/5 backdrop-blur-2xl relative mb-12 shadow-2xl">
        <div className="flex flex-col gap-6">
          {(() => {
            const lastUser = history.filter((h) => h.role === 'user').pop()
            const lastAssistant = history.filter((h) => h.role === 'assistant').pop()

            if (!lastUser && !lastAssistant) {
              return (
                <p className="text-center text-xs text-white/20 font-medium italic">
                  {t('home.suggestion.0')}
                </p>
              )
            }

            return (
              <>
                {lastUser && (
                  <div className="flex flex-col items-center animate-in slide-in-from-bottom-2 fade-in duration-700">
                    <span className="text-[10px] font-black tracking-widest text-white/30 uppercase mb-2">Você</span>
                    <p className="text-center text-sm text-white/80 font-medium leading-relaxed italic">
                      "{lastUser.content.replace(/__MOMAI_ACTIONS__[\s\S]*$/, '').trim()}"
                    </p>
                  </div>
                )}

                {lastAssistant && (
                  <div className="flex flex-col items-center animate-in slide-in-from-top-2 fade-in duration-700">
                    <span className="text-[10px] font-black tracking-widest text-accent uppercase mb-2">Luna</span>
                    <p className="text-center text-base text-white font-semibold leading-relaxed">
                      {lastAssistant.content.replace(/__MOMAI_ACTIONS__[\s\S]*$/, '').trim()}
                    </p>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onEndCall}
          className="group relative flex items-center gap-4 px-10 py-5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/50 text-red-500 rounded-full transition-all duration-500 active:scale-95 shadow-2xl"
        >
          <div className="relative w-3 h-3 flex items-center justify-center">
            <div className="absolute inset-0 bg-red-500 rounded-full group-hover:animate-ping opacity-60" />
            <div className="relative w-2 height-2 bg-red-500 rounded-full" />
          </div>
          <span className="font-black text-xs uppercase tracking-[0.2em]">
            {t('home.call.disconnect')}
          </span>
        </button>
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
  voiceEngineLoading = null,
  onToggleCallMode,
  callHistory = [],
  initProgress = 0,
  visualProgress = 0,
  initMessage,
  isBooting = false,
  threadId,
  setThreadId,
  setHistoryOpen,
  onSpeakMessage,
  onRemoveMessage,
  onRegenerateMessage,
  isFirstLaunch = false
}: ContainerChatProps): JSX.Element {
  const { t } = useI18n()
  const [localSessionTitle, setLocalSessionTitle] = useState<string | null>(null)
  const isBrainReady = statusInfo?.brain_ready ?? false
  const isBrainLoading = statusInfo?.is_loading ?? false
  const isSystemDone = initProgress >= 100 && !isBooting

  const [animationFinished, setAnimationFinished] = useState(() => {
    return isSystemDone
  })

  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [dynamicSuggestion, setDynamicSuggestion] = useState<string | null>(null)

  const isEmpty = messages.length === 0

  const allSuggestions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) => t(`home.suggestion.${idx}`)).filter(
        (value) => !value.startsWith('home.suggestion.')
      ),
    [t]
  )

  const randomSuggestions = useMemo(() => {
    // Shuffling inside memo to keep consistency while empty
    return allSuggestions.sort(() => Math.random() - 0.5).slice(0, 4)
  }, [allSuggestions, threadId])

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
            const validNotes = notes?.filter((n) => n.title.trim() !== '') || []
            if (validNotes.length > 0) {
              const randomNote = validNotes[Math.floor(Math.random() * validNotes.length)]
              setDynamicSuggestion(t('home.noteSuggestionPrefix', { title: randomNote.title }))
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
  }, [isEmpty, isBrainReady, dataLoaded, t])

  useEffect(() => {
    if (isModeChanging) {
      setAnimationFinished(false)
    }
  }, [isModeChanging])

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
    return () =>
      window.removeEventListener(
        'momai_session_title_generated',
        handleTitleGenerated as EventListener
      )
  }, [threadId])

  const displayProgress = isSystemDone ? 100 : Math.min(visualProgress || initProgress || 0, 99)
  const loadingProgress = isModeChanging ? Math.min(displayProgress, 99) : displayProgress
  const shouldSkipIntro = settings?.skip_intro === true
  const showLoading = isModeChanging || !isSystemDone || (!shouldSkipIntro && !animationFinished)

  const defaultWaitingMessage = isBrainLoading ? 'Loading AI Model...' : 'Waiting for AI Model...'
  const displayMessage =
    initProgress >= 100 && isBrainLoading
      ? !initMessage || initMessage === 'Sistema pronto.'
        ? defaultWaitingMessage
        : initMessage
      : initMessage

  const tier =
    localStorage.getItem('momai_ai_tier') || statusInfo?.ai_tier || settings?.ai_tier || 'lite'

  return (
    <div className="bg-transparent w-full h-full flex flex-col overflow-hidden relative">
      {showLoading ? (
        <LoadingAnimation
          progress={loadingProgress}
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
                if (threadId === 'default') return t('home.session.initial')
                if (localSessionTitle) return localSessionTitle
                const firstUserMsg = messages.find((m) => m.role === 'user')
                if (!firstUserMsg) return t('home.session.new')
                const clean = cleanMomaiActions(firstUserMsg.content)
                return clean
              })()}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  stopCurrentGeneration?.()
                  stopCurrentVoice?.()
                  setThreadId(`sessao_${Date.now()}`)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/20 border border-accent/20 hover:border-accent/40 rounded-full transition-all uppercase tracking-wider h-[34px]"
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
                {t('home.newSession')}
              </button>
              <button
                type="button"
                data-history-trigger="true"
                onClick={() => setHistoryOpen?.(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border bg-accent/10 text-accent border-accent/30 hover:bg-accent/20 hover:border-accent/50 hover:shadow-accent-glow transition-all duration-300 font-semibold text-[11px] tracking-wide h-[34px]"
                title={t('home.history.previousConversations')}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>{t('home.history.previousConversations')}</span>
              </button>
            </div>
          </div>

          {/* Inline Loading / Init Progress indicator when loading locally */}
          {isBrainLoading && initProgress < 100 && (
            <div className="px-4 py-1 mx-4 mt-2 bg-black/40 border border-accent/20 rounded-lg flex items-center justify-between animate-fade-in backdrop-blur-md z-20 shadow-lg">
              <span className="text-[10px] font-bold text-accent tracking-wider uppercase animate-pulse">
                {t('home.bootingAi')}... {Math.round(initProgress)}%
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
              <div
                className={`absolute inset-0 flex flex-col transition-opacity duration-500 ${isEmpty ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
              >
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
                    onRegenerateMessage={onRegenerateMessage}
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

                  <div className="w-full max-w-3xl flex flex-col items-center animate-in fade-in duration-1000">
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
            <div className="w-full max-w-3xl mx-auto z-30 pb-2">
              <ChatInput
                text={text}
                onSend={onSendMessage}
                isLoading={isLoading}
                isModeChanging={isModeChanging || !isBrainReady || isBrainLoading}
                statusInfo={statusInfo}
                onStopGeneration={stopCurrentGeneration}
                onStopVoice={stopCurrentVoice}
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
