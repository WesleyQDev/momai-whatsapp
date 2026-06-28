import { RefObject, JSX, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MessageList, ChatInput, LoadingAnimation } from './chat'
import CallModeContent from './chat/CallModeContent'
import {
  Message,
  StatusData,
  SettingsData,
  fetchSettings,
  listMemoryNotes,
  resetChatContextUsage
} from '../services/api'
import { cleanMomaiActions, stripMarkdown } from '../utils/text'
import { WelcomeHeader, WelcomeActions } from './chat/WelcomeTips'
import { useI18n } from '../i18n'
import { WS_URL } from '../constants'

interface ContainerChatProps {
  messages: Message[]
  isLoading: boolean
  text: string
  onSendMessage: (text?: string, isSilent?: boolean, skipUserMessage?: boolean) => void
  onClearHistory?: () => void
  messagesEndRef: RefObject<HTMLDivElement | null>
  scrollPositionRef?: RefObject<number>
  isModeChanging?: boolean
  isTierChanging?: boolean
  onReopenGraph: (data: any) => void
  onGraphOption: (option: string) => void
  statusInfo: StatusData | null
  stopCurrentGeneration?: () => void
  stopCurrentVoice?: () => void
  speakingMessageId?: string | null
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
  animationFinished: boolean
  setAnimationFinished: (finished: boolean) => void
}

function ContextUsageRing() {
  const [used, setUsed] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let closed = false
    let ws: WebSocket | null = null

    const connect = () => {
      try {
        // Create the WebSocket in the renderer's context (Chromium's
        // WebSocket). The contextBridge cannot safely proxy WebSocket
        // objects (methods like .close() are stripped).
        const token = window.api.getSessionToken()
        const wsUrl = token
          ? `${WS_URL}${WS_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
          : WS_URL
        ws = new WebSocket(wsUrl)
      } catch {
        return
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg?.type === 'resource_usage' && msg?.data) {
            const nextUsed = Number(msg.data.context_used_tokens ?? 0)
            const nextTotal = Number(msg.data.context_total_tokens ?? 0)
            if (Number.isFinite(nextUsed)) setUsed(Math.max(0, nextUsed))
            if (Number.isFinite(nextTotal)) setTotal(Math.max(0, nextTotal))
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onerror = () => {
        // Connection error — will be cleaned up on unmount
      }
    }

    connect()
    return () => {
      closed = true
      ws?.close()
    }
  }, [])

  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const angle = (percent / 100) * 360
  const statusColor =
    percent >= 85 ? '#ef4444' : percent >= 65 ? '#f59e0b' : 'rgba(139,92,246,0.95)'
  const toneClass =
    percent >= 85
      ? 'border-red-400/30 text-red-300 bg-red-500/5'
      : percent >= 65
        ? 'border-amber-400/30 text-amber-200 bg-amber-500/5'
        : 'border-accent/25 text-accent bg-accent/10'

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border h-[34px] backdrop-blur-sm transition-colors ${toneClass}`}
      title={`Contexto em uso: ${used}/${total || 0} tokens (${percent}%)`}
    >
      <div className="relative w-5 h-5 shrink-0">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(${statusColor} ${angle}deg, rgba(255,255,255,0.10) ${angle}deg 360deg)`
          }}
        />
        <div className="absolute inset-[3px] rounded-full bg-card border border-white/15" />
      </div>
      <span className="text-[10px] font-black tracking-[0.14em] uppercase">CTX</span>
      <span className="text-[10px] font-semibold tabular-nums leading-none">
        {used}/{total || 0}
      </span>
      <span className="text-[10px] font-bold tabular-nums leading-none opacity-90">{percent}%</span>
    </div>
  )
}

const CallModeUI = ({
  onEndCall,
  onStopVoice,
  history = [],
  status = 'idle',
  isSpeaking = false
}: {
  onEndCall: () => void
  onStopVoice?: () => void
  history?: { id: string; role: 'user' | 'assistant'; content: string }[]
  status?: 'idle' | 'listening' | 'processing'
  isSpeaking?: boolean
}) => (
  <CallModeContent
    onEndCall={onEndCall}
    onStopVoice={onStopVoice}
    history={history}
    status={status}
    isSpeaking={isSpeaking}
  />
)

export default function ContainerChat({
  messages,
  isLoading,
  text,
  onSendMessage,
  onClearHistory,
  messagesEndRef,
  scrollPositionRef,
  isModeChanging = false,
  isTierChanging = false,
  onReopenGraph,
  onGraphOption,
  statusInfo,
  stopCurrentGeneration,
  stopCurrentVoice,
  speakingMessageId,
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
  isFirstLaunch = false,
  animationFinished,
  setAnimationFinished
}: ContainerChatProps): JSX.Element {
  const { t } = useI18n()

  const [economyState, setEconomyState] = useState<{
    active: boolean
    detectedGames: { name: string; coverUrl?: string | null }[]
    freedMemoryMb?: number
    freedVramMb?: number
  } | null>(null)

  const [localDismissed, setLocalDismissed] = useState(false)
  const [wakingFromSoneca, setWakingFromSoneca] = useState(false)

  useEffect(() => {
    if (!economyState?.active) setWakingFromSoneca(false)
  }, [economyState])

  useEffect(() => {
    const cleanup = (window as any).api?.onEconomyStateChange?.(
      (newState: {
        active: boolean
        detectedGames: { name: string; coverUrl?: string | null }[]
      }) => {
        setEconomyState(newState)
        if (!newState.active) setLocalDismissed(false)
      }
    )
    return () => cleanup?.()
  }, [])
  const [localSessionTitle, setLocalSessionTitle] = useState<string | null>(null)
  const isBrainReady = statusInfo?.brain_ready ?? false
  const isBrainLoading = statusInfo?.is_loading ?? false
  const isIdleSoneca = !!economyState?.active && economyState.detectedGames.length === 0

  const handleSendDuringSoneca = useCallback(
    (content?: string) => {
      if (content === undefined) return
      if (isIdleSoneca && !isBrainReady) {
        setWakingFromSoneca(true)
        ;(window as any).api?.dismissEconomy?.().catch(() => {})
      }
      onSendMessage(content)
    },
    [isIdleSoneca, isBrainReady, onSendMessage]
  )
  const isSystemDone = initProgress >= 100 && !isBooting

  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [dynamicSuggestion, setDynamicSuggestion] = useState<string | null>(null)
  const [showContextRing, setShowContextRing] = useState(() => {
    const dev = localStorage.getItem('momai_dev_mode') === 'true'
    const ring = localStorage.getItem('momai_show_context_ring') === 'true'
    return dev && ring
  })

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

  const youtubeSuggestion = useMemo(() => {
    const list = [
      'Lo-Fi Hip Hop',
      'Música para estudar',
      'Synthwave mix',
      'Sons de chuva para relaxar',
      'Jazz café instrumental',
      'Música clássica para foco',
      'Clássicos do MPB',
      'Rock clássico anos 80',
      'Vídeos de receitas rápidas',
      'Documentário de astronomia',
      'Treino rápido em casa',
      'Melhores jogadas de basquete'
    ]
    return list[Math.floor(Math.random() * list.length)]
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
    const handleBriefing = (e: CustomEvent) => {
      if (e.detail && typeof onSendMessage === 'function') {
        onSendMessage(e.detail, false, true)
      }
    }
    window.addEventListener('momai_trigger_briefing', handleBriefing as EventListener)
    return () =>
      window.removeEventListener('momai_trigger_briefing', handleBriefing as EventListener)
  }, [onSendMessage])

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail) {
        setSettings(e.detail)
        if (e.detail.user_name) {
          localStorage.setItem('momai_user_name', e.detail.user_name)
        }
      }
    }
    window.addEventListener('momai_settings_sync', handleSync as EventListener)
    return () => window.removeEventListener('momai_settings_sync', handleSync as EventListener)
  }, [])

  useEffect(() => {
    setLocalSessionTitle(null)
  }, [threadId])

  useEffect(() => {
    const sync = () => {
      const dev = localStorage.getItem('momai_dev_mode') === 'true'
      const ring = localStorage.getItem('momai_show_context_ring') === 'true'
      setShowContextRing(dev && ring)
    }
    window.addEventListener('momai_dev_mode_sync', sync as EventListener)
    window.addEventListener('momai_context_ring_sync', sync as EventListener)
    return () => {
      window.removeEventListener('momai_dev_mode_sync', sync as EventListener)
      window.removeEventListener('momai_context_ring_sync', sync as EventListener)
    }
  }, [])

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

  const [tierProgress, setTierProgress] = useState(0)

  useEffect(() => {
    if (!isTierChanging) {
      setTierProgress(0)
      return
    }
    setTierProgress(20)
    const id = setInterval(() => setTierProgress((p) => Math.min(95, p + 4)), 80)
    return () => clearInterval(id)
  }, [isTierChanging])

  const displayProgress = isSystemDone ? 100 : Math.min(96, visualProgress || initProgress || 0)
  const loadingProgress = isTierChanging ? tierProgress : displayProgress
  const shouldSkipIntro = settings?.skip_intro === true
  const hasMessages = messages.length > 0
  const hasUserData = !!localStorage.getItem('momai_user_name') || !!settings?.user_name
  const tier =
    localStorage.getItem('momai_ai_tier') || statusInfo?.ai_tier || settings?.ai_tier || 'lite'
  const showLoading =
    isTierChanging ||
    isBooting ||
    (!animationFinished && !hasUserData) ||
    (isModeChanging && !hasUserData) ||
    (isBrainLoading && !isBrainReady && !hasUserData)

  const econActive =
    economyState?.active && economyState.detectedGames.length > 0 && !localDismissed
  const econGame = econActive ? economyState!.detectedGames[0] : null

  const dismissEconomy = () => {
    setLocalDismissed(true)
    ;(window as any).api?.dismissEconomy?.().catch(() => {})
  }

  const defaultWaitingMessage = isBrainLoading ? 'Loading AI Model...' : 'Waiting for AI Model...'
  const displayMessage = isTierChanging
    ? `Configurando modo ${tier?.toUpperCase() || 'PRO'}...`
    : initProgress >= 100 && isBrainLoading
      ? !initMessage || initMessage === 'Sistema pronto.'
        ? defaultWaitingMessage
        : initMessage
      : initMessage

  return (
    <div className="bg-transparent w-full h-full flex flex-col overflow-hidden relative">
      {econGame ? (
        <div className="flex flex-col flex-1 items-center justify-center p-8 animate-in fade-in duration-500 gap-8">
          <div className="w-56 aspect-[4/5] rounded-2xl overflow-hidden bg-white/5 shadow-2xl ring-1 ring-white/10">
            {econGame.coverUrl ? (
              <img
                src={econGame.coverUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted/20">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M6 12h4M8 10v4" />
                  <path d="M15.5 12a.5.5 0 0 1 0 1 .5.5 0 0 1 0-1Z" />
                  <path d="M18.5 10a.5.5 0 0 1 0 1 .5.5 0 0 1 0-1Z" />
                  <path d="M7.5 5c-1.5 0-3 .4-4.2 1.3A5 5 0 0 0 2 12v2a5 5 0 0 0 5 5c1.2 0 2.4-.4 3.3-1l1.5-1.2c.7-.6 1.7-.6 2.4 0l1.5 1.2c.9.6 2.1 1 3.3 1a5 5 0 0 0 5-5v-2a5 5 0 0 0-1.3-3.7C19.5 5.4 18 5 16.5 5h-9Z" />
                </svg>
              </div>
            )}
          </div>
          <div className="text-center space-y-2 max-w-xs">
            <div className="flex items-center justify-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-green-400">
                Economia
              </span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </div>
            <h2 className="text-lg font-bold text-text">{econGame.name}</h2>
            <p className="text-xs text-text-muted">
              {(() => {
                const parts: string[] = []
                if (economyState?.freedMemoryMb) parts.push(`${economyState.freedMemoryMb} MB RAM`)
                if (economyState?.freedVramMb) parts.push(`${economyState.freedVramMb} MB VRAM`)
                return parts.length > 0
                  ? parts.join(' + ') + ' liberados'
                  : 'Recursos liberados para o jogo rodar sem interferência'
              })()}
            </p>
          </div>
          <button
            onClick={dismissEconomy}
            className="px-5 py-2 rounded-xl text-xs font-semibold border border-accent/40 text-accent bg-accent/5 hover:bg-accent/10 transition-all"
          >
            Sair do modo economia
          </button>
        </div>
      ) : showLoading ? (
        <LoadingAnimation
          progress={loadingProgress}
          message={displayMessage}
          onComplete={() => setAnimationFinished(true)}
          isFirstLaunch={isFirstLaunch}
        />
      ) : isCallMode ? (
        <CallModeUI
          onEndCall={onToggleCallMode || (() => {})}
          onStopVoice={stopCurrentVoice}
          history={callHistory}
          status={voiceStatus}
          isSpeaking={speakingMessageId !== null && speakingMessageId !== undefined}
        />
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out fill-mode-both">
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
              {showContextRing && <ContextUsageRing />}
              <button
                type="button"
                onClick={() => {
                  stopCurrentGeneration?.()
                  stopCurrentVoice?.()
                  resetChatContextUsage().catch(() => {})
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
                    scrollPositionRef={scrollPositionRef}
                    onSendMessage={handleSendDuringSoneca}
                    onReopenGraph={onReopenGraph}
                    onGraphOption={onGraphOption}
                    onStopVoice={stopCurrentVoice}
                    onStopGeneration={stopCurrentGeneration}
                    onSpeakMessage={onSpeakMessage}
                    onRemoveMessage={onRemoveMessage}
                    onRegenerateMessage={onRegenerateMessage}
                    speakingMessageId={speakingMessageId}
                    statusInfo={statusInfo}
                    ttsEnabled={settings?.tts_enabled ?? false}
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
                        onSendMessage={handleSendDuringSoneca}
                        tier={tier}
                        dynamicSuggestion={dynamicSuggestion}
                        randomSuggestions={randomSuggestions}
                        youtubeSuggestion={youtubeSuggestion}
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
              {wakingFromSoneca && (
                <div className="flex items-center justify-center gap-2 mb-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs font-medium text-accent">Saindo do modo soneca...</span>
                </div>
              )}
              <ChatInput
                text={text}
                onSend={handleSendDuringSoneca}
                isLoading={isLoading}
                isModeChanging={isModeChanging}
                statusInfo={statusInfo}
                idleSonecaActive={!!economyState?.active && economyState.detectedGames.length === 0}
                onStopGeneration={stopCurrentGeneration}
                onStopVoice={stopCurrentVoice}
                isCallMode={isCallMode}
                onToggleCallMode={onToggleCallMode}
                speakingMessageId={speakingMessageId}
                voiceStatus={voiceStatus}
              />
            </div>
          </div>
        </div>
      )}

      {statusInfo?.llama_runtime?.loaded_model_name && (
        <div className="absolute bottom-1.5 right-4 z-50 pointer-events-none select-none">
          <span className="text-[9px] font-bold text-white/40 bg-black/20 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/5 transition-colors uppercase tracking-[0.1em]">
            {statusInfo.llama_runtime.loaded_model_name}
          </span>
        </div>
      )}
    </div>
  )
}
