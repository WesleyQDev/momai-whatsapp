import { RefObject, JSX, useState, useEffect, useMemo, useRef } from 'react'
import { MessageList, ChatInput, LoadingAnimation } from './chat'
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
        ws = new WebSocket(WS_URL)
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

const CallModeContent = ({
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
}) => {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bandsRef = useRef<number[]>(new Array(16).fill(0))
  const smoothedBandsRef = useRef<number[]>(new Array(16).fill(0))
  const phaseRef = useRef<number>(0)

  // Listen for frequency bands from Python
  useEffect(() => {
    const handleBands = (e: CustomEvent) => {
      const allSubChunks = e.detail as number[][]
      if (allSubChunks && allSubChunks.length > 0) {
        // Use the last sub-chunk for real-time feel
        bandsRef.current = allSubChunks[allSubChunks.length - 1]
      }
    }
    window.addEventListener('momai_voice_bands' as any, handleBands as any)
    return () => window.removeEventListener('momai_voice_bands' as any, handleBands as any)
  }, [])

  // High-performance canvas animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      const isActive = status !== 'idle' || isSpeaking
      phaseRef.current += 0.04 + (isActive ? 0.04 : 0)

      // Smooth the bands for fluid motion
      for (let i = 0; i < 16; i++) {
        const target = isActive ? bandsRef.current[i] || 0 : 0
        // Interpolation to avoid jitter
        smoothedBandsRef.current[i] += (target - smoothedBandsRef.current[i]) * 0.15
        // Reset base bands slightly so they don't get stuck
        bandsRef.current[i] *= 0.92
      }

      const drawWave = (
        color: string,
        opacity: number,
        scale: number,
        phaseShift: number,
        offset: number
      ) => {
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.4
        ctx.globalAlpha = opacity

        for (let x = 0; x <= width; x += 2) {
          const normX = x / width
          // Gaussian envelope to keep waves in the center
          const envelope = Math.pow(Math.sin(normX * Math.PI), 1.5)

          // Get the relevant frequency band for this X position
          // Using 16 bands spread across the width
          const bandIdx = Math.floor(normX * 15)
          const nextBandIdx = Math.min(15, bandIdx + 1)
          const bandLerp = (normX * 15) % 1

          // Interpolate between bands for smooth "mountains"
          const bandValue =
            smoothedBandsRef.current[bandIdx] * (1 - bandLerp) +
            smoothedBandsRef.current[nextBandIdx] * bandLerp

          // Create the "Mountain" effect
          // Amplitude is driven by the frequency band at that specific point
          const peakHeight = bandValue * (height / 2) * scale
          const baseNoise = Math.sin(normX * 5 + phaseRef.current + phaseShift) * (height / 15)

          const y =
            height / 2 +
            (peakHeight + baseNoise) * envelope +
            Math.sin(normX * 12 + phaseRef.current * 1.5) * (height / 40) * envelope +
            offset

          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // Gradients (Pink -> Purple -> Cyan)
      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, '#ec4899')
      gradient.addColorStop(0.5, '#a855f7')
      gradient.addColorStop(1, '#06b6d4')

      // Draw 5 layers with different scales and sensitivities
      for (let i = 0; i < 5; i++) {
        const shift = i * 0.8
        const scale = 0.5 + (4 - i) * 0.15
        const opacity = 0.9 - i * 0.15
        drawWave(gradient as any, opacity, scale, shift, (i - 2) * 3)
      }

      // Bright white accent line for the peak
      drawWave('#fff', 0.2, 0.4, 0, 0)

      animationFrameId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animationFrameId)
  }, [status, isSpeaking])
  // 1. Word-by-word stream logic
  const lastAssistant = history.filter((h) => h.role === 'assistant').pop()
  const lastUser = history.filter((h) => h.role === 'user').pop()

  const [displayedWords, setDisplayedWords] = useState<string[]>([])
  const [wordIndex, setWordIndex] = useState(0)
  const lastMsgRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!lastAssistant) {
      setDisplayedWords([])
      setWordIndex(0)
      lastMsgRef.current = null
      return
    }

    const content = stripMarkdown(lastAssistant.content)
    const words = content.split(/\s+/)

    // Detect if this is a NEW message (not just a streaming update)
    // We check if the ID changed or if the new content doesn't start with the old one
    const msgId = lastAssistant.id || content.slice(0, 30)
    if (lastMsgRef.current !== msgId) {
      setDisplayedWords([])
      setWordIndex(0)
      lastMsgRef.current = msgId
    }

    // Smooth timer to add words one by one
    const timer = setInterval(() => {
      setWordIndex((prev) => {
        if (prev < words.length) {
          const next = prev + 1
          setDisplayedWords(words.slice(0, next))
          return next
        }
        return prev
      })
    }, 380) // 380ms for an elegant, readable pace

    return () => clearInterval(timer)
  }, [lastAssistant?.content])

  // 2. Auto-scroll to bottom as words appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [displayedWords])

  return (
    <div className="flex-1 flex flex-col items-center justify-between py-16 px-8 bg-transparent relative overflow-hidden">
      {/* Background Deep Glow */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-64 bg-accent/5 blur-[120px] pointer-events-none" />

      {/* 1. TOP: User Phrase (Minimal & Stable) */}
      <div className="w-full max-w-[700px] relative z-20 min-h-[80px] flex items-end justify-center pb-6">
        {(() => {
          if (!lastUser)
            return (
              <div className="flex flex-col items-center justify-center gap-2">
                <span className="text-[10px] font-black tracking-[0.8em] text-accent/80 uppercase drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]">
                  Escutando
                </span>
                <div className="flex gap-2 h-4 items-center">
                  <div className="w-1 h-1 rounded-full bg-accent animate-[bounce_0.8s_infinite]" />
                  <div className="w-1 h-1 rounded-full bg-accent animate-[bounce_0.8s_0.15s_infinite]" />
                  <div className="w-1 h-1 rounded-full bg-accent animate-[bounce_0.8s_0.3s_infinite]" />
                </div>
              </div>
            )

          return (
            <div className="flex flex-col items-center animate-in fade-in duration-700">
              <span className="text-[8px] font-black tracking-[0.4em] text-white/20 uppercase mb-2">
                Entrada de Voz
              </span>
              <p className="text-center text-sm text-white/80 font-medium italic leading-relaxed px-12 opacity-60">
                "{stripMarkdown(lastUser.content)}"
              </p>
            </div>
          )
        })()}
      </div>

      {/* 2. CENTER: THE WAVE (The heart of the UI) */}
      <div className="w-full relative h-[250px] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={1000}
          height={250}
          className="w-full h-full max-w-[950px] drop-shadow-[0_0_40px_rgba(168,85,247,0.3)]"
        />
        {/* Subtle scanline aesthetic */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.05)_50%),linear-gradient(90deg,rgba(255,0,0,0.01),rgba(0,255,0,0.005),rgba(0,0,255,0.01))] bg-[length:100%_4px,3px_100%] pointer-events-none opacity-20" />
      </div>

      {/* 3. BOTTOM: Assistant Display (Cinematic Subtitles) */}
      <div className="w-full max-w-[700px] relative z-20 h-[140px] flex flex-col items-center">
        {/* The Fade Mask - creates the "vanishing upwards" effect */}
        <div
          ref={scrollRef}
          className="w-full h-full overflow-y-auto no-scrollbar scroll-smooth px-12 pb-4"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 100%)'
          }}
        >
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-1.5 pt-12">
            {displayedWords.map((word, idx) => {
              const isLatest = idx === displayedWords.length - 1
              const shouldHighlight = isLatest && isSpeaking

              return (
                <span
                  key={`${idx}-${word}`}
                  className={`text-xl font-semibold tracking-tight transition-all duration-1000 ease-out fill-mode-both animate-in fade-in slide-in-from-bottom-2 ${
                    shouldHighlight
                      ? 'text-white scale-105 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]'
                      : 'text-white/40 blur-[0.2px]'
                  }`}
                >
                  {word}
                </span>
              )
            })}
          </div>
        </div>

        {/* Minimal Accent Bar */}
        <div className="w-12 h-[1px] bg-accent/20 mt-4" />
      </div>

      {/* 4. FOOTER: Actions */}
      <div className="flex items-center gap-8 relative z-20">
        {isSpeaking && onStopVoice && (
          <button
            type="button"
            onClick={onStopVoice}
            className="group flex flex-col items-center gap-3 transition-all duration-300 active:scale-95"
          >
            <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/20 group-hover:border-accent/40 transition-all duration-500 shadow-accent-glow">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-accent group-hover:scale-110 transition-transform"
              >
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </div>
            <span className="text-[8px] font-black tracking-[0.5em] uppercase text-accent/60 group-hover:text-accent transition-colors">
              Parar
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onEndCall}
          className="group flex flex-col items-center gap-3 transition-all duration-300 active:scale-95"
        >
          <div className="w-12 h-12 rounded-full bg-red-500/5 border border-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 group-hover:border-red-500/40 transition-all duration-500">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-red-500/80 group-hover:text-red-500 transform rotate-135"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <span className="text-[8px] font-black tracking-[0.5em] uppercase text-red-500/40 group-hover:text-red-500 transition-colors">
            Encerrar
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
  scrollPositionRef,
  isModeChanging = false,
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
  const [localSessionTitle, setLocalSessionTitle] = useState<string | null>(null)
  const isBrainReady = statusInfo?.brain_ready ?? false
  const isBrainLoading = statusInfo?.is_loading ?? false
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

  const displayProgress = isSystemDone ? 100 : Math.min(96, visualProgress || initProgress || 0)
  const loadingProgress = displayProgress
  const shouldSkipIntro = settings?.skip_intro === true
  const hasMessages = messages.length > 0
  const hasUserData = !!localStorage.getItem('momai_user_name') || !!settings?.user_name
  const tier =
    localStorage.getItem('momai_ai_tier') || statusInfo?.ai_tier || settings?.ai_tier || 'lite'
  const showLoading =
    isBooting ||
    (!animationFinished && !hasUserData) ||
    (isModeChanging && !hasUserData) ||
    (isBrainLoading && !isBrainReady && !hasUserData)

  const defaultWaitingMessage = isBrainLoading ? 'Loading AI Model...' : 'Waiting for AI Model...'
  const displayMessage =
    initProgress >= 100 && isBrainLoading
      ? !initMessage || initMessage === 'Sistema pronto.'
        ? defaultWaitingMessage
        : initMessage
      : initMessage

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
                    onReopenGraph={onReopenGraph}
                    onGraphOption={onGraphOption}
                    onSendMessage={onSendMessage}
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
