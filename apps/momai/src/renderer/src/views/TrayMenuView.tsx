import { useEffect, useState, useCallback } from 'react'

interface TrayState {
  llama: { running: boolean; loading: boolean; ready: boolean }
  economy: { active: boolean; reason: string | null; secondsUntilSoneca: number }
  variantName: string
}

function formatCountdown(seconds: number): string {
  if (seconds === -1) return 'desligada'
  if (seconds === 0) return 'ativando'
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (min === 0) return `${sec}s`
  if (min >= 60) {
    const h = Math.floor(min / 60)
    return `${h}h${min % 60}m`
  }
  return `${min}min ${sec}s`
}

export default function TrayMenuView() {
  const [state, setState] = useState<TrayState | null>(null)

  useEffect(() => {
    const cleanup = window.momaiAPI.onTrayStateUpdate(setState)
    return () => cleanup()
  }, [])

  const handleAction = useCallback((action: string) => {
    switch (action) {
      case 'start':
        window.momaiAPI.trayActionStart()
        break
      case 'stop':
        window.momaiAPI.trayActionStop()
        break
      case 'restart':
        window.momaiAPI.trayActionRestart()
        break
      case 'open':
        window.momaiAPI.trayActionOpen()
        break
      case 'quit':
        window.momaiAPI.trayActionQuit()
        break
    }
  }, [])

  if (!state) return null

  const s = state.llama
  const llm = s.loading ? 'iniciando' : s.running ? 'ativo' : 'parado'

  let soneca: string | null = null
  if (state.economy.active && state.economy.reason === 'idle') {
    soneca = 'soneca ativa'
  } else if (state.economy.secondsUntilSoneca > 0) {
    soneca = `soneca em ${formatCountdown(state.economy.secondsUntilSoneca)}`
  } else if (state.economy.secondsUntilSoneca === 0) {
    soneca = 'ativando soneca'
  } else if (state.economy.secondsUntilSoneca === -1) {
    soneca = 'soneca desligada'
  }

  return (
    <div className="tray-menu">
      <div className="tray-menu-status">
        <div className="tray-menu-llm-status">LLM {llm}</div>
        {soneca && <div className="tray-menu-soneca">{soneca}</div>}
      </div>
      <div className="tray-menu-separator" />
      {!s.loading && (
        <>
          {s.running ? (
            <button className="tray-menu-item" onClick={() => handleAction('stop')}>
              Parar LLM
            </button>
          ) : (
            <button className="tray-menu-item" onClick={() => handleAction('start')}>
              Iniciar LLM
            </button>
          )}
          <button className="tray-menu-item" onClick={() => handleAction('restart')}>
            Reiniciar LLM
          </button>
          <div className="tray-menu-separator" />
        </>
      )}
      {!s.loading && (
        <>
          <button className="tray-menu-item" onClick={() => handleAction('open')}>
            Abrir
          </button>
          <button className="tray-menu-item" onClick={() => handleAction('quit')}>
            Sair
          </button>
        </>
      )}
      <style>{`
        .tray-menu {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-size: 12px;
          padding: 2px 0;
          user-select: none;
          -webkit-app-region: no-drag;
        }
        .tray-menu-status {
          padding: 3px 12px;
          cursor: default;
          text-align: center;
        }
        .tray-menu-llm-status {
          opacity: 0.6;
        }
        .tray-menu-soneca {
          opacity: 0.45;
          font-size: 11px;
        }
        .tray-menu-item {
          display: block;
          width: 100%;
          padding: 3px 12px;
          border: none;
          background: transparent;
          color: inherit;
          font-size: 12px;
          text-align: left;
          cursor: pointer;
        }
        .tray-menu-item:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .tray-menu-separator {
          height: 1px;
          margin: 2px 8px;
          background: rgba(255, 255, 255, 0.08);
        }
        @media (prefers-color-scheme: light) {
          body {
            background: #f3f3f3;
            color: #1a1a1a;
          }
          .tray-menu-item:hover {
            background: rgba(0, 0, 0, 0.06);
          }
          .tray-menu-separator {
            background: rgba(0, 0, 0, 0.1);
          }
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: #3a3a3a;
            color: #e4e4e4;
          }
        }
        body {
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
      `}</style>
    </div>
  )
}
