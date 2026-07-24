import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import { stripEmojisAndMarkdown, stripMarkdown } from '../../utils/text'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bandsRef = useRef<number[]>(new Array(16).fill(0))
  const smoothedBandsRef = useRef<number[]>(new Array(16).fill(0))
  const phaseRef = useRef<number>(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  const [activePhraseWords, setActivePhraseWords] = useState<string[]>([])
  const [wordIndex, setWordIndex] = useState(0)
  const [chunkPacingMs, setChunkPacingMs] = useState<number>(320)
  const [phraseId, setPhraseId] = useState(0)

  // Direct 60fps Web Audio API mic capture (ChatGPT-style zero latency reaction)
  useEffect(() => {
    let isMounted = true

    async function initMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        })
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        micStreamRef.current = stream

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        const audioCtx = new AudioCtx()
        audioContextRef.current = audioCtx

        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 64
        analyser.smoothingTimeConstant = 0.75
        analyserRef.current = analyser

        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
      } catch (err) {
        console.warn('[CallMode] Web Audio mic capture fallback:', err)
      }
    }

    initMic()

    return () => {
      isMounted = false
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  const lastBandTimeRef = useRef<number>(0)
  const phraseStartTimeRef = useRef<number>(0)
  const phraseDurationMsRef = useRef<number>(1000)

  // Listen for frequency bands & volume & dynamic phrase audio duration from Python
  useEffect(() => {
    const handleBands = (e: CustomEvent) => {
      const allSubChunks = e.detail as number[][]
      if (allSubChunks && allSubChunks.length > 0) {
        bandsRef.current = allSubChunks[allSubChunks.length - 1]
        lastBandTimeRef.current = Date.now()
      }
    }

    const handleVolume = (e: CustomEvent) => {
      const vol = e.detail
      if (typeof vol === 'number' && vol > 0.01) {
        bandsRef.current = bandsRef.current.map((_, i) => {
          const spread = Math.sin((i / 15) * Math.PI)
          return Math.min(1, vol * spread * (0.8 + Math.random() * 0.4))
        })
      } else if (Array.isArray(vol) && vol.length > 0) {
        bandsRef.current = vol
      }
    }

    const handleAudioPlaybackStarted = (e: CustomEvent) => {
      const detail = e.detail || {}
      const duration = Number(detail.duration || 0)
      const rawText = String(detail.text || '').trim()

      if (rawText) {
        const cleaned = stripEmojisAndMarkdown(rawText)
        const words = cleaned.split(/\s+/).filter(Boolean)

        if (words.length > 0) {
          setActivePhraseWords(words)
          setWordIndex(0)
          setPhraseId((prev) => prev + 1)
          phraseStartTimeRef.current = Date.now()
          phraseDurationMsRef.current = Math.max(800, duration * 1000)
        }
      }
    }

    window.addEventListener('momai_voice_bands' as any, handleBands as any)
    window.addEventListener('momai_voice_volume' as any, handleVolume as any)
    window.addEventListener(
      'momai_audio_playback_started' as any,
      handleAudioPlaybackStarted as any
    )
    return () => {
      window.removeEventListener('momai_voice_bands' as any, handleBands as any)
      window.removeEventListener('momai_voice_volume' as any, handleVolume as any)
      window.removeEventListener(
        'momai_audio_playback_started' as any,
        handleAudioPlaybackStarted as any
      )
    }
  }, [])

  const activePhraseWordsRef = useRef<string[]>([])

  useEffect(() => {
    activePhraseWordsRef.current = activePhraseWords
  }, [activePhraseWords])

  // 60fps real-time clock synchronization with physical audio playback
  useEffect(() => {
    if (!isSpeaking || activePhraseWords.length === 0) return

    let animFrameId: number

    const tick = () => {
      const words = activePhraseWordsRef.current
      if (words.length > 0) {
        const elapsed = Date.now() - phraseStartTimeRef.current
        const progress = Math.min(1.0, Math.max(0, elapsed / phraseDurationMsRef.current))
        const targetIdx = Math.min(words.length - 1, Math.floor(progress * words.length))
        setWordIndex(targetIdx)
      }
      if (isSpeaking) {
        animFrameId = requestAnimationFrame(tick)
      }
    }

    animFrameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameId)
  }, [isSpeaking, phraseId])

  // Keep refs for status/isSpeaking so the render loop reads them without restarting
  const statusRef = useRef(status)
  const isSpeakingRef = useRef(isSpeaking)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  // Animated interpolation refs — these lerp smoothly toward their targets every frame
  const animatedSpeedRef = useRef(0.015)
  const animatedOpacityRef = useRef(0.4)
  // Color channels: [r1,g1,b1, r2,g2,b2, r3,g3,b3, r4,g4,b4] for 4-stop gradient
  const animatedColorsRef = useRef([
    236,
    72,
    153, // #ec4899
    168,
    85,
    247, // #a855f7
    6,
    182,
    212, // #06b6d4
    16,
    185,
    129 // #10b981
  ])
  const animatedWhiteOpacityRef = useRef(0.2)
  const animatedWhiteScaleRef = useRef(0.3)

  // High-performance canvas animation (single persistent loop — never restarts)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    const micDataArray = new Uint8Array(32)

    // Lerp helper
    const lerp = (current: number, target: number, speed: number) =>
      current + (target - current) * speed

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      const curStatus = statusRef.current
      const curSpeaking = isSpeakingRef.current

      ctx.clearRect(0, 0, width, height)

      const drawWave = (
        color: string | CanvasGradient,
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
          const envelope = Math.pow(Math.sin(normX * Math.PI), 1.5)

          const bandIdx = Math.floor(normX * 15)
          const nextBandIdx = Math.min(15, bandIdx + 1)
          const bandLerp = (normX * 15) % 1

          const bandValue =
            smoothedBandsRef.current[bandIdx] * (1 - bandLerp) +
            smoothedBandsRef.current[nextBandIdx] * bandLerp

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

      // Direct Web Audio API mic input reading (Instant 60fps audio reactivity)
      let micActive = false
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(micDataArray)
        let sum = 0
        let maxVal = 0
        for (let i = 0; i < 16; i++) {
          const val = (micDataArray[i] || 0) / 255
          sum += val
          if (val > maxVal) maxVal = val
          if (val > 0.08 && !curSpeaking && curStatus !== 'processing') {
            bandsRef.current[i] = Math.max(bandsRef.current[i] || 0, (val - 0.06) * 1.6)
          }
        }
        // Moderate threshold: sum > 0.9 and maxVal > 0.12 prevents keyboard typing & background noise from triggering micActive
        micActive = sum > 0.9 && maxVal > 0.12 && !curSpeaking && curStatus !== 'processing'
      }

      // --- Smooth interpolation targets based on current state ---
      // Wave speed targets
      const targetSpeed = micActive
        ? 0.09
        : curSpeaking
          ? 0.055
          : curStatus === 'processing'
            ? 0.045
            : 0.015

      // Color targets based on state
      let targetColors: number[]
      if (micActive) {
        targetColors = [255, 75, 31, 255, 144, 104, 248, 181, 0, 252, 227, 138]
      } else if (curStatus === 'processing' && !curSpeaking) {
        targetColors = [139, 92, 246, 168, 85, 247, 6, 182, 212, 59, 130, 246]
      } else {
        targetColors = [236, 72, 153, 168, 85, 247, 6, 182, 212, 16, 185, 129]
      }

      // Opacity and scale targets for the 5-wave group
      const targetOpacity = curStatus === 'idle' && !curSpeaking ? 0.4 : curSpeaking ? 0.9 : 0.85
      const targetWhiteOpacity = curSpeaking ? 0.6 : curStatus === 'processing' ? 0.7 : 0.2
      const targetWhiteScale = curSpeaking ? 0.5 : curStatus === 'processing' ? 0.5 : 0.3

      // --- Smooth interpolation at ~2-3% per frame (organic feel at 60fps ≈ 1-2s transition) ---
      const transitionSpeed = 0.025
      const colorSpeed = 0.03

      animatedSpeedRef.current = lerp(animatedSpeedRef.current, targetSpeed, transitionSpeed)
      animatedOpacityRef.current = lerp(animatedOpacityRef.current, targetOpacity, transitionSpeed)
      animatedWhiteOpacityRef.current = lerp(
        animatedWhiteOpacityRef.current,
        targetWhiteOpacity,
        transitionSpeed
      )
      animatedWhiteScaleRef.current = lerp(
        animatedWhiteScaleRef.current,
        targetWhiteScale,
        transitionSpeed
      )

      // Interpolate colors channel by channel
      const curColors = animatedColorsRef.current
      for (let c = 0; c < 12; c++) {
        curColors[c] = lerp(curColors[c], targetColors[c], colorSpeed)
      }

      // Apply smooth wave phase advance
      phaseRef.current += animatedSpeedRef.current

      // --- Band target computation (all states unified, smooth blending) ---
      for (let i = 0; i < 16; i++) {
        let target = bandsRef.current[i] || 0

        if (curSpeaking) {
          const pulse = (Math.sin(phaseRef.current * 3 + i * 0.5) + 1) / 2
          target = Math.max(target, 0.12 + pulse * 0.25)
        } else if (curStatus === 'processing') {
          const pulse = (Math.sin(phaseRef.current * 2.5 + i * 0.4) + 1) / 2
          const secondary = (Math.cos(phaseRef.current * 1.8 - i * 0.3) + 1) / 2
          target = Math.max(target, 0.15 + pulse * 0.2 + secondary * 0.1)
        } else {
          // idle / listening — gentle breathing
          const pulse = (Math.sin(phaseRef.current * 1.2 + i * 0.3) + 1) / 2
          target = Math.max(target, 0.015 + pulse * 0.025)
        }

        // Slow smoothing factor for organic transitions (0.06 ≈ ~1s settle time)
        smoothedBandsRef.current[i] += (target - smoothedBandsRef.current[i]) * 0.06
        // Gentle decay so bands don't snap to zero
        bandsRef.current[i] *= 0.93
      }

      // Build interpolated gradient from animated color channels
      const cc = animatedColorsRef.current
      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, `rgb(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0})`)
      gradient.addColorStop(0.35, `rgb(${cc[3] | 0},${cc[4] | 0},${cc[5] | 0})`)
      gradient.addColorStop(0.7, `rgb(${cc[6] | 0},${cc[7] | 0},${cc[8] | 0})`)
      gradient.addColorStop(1, `rgb(${cc[9] | 0},${cc[10] | 0},${cc[11] | 0})`)

      for (let i = 0; i < 5; i++) {
        const shift = i * 0.85
        const scale = 0.55 + (4 - i) * 0.13
        const opacity = animatedOpacityRef.current - i * 0.12
        drawWave(gradient, Math.max(0.05, opacity), scale, shift, (i - 2) * 3.5)
      }

      drawWave('#fff', animatedWhiteOpacityRef.current, animatedWhiteScaleRef.current, 0, 0)

      animationFrameId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animationFrameId)
  }, []) // Empty deps — loop runs once, reads state via refs

  // Active spoken sentence calculator (Displays full natural spoken sentence)
  const activeSentenceData = (() => {
    if (activePhraseWords.length === 0) return { words: [], activeIndex: -1 }

    const idx = Math.min(wordIndex, activePhraseWords.length - 1)

    return {
      words: activePhraseWords,
      activeIndex: idx
    }
  })()

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 py-10 px-6 bg-transparent relative overflow-hidden h-full">
      {/* Background Deep Glow - centered */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-80 bg-accent/5 blur-[120px] pointer-events-none" />

      {/* 1. TOP STATUS BADGE (Ultra-Minimalist Modern Typography) */}
      <div className="relative z-20 h-10 flex items-center justify-center">
        {status === 'listening' && (
          <span className="text-[10px] font-medium tracking-[0.3em] text-emerald-300/80 uppercase select-none animate-in fade-in duration-300">
            Ouvindo
          </span>
        )}
        {status === 'processing' && (
          <div className="flex items-center gap-2 select-none animate-in fade-in duration-300">
            <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.3s]" />
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
          </div>
        )}
      </div>

      {/* 2. CENTER: THE WAVE (Centered in the screen with dynamic glow) */}
      <div className="w-full relative flex-1 max-h-[320px] flex items-center justify-center z-10 my-auto">
        {(status === 'processing' || isSpeaking) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <div className="w-48 h-48 rounded-full border-2 border-purple-500/20 border-t-purple-400 border-r-indigo-400 animate-spin blur-[1px] shadow-[0_0_30px_rgba(168,85,247,0.3)]" />
            <div className="absolute w-36 h-36 rounded-full border border-indigo-400/30 border-b-emerald-400 animate-spin [animation-direction:reverse] [animation-duration:3s]" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={1000}
          height={300}
          className={`w-full h-full max-w-[950px] transition-all duration-700 relative z-10 ${
            isSpeaking
              ? 'drop-shadow-[0_0_60px_rgba(236,72,153,0.75)] scale-105'
              : status === 'processing'
                ? 'drop-shadow-[0_0_50px_rgba(99,102,241,0.65)] scale-95 animate-pulse'
                : 'drop-shadow-[0_0_40px_rgba(168,85,247,0.4)] scale-100'
          }`}
        />
        {/* Subtle scanline aesthetic */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.05)_50%),linear-gradient(90deg,rgba(255,0,0,0.01),rgba(0,255,0,0.005),rgba(0,0,255,0.01))] bg-[length:100%_4px,3px_100%] pointer-events-none opacity-10" />
      </div>

      {/* 3. SUBTITLES AREA — Disabled per user request */}

      {/* 4. END CALL BUTTON (Anchored naturally at the bottom) */}
      <div className="relative z-30">
        <button
          type="button"
          onClick={onEndCall}
          className="w-14 h-14 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center group transition-all duration-300 hover:bg-red-500/20 hover:border-red-500/40 hover:shadow-[0_0_25px_rgba(239,68,68,0.2)] hover:scale-105 active:scale-95"
          title="Encerrar Sessão"
        >
          {/* Sleek rotating X icon */}
          <div className="w-5 h-5 relative rotate-45 group-hover:rotate-90 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]">
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px] bg-white/60 group-hover:bg-red-400 rounded-full transition-colors duration-300" />
            <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-white/60 group-hover:bg-red-400 rounded-full transition-colors duration-300" />
          </div>
        </button>
      </div>
    </div>
  )
}

export default CallModeContent
