import React, { useState, useEffect } from 'react'
import icon from '../assets/icon.png'

interface TitleBarProps {
  onClearHistory?: () => void
  activeRoute?: string
}

export default function TitleBar({}: TitleBarProps) {
  const [version, setVersion] = useState('..')

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  const handleMinimize = () => {
    window.api.minimize()
  }

  const handleMaximize = () => {
    window.api.maximize()
  }

  const handleClose = () => {
    window.api.close()
  }

  return (
    <div
      className="h-8 bg-bg/80 backdrop-blur-xl flex items-center select-none w-full border-b border-white/5 relative z-[300] app-titlebar px-3 transition-all duration-500 animate-slide-down"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Esquerda - Espaçador para manter o centro no centro */}
      <div className="flex-1" />

      {/* Centro - Logo, Titulo e Versão */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
        <img
          src={icon}
          alt="Icon"
          draggable={false}
          className="w-3.5 h-3.5 select-none pointer-events-none"
        />
        <div className="flex items-baseline gap-1.5 translate-y-[0.5px]">
          <span className="text-[11px] font-black text-text/80 uppercase tracking-[0.1em]">
            MomAI
          </span>
          <span className="text-[11px] font-black text-text/80 uppercase tracking-[0.1em]">
            v{version}
          </span>
        </div>
      </div>

      {/* Direita - Botoes */}
      <div className="flex h-full items-center flex-1 justify-end">
        <button
          onClick={handleMinimize}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-all duration-300 ease-out border-none bg-transparent cursor-pointer"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Minimizar"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <path d="M2 6h8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-white/5 hover:text-text transition-all duration-300 ease-out border-none bg-transparent cursor-pointer"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Maximizar"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="6" height="6" strokeWidth="1.5" rx="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="h-full w-10 flex items-center justify-center text-text-muted hover:bg-red-500 hover:text-white transition-all duration-300 ease-out border-none bg-transparent cursor-pointer"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Fechar"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <path d="M3 3l6 6M9 3l-6 6" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
