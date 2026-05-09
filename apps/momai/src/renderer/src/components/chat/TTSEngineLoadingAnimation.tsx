import { useEffect, useRef, useState } from 'react'

interface TTSEngineLoadingAnimationProps {
  loading: boolean
  pendingAutoTts: boolean
  message: string
}

export default function TTSEngineLoadingAnimation({
  loading,
  pendingAutoTts,
  message
}: TTSEngineLoadingAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dots, setDots] = useState('')

  // Animate dots for loading state
  useEffect(() => {
    if (!loading) return

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'))
    }, 500)

    return () => clearInterval(interval)
  }, [loading])

  // Canvas waveform animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let phase = 0

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      phase += loading ? 0.08 : 0.03

      const numWaves = 3
      const bars = 24

      for (let wave = 0; wave < numWaves; wave++) {
        ctx.beginPath()

        const opacity = loading ? 0.9 - wave * 0.2 : 0.4 - wave * 0.1
        ctx.globalAlpha = opacity

        const gradient = ctx.createLinearGradient(0, 0, width, 0)
        if (loading) {
          gradient.addColorStop(0, '#f59e0b')
          gradient.addColorStop(0.5, '#f97316')
          gradient.addColorStop(1, '#f59e0b')
        } else {
          gradient.addColorStop(0, '#10b981')
          gradient.addColorStop(0.5, '#34d399')
          gradient.addColorStop(1, '#10b981')
        }

        ctx.strokeStyle = gradient
        ctx.lineWidth = 2
        ctx.lineCap = 'round'

        for (let i = 0; i <= bars; i++) {
          const x = (i / bars) * width
          const normX = i / bars

          const envelope = Math.sin(normX * Math.PI)
          const amplitude = loading ? 12 + wave * 4 : 6 + wave * 2
          const y =
            height / 2 + Math.sin(normX * Math.PI * 4 + phase + wave * 0.5) * amplitude * envelope

          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        ctx.stroke()
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animationFrameId)
  }, [loading])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[600] pointer-events-none">
      <div
        className={`rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-500 ${
          loading
            ? 'bg-amber-500/10 border-amber-400/30 shadow-amber-500/20'
            : 'bg-emerald-500/10 border-emerald-400/30 shadow-emerald-500/20'
        }`}
        style={{ minWidth: '320px', maxWidth: '420px' }}
      >
        {/* Waveform Canvas */}
        <div className="relative h-16 overflow-hidden rounded-t-2xl">
          <canvas ref={canvasRef} width={420} height={64} className="w-full h-full" />
          {/* Subtle overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            {/* Animated Icon */}
            <div className="relative">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  loading ? 'bg-amber-500/20' : 'bg-emerald-500/20'
                }`}
              >
                {loading ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-amber-400 animate-spin"
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-emerald-400"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              {/* Pulsing ring */}
              {loading && (
                <div className="absolute inset-0 rounded-full border-2 border-amber-400/50 animate-ping" />
              )}
            </div>

            {/* Text Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className={`text-[10px] font-black tracking-[0.15em] uppercase ${
                    loading ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {loading ? 'Carregando Voz' : 'Voz Pronta'}
                </span>
                {pendingAutoTts && loading && (
                  <span className="text-[9px] font-bold text-amber-300/70 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                    AUTO-PLAY
                  </span>
                )}
              </div>
              <p className="text-[11px] font-medium text-white/80 leading-snug truncate">
                {loading ? `${message}${dots}` : message}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
