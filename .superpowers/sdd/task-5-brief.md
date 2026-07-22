### Task 5: TrayMenuView renderer component + route

**Files:**
- Create: `apps/momai/src/renderer/src/views/TrayMenuView.tsx`
- Modify: `apps/momai/src/renderer/src/main.tsx`

**Goal:** Create a React component that renders a native-menu-style popup with live-updating LLM status + soneca countdown + action buttons. Add the route `/tray-menu` to the renderer router.

**TrayMenuView.tsx** — complete code below:

```tsx
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
      case 'start': window.momaiAPI.trayActionStart(); break
      case 'stop': window.momaiAPI.trayActionStop(); break
      case 'restart': window.momaiAPI.trayActionRestart(); break
      case 'open': window.momaiAPI.trayActionOpen(); break
      case 'quit': window.momaiAPI.trayActionQuit(); break
    }
  }, [])

  if (!state) return null

  const s = state.llama
  const llm = s.loading ? 'iniciando' : s.running ? 'ativo' : 'parado'

  let soneca: string | null = null
  if (state.economy.active && state.economy.reason === 'idle') {
    soneca = 'soneca ativa'
  } else if (state.economy.secondsUntilSoneca > 0) {
    soneca = `soneca ${formatCountdown(state.economy.secondsUntilSoneca)}`
  } else if (state.economy.secondsUntilSoneca === 0) {
    soneca = 'ativando soneca'
  } else if (state.economy.secondsUntilSoneca === -1) {
    soneca = 'soneca desligada'
  }

  const statusLine = soneca ? `LLM ${llm} \u00B7 ${soneca}` : `LLM ${llm}`

  return (
    <div className="tray-menu">
      <div className="tray-menu-status">{statusLine}</div>
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
          font-size: 13px;
          padding: 4px 0;
          user-select: none;
          -webkit-app-region: no-drag;
        }
        .tray-menu-status {
          padding: 8px 16px;
          opacity: 0.55;
          cursor: default;
        }
        .tray-menu-item {
          display: block;
          width: 100%;
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: inherit;
          font-size: 13px;
          text-align: left;
          cursor: pointer;
        }
        .tray-menu-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .tray-menu-separator {
          height: 1px;
          margin: 4px 8px;
          background: rgba(255, 255, 255, 0.06);
        }
        @media (prefers-color-scheme: light) {
          body {
            background: rgba(248, 248, 248, 0.95);
            color: #1a1a1a;
          }
          .tray-menu-item:hover {
            background: rgba(0, 0, 0, 0.06);
          }
          .tray-menu-separator {
            background: rgba(0, 0, 0, 0.06);
          }
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: rgba(20, 20, 20, 0.95);
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
```

**main.tsx changes:**

1. Add import after line 19: `import TrayMenuView from './views/TrayMenuView'`
2. Add route after line 29: `<Route path="/tray-menu" element={<TrayMenuView />} />`

**Validation:**
- Run `cd apps/momai && pnpm typecheck:web`

**Commit:** `feat(tray): add TrayMenuView renderer component and route`
