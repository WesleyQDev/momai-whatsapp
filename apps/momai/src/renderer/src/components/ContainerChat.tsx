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
        {isSttReady && (
          <>
            <div
              className={`absolute inset-[-4px] border-2 rounded-full animate-[ping_2s_infinite] ${status === 'listening' ? 'border-accent/30' : 'border-accent/20'}`}
            />
            <div
              className={`absolute inset-[-12px] border rounded-full animate-[ping_3s_infinite] ${status === 'listening' ? 'border-accent/10' : 'border-accent/5'}`}
            />
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
            <div className="relative flex items-center justify-center">
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
              {isSttReady && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-1">
                  <span
                    className={`stt-eq-bar h-2 w-1 rounded-full ${status === 'listening' ? 'bg-white/90' : 'bg-white/55'}`}
                  />
                  <span
                    className={`stt-eq-bar stt-eq-bar--2 h-3 w-1 rounded-full ${status === 'listening' ? 'bg-white' : 'bg-white/65'}`}
                  />
                  <span
                    className={`stt-eq-bar stt-eq-bar--3 h-2.5 w-1 rounded-full ${status === 'listening' ? 'bg-white/90' : 'bg-white/55'}`}
                  />
                </div>
              )}
            </div>
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
            ? t('home.call.listening')
            : status === 'processing'
              ? t('home.call.processing')
              : t('home.call.waiting')}
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
        <span className="font-extrabold text-xs uppercase tracking-widest">
          {t('home.call.disconnect')}
        </span>
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

  const displayProgress = isSystemDone ? 100 : Math.min(initProgress, 99)
  const loadingProgress = isModeChanging ? Math.min(displayProgress, 99) : displayProgress
  const shouldSkipIntro = settings?.skip_intro === true
  const showLoading = !shouldSkipIntro && (isModeChanging || !animationFinished || !isSystemDone)

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
                isModeChanging={isModeChanging}
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
