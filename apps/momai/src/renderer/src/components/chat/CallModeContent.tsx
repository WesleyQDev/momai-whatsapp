import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import { stripMarkdown } from '../../utils/text'

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
  const wordsRef = useRef<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!lastAssistant) {
      setDisplayedWords([])
      setWordIndex(0)
      lastMsgRef.current = null
      wordsRef.current = []
      return
    }

    const content = stripMarkdown(lastAssistant.content)
    const words = content.split(/\s+/).filter(Boolean)
    wordsRef.current = words

    // Detect if this is a NEW message (not just a streaming update)
    // We prefer ID, but fallback to a stable prefix if ID is not available
    const msgId = lastAssistant.id ?? content.slice(0, 50)

    // If the message is shorter than what we had, or ID changed, it's new
    const isNewMessage =
      lastMsgRef.current !== msgId &&
      (!lastMsgRef.current || !content.startsWith(lastMsgRef.current.toString().slice(0, 20)))

    if (isNewMessage) {
      setDisplayedWords([])
      setWordIndex(0)
      lastMsgRef.current = msgId
    }
  }, [lastAssistant?.content, lastAssistant?.id])

  // Independent animation timer
  useEffect(() => {
    const timer = setInterval(() => {
      setWordIndex((prev) => {
        const words = wordsRef.current
        if (prev < words.length) {
          const next = prev + 1
          setDisplayedWords(words.slice(0, next))
          return next
        }
        return prev
      })
    }, 150) // Faster (150ms) for better responsiveness

    return () => clearInterval(timer)
  }, [])

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
            {status === 'processing' && displayedWords.length === 0 && (
              <span className="text-xl font-semibold tracking-tight text-white/20 animate-pulse italic">
                Pensando...
              </span>
            )}
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

export default CallModeContent
