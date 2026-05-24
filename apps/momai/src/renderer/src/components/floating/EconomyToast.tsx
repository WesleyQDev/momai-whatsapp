import { useState, useEffect } from 'react'

interface DetectedGame {
  name: string
  processName: string
  coverUrl?: string | null
}

interface EconomyToastProps {
  economyState?: {
    active: boolean
    reason: string | null
    detectedGames: DetectedGame[]
  }
}

export default function EconomyToast({ economyState }: EconomyToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [state, setState] = useState(economyState || null)

  useEffect(() => {
    if (!economyState) {
      const cleanup = (window as any).api?.onEconomyStateChange?.(
        (newState: { active: boolean; reason: string | null; detectedGames: DetectedGame[] }) => {
          setState(newState)
          setIsVisible(true)
        }
      )
      return () => cleanup?.()
    }
    return
  }, [economyState])

  useEffect(() => {
    if (economyState) {
      setState(economyState)
      setIsVisible(true)
    }
  }, [economyState])

  if (!state || !isVisible) return null

  const isActive = state.active
  const games = state.detectedGames || []
  const firstGame = games[0]

  return (
    <div className="fixed bottom-24 right-6 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div
        className={`p-3 rounded-2xl border shadow-2xl flex items-center gap-3 min-w-[300px] backdrop-blur-xl ${
          isActive
            ? 'bg-card/90 border-accent/30 text-text'
            : 'bg-card/80 border-border/50 text-text'
        }`}
      >
        {isActive && firstGame ? (
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-white/5">
            {firstGame.coverUrl ? (
              <img
                src={firstGame.coverUrl}
                alt={firstGame.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted/30">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 12h4M8 10v4" />
                  <path d="M15.5 12a.5.5 0 0 1 0 1 .5.5 0 0 1 0-1Z" />
                  <path d="M18.5 10a.5.5 0 0 1 0 1 .5.5 0 0 1 0-1Z" />
                  <path d="M7.5 5c-1.5 0-3 .4-4.2 1.3A5 5 0 0 0 2 12v2a5 5 0 0 0 5 5c1.2 0 2.4-.4 3.3-1l1.5-1.2c.7-.6 1.7-.6 2.4 0l1.5 1.2c.9.6 2.1 1 3.3 1a5 5 0 0 0 5-5v-2a5 5 0 0 0-1.3-3.7C19.5 5.4 18 5 16.5 5h-9Z" />
                </svg>
              </div>
            )}
          </div>
        ) : (
          <div className="w-14 h-14 rounded-xl bg-black/20 flex items-center justify-center shrink-0">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
        )}

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Economia
            </span>
            <div
              className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-text-muted'}`}
            />
          </div>
          <span className="text-[13px] font-bold leading-tight mt-0.5 text-text truncate">
            {isActive
              ? firstGame
                ? firstGame.name
                : 'Modo Economia Ativado'
              : 'Sistemas Restaurados'}
          </span>
          <p className="text-[10px] text-text-muted/70 mt-0.5 leading-relaxed truncate">
            {isActive
              ? games.length > 1
                ? `+${games.length - 1} ${games.length === 2 ? 'outro jogo' : 'outros jogos'} em execução`
                : 'Economia de recursos ativa'
              : 'Monitoramento em espera'}
          </p>
        </div>

        <button
          onClick={() => setIsVisible(false)}
          className="p-1 hover:bg-white/5 rounded-lg transition-colors shrink-0"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-text-muted/40"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
