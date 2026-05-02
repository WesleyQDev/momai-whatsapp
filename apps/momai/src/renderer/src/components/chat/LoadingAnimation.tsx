import { useEffect, useState } from 'react'
import { useI18n } from '@renderer/i18n'

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
  const [isFadingOut, setIsFadingOut] = useState(false)

  useEffect(() => {
    if (progress >= 100) {
      const timer = setTimeout(() => {
        setIsFadingOut(true)
        if (onComplete) setTimeout(onComplete, 250)
      }, 30)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [progress, onComplete])

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center p-12 transition-all duration-[250ms] ease-out ${
        isFadingOut
          ? 'opacity-0 scale-[0.98] blur-[1px] translate-y-[-3px]'
          : 'opacity-100 scale-100 blur-0 translate-y-0'
      }`}
    >
      <div className="flex flex-col items-center text-center mb-12 animate-fade-in w-full px-4">
        <h1 className="text-[12px] font-black text-text/60 tracking-[0.2em] uppercase max-w-[600px] leading-tight">
          {progress < 100 && isFirstLaunch ? t('loading.firstLaunchNote') : t('loading.welcome')}
        </h1>
        {Math.round(progress) >= 90 && progress < 100 && (
          <p
            className="mt-3 text-[11px] font-medium text-accent/80 tracking-wide animate-pulse"
            style={{ animation: 'fadeIn 0.6s ease-in' }}
          >
            {t('loading.almostReady')}
          </p>
        )}
      </div>

      <div className="w-full max-w-sm mb-8 relative z-10">
        <div className="flex justify-between items-end mb-3 px-1">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/80 animate-pulse mb-1">
              {t('loading.initializingSystem')}
            </span>
            <span className="text-[14px] font-bold text-text/80 tracking-tight">
              {message || t('settings.loadingBody')}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[18px] font-black text-text font-mono leading-none mb-1">
              {Math.round(progress)}%
            </span>
          </div>
        </div>

        <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10 shadow-inner">
          <div
            className="absolute top-0 left-0 h-full bg-accent shadow-[0_0_20px_rgba(139,92,246,0.6)] rounded-full"
            style={{
              width: `${progress}%`,
              transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: 'width'
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] transition-all duration-[250ms] ease-out"
          style={{
            opacity: isFadingOut ? 0 : 1,
            transform: `translate(-50%, -50%) scale(${0.8 + progress / 200})`
          }}
        />
      </div>
    </div>
  )
}
