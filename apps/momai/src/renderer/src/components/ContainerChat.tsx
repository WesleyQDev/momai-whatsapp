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
  status = 'idle',
  isSpeaking = false
}: {
  onEndCall: () => void
  history?: { id: string; role: 'user' | 'assistant'; content: string }[]
  status?: 'idle' | 'listening' | 'processing'
  isSpeaking?: boolean
}) => <CallModeContent onEndCall={onEndCall} history={history} status={status} isSpeaking={isSpeaking} />

const CallModeContent = ({
  onEndCall,
  history = [],
  status = 'idle',
  isSpeaking = false
}: {
  onEndCall: () => void
  history?: { id: string; role: 'user' | 'assistant'; content: string }[]
  status?: 'idle' | 'listening' | 'processing'
  isSpeaking?: boolean
}) => {
  const { t } = useI18n()
  const [waveHeights, setWaveHeights] = useState<number[]>(() => Array(64).fill(0.3))

  useEffect(() => {
    if (isSpeaking) {
      const interval = setInterval(() => {
        setWaveHeights(prev => prev.map((_, i) => {
          const center = 32
          const dist = Math.abs(i - center) / center
          const envelope = Math.max(0.2, 1 - dist * 0.6)
          return (0.3 + Math.random() * 0.7) * envelope
        }))
      }, 60)
      return () => clearInterval(interval)
    } else if (status === 'listening') {
      const interval = setInterval(() => {
        setWaveHeights(prev => prev.map(() => 0.15 + Math.random() * 0.5))
      }, 100)
      return () => clearInterval(interval)
    } else if (status === 'processing') {
      const interval = setInterval(() => {
        setWaveHeights(prev => prev.map(() => 0.1 + Math.random() * 0.3))
      }, 120)
      return () => clearInterval(interval)
    } else {
      const interval = setInterval(() => {
        setWaveHeights(prev => prev.map((_, i) => {
          const wave = Math.sin(Date.now() / 800 + i * 0.25) * 0.12 + 0.12
          return Math.max(0.04, Math.min(0.25, wave))
        }))
      }, 40)
      return () => clearInterval(interval)
    }
  }, [status, isSpeaking])

  const lastAssistant = history.filter((h) => h.role === 'assistant').pop()
  const lastUser = history.filter((h) => h.role === 'user').pop()

  const isActive = isSpeaking || status === 'listening' || status === 'processing'

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-transparent relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div 
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[800px] aspect-square rounded-full blur-[150px] transition-all duration-1000 ${
            isSpeaking ? 'bg-accent/15 scale-115' :
            status === 'listening' ? 'bg-accent/10 scale-110' : 
            status === 'processing' ? 'bg-accent/8 scale-105' : 'bg-accent/5 scale-100'
          }`}
        />
      </div>

      {/* Audio Waveform Visualization */}
      <div className="relative w-full max-w-[600px] h-32 mb-12 flex items-center justify-center">
        <div className="flex items-center gap-[2px] w-full px-8">
          {waveHeights.map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-full transition-all duration-75 ease-out"
              style={{
                height: `${Math.max(3, height * 128)}px`,
                background: isSpeaking
                  ? 'linear-gradient(to top, rgba(139, 92, 246, 0.7), rgba(168, 85, 247, 1))'
                  : status === 'processing' 
                    ? 'linear-gradient(to top, rgba(139, 92, 246, 0.5), rgba(139, 92, 246, 0.9))'
                    : status === 'listening'
                      ? 'linear-gradient(to top, rgba(139, 92, 246, 0.6), rgba(168, 85, 247, 1))'
                      : 'linear-gradient(to top, rgba(139, 92, 246, 0.3), rgba(139, 92, 246, 0.6))',
                opacity: isActive ? 1 : 0.6,
                boxShadow: isSpeaking && height > 0.5 ? '0 0 8px rgba(139, 92, 246, 0.4)' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Audio Waveform Visualization */}
      <div className="relative w-full max-w-[600px] h-32 mb-12 flex items-center justify-center">
        <div className="flex items-center gap-[2px] w-full px-8">
          {waveHeights.map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-full transition-all duration-100 ease-out"
              style={{
                height: `${height * 100}%`,
                minHeight: '2px',
                background: status === 'processing'
                  ? 'linear-gradient(to top, rgba(139, 92, 246, 0.4), rgba(139, 92, 246, 0.8))'
                  : status === 'listening'
                    ? 'linear-gradient(to top, rgba(139, 92, 246, 0.6), rgba(168, 85, 247, 1))'
                    : 'linear-gradient(to top, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.4))',
                opacity: status === 'idle' ? 0.5 : 1,
              }}
            />
          ))}
        </div>
      </div>

      {/* Status Label */}
      <div className="text-center mb-6 h-8 flex items-center justify-center">
        <h2 className={`text-xs font-medium tracking-[0.2em] uppercase transition-all duration-500 ${status === 'listening' ? 'text-accent/80' :
          status === 'processing' ? 'text-accent/60' : 'text-white/20'
          }`}>
          {status === 'listening'
            ? t('home.call.listening')
            : status === 'processing'
              ? t('home.call.processing')
              : t('home.call.waiting')}
        </h2>
      </div>

      {/* Conversation Display */}
      <div className="w-full max-w-[500px] px-6 py-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-xl relative mb-8">
        <div className="flex flex-col gap-4">
          {(() => {
            if (!lastUser && !lastAssistant) {
              return (
                <p className="text-center text-xs text-white/15 font-medium italic">
                  {t('home.suggestion.0')}
                </p>
              )
            }

            return (
              <>
                {lastUser && (
                  <div className="flex flex-col items-center animate-in slide-in-from-bottom-2 fade-in duration-500">
                    <p className="text-center text-sm text-white/60 font-medium leading-relaxed">
                      "{lastUser.content.replace(/__MOMAI_ACTIONS__[\s\S]*$/, '').trim()}"
                    </p>
                  </div>
                )}

                {lastAssistant && (
                  <div className="flex flex-col items-center animate-in slide-in-from-top-2 fade-in duration-500">
                    <p className="text-center text-sm text-white/90 leading-relaxed">
                      {lastAssistant.content.replace(/__MOMAI_ACTIONS__[\s\S]*$/, '').trim()}
                    </p>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* Minimal End Call Button */}
      <button
        type="button"
        onClick={onEndCall}
        className="group flex items-center justify-center w-12 h-12 rounded-full bg-white/[0.05] hover:bg-red-500/20 border border-white/[0.08] hover:border-red-500/30 text-white/30 hover:text-red-400 transition-all duration-300 active:scale-95"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transform rotate-135"
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      </button>
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
          isSpeaking={speakingIndex !== null && speakingIndex !== undefined}
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
