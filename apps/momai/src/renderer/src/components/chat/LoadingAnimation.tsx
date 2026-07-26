import { useEffect, useState, useRef } from 'react'
import { useI18n } from '../../i18n'

interface LoadingAnimationProps {
  progress: number
  message?: string
  onComplete?: () => void
  isFirstLaunch?: boolean
}

export default function LoadingAnimation({
  progress,
  message,
  onComplete,
  isFirstLaunch
}: LoadingAnimationProps) {
  const { t } = useI18n()
  const [visualProgress, setVisualProgress] = useState(progress)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Ref de progresso para a malha da animação 60fps ler sem reiniciar o efeito
  const progressRef = useRef(visualProgress)
  useEffect(() => {
    progressRef.current = visualProgress
  }, [visualProgress])

  // Aceleração suave e rápida da porcentagem até 100% ao concluir
  useEffect(() => {
    if (progress < 100) {
      setVisualProgress((prev) => Math.max(prev, progress))
      return undefined
    }

    // Quando progress >= 100: garante que visualProgress vá até 100% rapidamente (~300ms)
    const interval = setInterval(() => {
      setVisualProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        const remaining = 100 - prev
        const step = Math.max(4, remaining * 0.45)
        return Math.min(100, prev + step)
      })
    }, 16)

    return () => clearInterval(interval)
  }, [progress])

  // Dispara transição de saída somente APÓS o usuário ver exatamente 100% no centro
  useEffect(() => {
    if (visualProgress >= 100) {
      // Pausa de 250ms para que o número 100% fique claramente visível na tela
      const timer = setTimeout(() => {
        setIsFadingOut(true)
        if (onComplete) setTimeout(onComplete, 450)
      }, 250)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [visualProgress, onComplete])

  // Timer para contar tempo decorrido durante o carregamento
  useEffect(() => {
    if (progress >= 100) return undefined

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [progress])

  // Animação circular Canvas (executa em loop contínuo sem reiniciar ângulos a cada update de progresso)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    let animId: number
    let angleClockwise = 0
    let angleCounterClockwise = 0

    const render = () => {
      const w = canvas.width
      const h = canvas.height
      const cx = w / 2
      const cy = h / 2
      const radius = Math.min(w, h) * 0.38
      const currentProgress = progressRef.current

      ctx.clearRect(0, 0, w, h)

      // 1. Ambient radial glow central
      const radialGlow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.4)
      radialGlow.addColorStop(0, 'rgba(168, 85, 247, 0.12)')
      radialGlow.addColorStop(0.6, 'rgba(6, 182, 212, 0.04)')
      radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = radialGlow
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.4, 0, Math.PI * 2)
      ctx.fill()

      // 2. Trilhos de fundo sutis
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 3
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(cx, cy, radius - 12, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
      ctx.lineWidth = 2
      ctx.stroke()

      // 3. Circunferência Maior: Degradê Azul com Rosa (Sentido Horário - Rotação Contínua)
      const gradientMaior = ctx.createLinearGradient(
        cx + Math.cos(angleClockwise) * radius,
        cy + Math.sin(angleClockwise) * radius,
        cx - Math.cos(angleClockwise) * radius,
        cy - Math.sin(angleClockwise) * radius
      )
      gradientMaior.addColorStop(0, '#06b6d4') // Azul ciano
      gradientMaior.addColorStop(0.5, '#a855f7') // Roxo intermediário
      gradientMaior.addColorStop(1, '#ec4899') // Rosa vibrante

      ctx.save()
      ctx.beginPath()
      const startAngleCW = angleClockwise
      const endAngleCW = angleClockwise + Math.PI * 1.55 // Arco contínuo de 280°
      ctx.arc(cx, cy, radius, startAngleCW, endAngleCW)
      ctx.strokeStyle = gradientMaior
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(236, 72, 153, 0.5)'
      ctx.shadowBlur = 10
      ctx.stroke()
      ctx.restore()

      // 4. Circunferência Menor: Verde Marinho / Teal (Sentido Anti-horário - Rotação Contínua)
      const gradientMenor = ctx.createLinearGradient(
        cx + Math.cos(angleCounterClockwise) * (radius - 12),
        cy + Math.sin(angleCounterClockwise) * (radius - 12),
        cx - Math.cos(angleCounterClockwise) * (radius - 12),
        cy - Math.sin(angleCounterClockwise) * (radius - 12)
      )
      gradientMenor.addColorStop(0, '#0d9488') // Verde marinho escuro
      gradientMenor.addColorStop(0.5, '#14b8a6') // Teal vivo
      gradientMenor.addColorStop(1, '#10b981') // Verde esmeralda

      ctx.save()
      ctx.beginPath()
      const startAngleCCW = angleCounterClockwise
      const endAngleCCW = angleCounterClockwise + Math.PI * 1.25 // Arco contínuo de 225°
      ctx.arc(cx, cy, radius - 12, startAngleCCW, endAngleCCW)
      ctx.strokeStyle = gradientMenor
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(20, 184, 166, 0.6)'
      ctx.shadowBlur = 8
      ctx.stroke()
      ctx.restore()

      // 5. Circunferência Branca de Loading (Arco do Progresso 0% a 100%)
      if (currentProgress > 0) {
        const pctAngle = (Math.min(100, Math.max(0, currentProgress)) / 100) * Math.PI * 2
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, radius + 6, -Math.PI / 2, -Math.PI / 2 + pctAngle)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.shadowColor = '#ffffff'
        ctx.shadowBlur = 8
        ctx.stroke()
        ctx.restore()
      }

      // Velocidade moderada e natural de rotação contínua
      angleClockwise += 0.016
      angleCounterClockwise -= 0.014
      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [])

  const roundedProgress = Math.round(visualProgress)
  const isDelayed = elapsedSeconds >= 120
  const isLongDelayed = elapsedSeconds >= 240

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center p-8 transition-all duration-500 ease-out select-none relative overflow-hidden ${
        isFadingOut
          ? 'opacity-0 scale-95 blur-md translate-y-[-10px]'
          : 'opacity-100 scale-100 blur-0 translate-y-0'
      }`}
    >
      {/* Luz de fundo decorativa */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
        <div
          className="w-[380px] h-[380px] bg-accent/5 rounded-full blur-[100px] transition-all duration-500"
          style={{
            transform: `scale(${0.85 + roundedProgress / 300})`
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full my-auto">
        {/* 1. TÍTULO NO TOPO */}
        <h1 className="text-xl font-bold text-text tracking-tight mb-8 animate-fade-in">
          {progress < 100 && isFirstLaunch ? t('loading.firstLaunchNote') : 'Bem-vindo à MomAI'}
        </h1>

        {/* 2. ANIMAÇÃO CIRCULAR COM PORCENTAGEM NO CENTRO */}
        <div className="relative w-48 h-48 flex items-center justify-center mb-6">
          <canvas
            ref={canvasRef}
            width={240}
            height={240}
            className="w-full h-full object-contain pointer-events-none"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-3xl font-extrabold text-text font-mono tracking-tight tabular-nums drop-shadow-md">
              {roundedProgress}%
            </span>
          </div>
        </div>

        {/* 3. NOME DA ETAPA DE PROGRESSO */}
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium text-text/80 tracking-normal transition-all duration-200">
            {message || t('settings.loadingBody')}
          </span>
        </div>

        {/* 4. MENSAGEM DE DEMORA (2 MINUTOS / 120s E 4 MINUTOS / 240s) */}
        <div
          className={`mt-8 pt-4 border-t border-white/5 transition-all duration-700 ease-in-out flex flex-col items-center ${
            isDelayed
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
        >
          <p className="text-xs text-text-muted/80 leading-relaxed font-medium max-w-xs transition-all duration-500">
            {isLongDelayed ? (
              <>Algo pode não ter saído bem, reinicie e tente novamente a MomAI 😅</>
            ) : (
              <>
                Está demorando mais que o normal.
                <br />
                Aguarde mais um pouco ou reinicie o aplicativo.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
