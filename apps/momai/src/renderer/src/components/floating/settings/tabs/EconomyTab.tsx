import React, { useState, useEffect } from 'react'

interface EconomyTabProps {
  t: (key: string) => string
  newApp: { name: string; executable: string; path?: string }
  setNewApp: (app: { name: string; executable: string; path?: string }) => void
  handleAddGamingApp: () => Promise<void>
  handleDeleteGamingApp: (id: number) => Promise<void>
  gamingApps: any[]
  economyConfig?: {
    gaming_mode_enabled: boolean
    idle_timeout_app_open: number
    idle_timeout_minimized: number
    auto_detect_known_games: boolean
  }
  onUpdateConfig?: (config: Partial<any>) => Promise<void>
  economyState?: {
    active: boolean
    reason: string | null
    detectedGames: { name: string; processName: string; steamGridId?: number | null; coverUrl?: string | null }[]
  }
}

interface CatalogGame {
  name: string
  processNames: string[]
  steamGridId?: number | null
  coverUrl?: string | null
}

function getCoverUrl(game: CatalogGame): string | null {
  if (game.coverUrl) return game.coverUrl
  if (game.steamGridId) return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.steamGridId}/header.jpg`
  return null
}

const GAME_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 12h4M8 10v4" />
    <path d="M15.5 12a.5.5 0 0 1 0 1 .5.5 0 0 1 0-1Z" />
    <path d="M18.5 10a.5.5 0 0 1 0 1 .5.5 0 0 1 0-1Z" />
    <path d="M7.5 5c-1.5 0-3 .4-4.2 1.3A5 5 0 0 0 2 12v2a5 5 0 0 0 5 5c1.2 0 2.4-.4 3.3-1l1.5-1.2c.7-.6 1.7-.6 2.4 0l1.5 1.2c.9.6 2.1 1 3.3 1a5 5 0 0 0 5-5v-2a5 5 0 0 0-1.3-3.7C19.5 5.4 18 5 16.5 5h-9Z" />
  </svg>
)

export const EconomyTab = React.memo(
  ({
    t,
    newApp,
    setNewApp,
    handleAddGamingApp,
    handleDeleteGamingApp,
    gamingApps,
    economyConfig,
    onUpdateConfig,
    economyState
  }: EconomyTabProps) => {
    const [catalog, setCatalog] = useState<CatalogGame[]>([])
    const [scanned, setScanned] = useState<any[]>([])
    const [scanning, setScanning] = useState(false)
    const [showAddGame, setShowAddGame] = useState(false)
    const [showTimeout, setShowTimeout] = useState(false)
    const [gamePrefs, setGamePrefs] = useState<Record<string, boolean>>({})

    useEffect(() => {
      console.log('[EconomyTab] Mounting, api present:', !!(window as any).api)
      ;(window as any).api?.getEconomyCatalog?.()
        .then((data: any) => {
          console.log('[EconomyTab] Catalog loaded:', data?.length, 'games')
          setCatalog(data || [])
        })
        .catch((err: any) => console.error('[EconomyTab] Catalog error:', err))
      ;(window as any).api?.scanEconomyLibraries?.()
        .then((data: any) => {
          console.log('[EconomyTab] Scanned:', data?.length, 'games')
          setScanned(data || [])
        })
        .catch((err: any) => console.error('[EconomyTab] Scan error:', err))
      ;(window as any).api?.getEconomyPreferences?.().then((prefs: any) => {
        if (prefs) setGamePrefs(prefs)
      }).catch(() => {})
    }, [])

    const handleScan = async () => {
      setScanning(true)
      try {
        const result = await (window as any).api?.scanEconomyLibraries?.()
        if (result) setScanned(result)
      } finally {
        setScanning(false)
      }
    }

    const toggleGameEconomy = async (gameName: string) => {
      const current = gamePrefs[gameName.toLowerCase()] !== false
      const newState = !current
      setGamePrefs((prev: any) => ({ ...prev, [gameName.toLowerCase()]: newState }))
      await (window as any).api?.setEconomyGamePreference?.(gameName, newState)
    }

    const autoDetectOn = economyConfig?.gaming_mode_enabled ?? false

    // When auto-detect is off, hide scanned games; when on, show them with covers from catalog
    const mergedCatalog = autoDetectOn
      ? scanned.map((s: any) => {
          const match = catalog.find((c: any) => c.name.toLowerCase() === s.name?.toLowerCase())
          if (match) {
            console.log(`[EconomyTab] Match: "${s.name}" → catalog coverUrl="${match.coverUrl}", steamGridId=${match.steamGridId}`)
          } else {
            console.log(`[EconomyTab] No catalog match for: "${s.name}"`)
          }
          if (match && (match.coverUrl || match.steamGridId)) {
            return { ...s, coverUrl: match.coverUrl || getCoverUrl(match), steamGridId: match.steamGridId }
          }
          return s
        })
      : []

    const runningGames = economyState?.detectedGames || []
    const runningNames = new Set(runningGames.map(g => g.name))
    const hasRunning = runningGames.length > 0

    return (
      <div className="space-y-8">
        {/* ===== SONECA DA IA SECTION ===== */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-text tracking-tight">Soneca da IA</h2>
          <p className="text-xs text-text-muted">Define quando a IA deve ser pausada para economizar recursos.</p>
          <div className="rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <span className="text-xs font-semibold text-text">App aberto (ocioso)</span>
              <select
                value={economyConfig?.idle_timeout_app_open ?? 5}
                onChange={(e) => onUpdateConfig?.({ idle_timeout_app_open: Number(e.target.value) })}
                className="bg-input border border-border rounded-lg px-3 py-1.5 pr-8 text-sm text-text outline-none appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff44' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundRepeat: 'no-repeat', backgroundSize: '14px' }}
              >
                <option value={0}>Desligado</option>
                <option value={1}>1 min</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
            <div className="flex items-center justify-between p-4">
              <span className="text-xs font-semibold text-text">App minimizado</span>
              <select
                value={economyConfig?.idle_timeout_minimized ?? 1}
                onChange={(e) => onUpdateConfig?.({ idle_timeout_minimized: Number(e.target.value) })}
                className="bg-input border border-border rounded-lg px-3 py-1.5 pr-8 text-sm text-text outline-none appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff44' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundRepeat: 'no-repeat', backgroundSize: '14px' }}
              >
                <option value={0}>Desligado</option>
                <option value={1}>1 min</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
              </select>
            </div>
          </div>
        </div>

        {/* ===== GAMING MODE SECTION ===== */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-text tracking-tight">Modo Gaming</h3>

          {/* Gaming controls card */}
          <div className="rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <div className="flex flex-col gap-0.5 pr-4">
                <span className="text-xs font-semibold text-text">Auto-detectar jogos</span>
                <span className="text-[11px] text-text-muted font-medium">Escaneia Steam e Epic automaticamente</span>
              </div>
              <button
                onClick={async () => {
                const newVal = !economyConfig?.gaming_mode_enabled
                await onUpdateConfig?.({ gaming_mode_enabled: newVal })
                if (newVal) await handleScan()
              }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  economyConfig?.gaming_mode_enabled ? 'bg-accent/80' : 'bg-white/10'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    economyConfig?.gaming_mode_enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <div className="flex flex-col gap-0.5 pr-4">
                <span className="text-xs font-semibold text-text">Escanear bibliotecas</span>
                <span className="text-[11px] text-text-muted font-medium">Busca jogos instalados no PC</span>
              </div>
              <button
                onClick={handleScan}
                disabled={scanning}
                className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-3 py-1.5 hover:bg-accent/5 transition-all disabled:opacity-40"
              >
                {scanning ? 'Escaneando...' : 'Escanear PC'}
              </button>
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex flex-col gap-0.5 pr-4">
                <span className="text-xs font-semibold text-text">Adicionar jogo manual</span>
                <span className="text-[11px] text-text-muted font-medium">Adiciona um jogo não detectado</span>
              </div>
              <button
                onClick={() => setShowAddGame(!showAddGame)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all text-text-muted border-border/30 hover:text-text hover:border-border/60"
              >
                {showAddGame ? 'Cancelar' : '+ Adicionar'}
              </button>
            </div>
          </div>

          {/* Add game input */}
          {showAddGame && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Caminho da pasta do jogo"
                value={newApp.path || newApp.executable}
                onChange={(e) => {
                  const path = e.target.value
                  const name = path.split(/[\\/]/).pop() || path
                  setNewApp({ name, executable: path })
                }}
                className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-xs font-medium text-text outline-none focus:border-accent/40"
              />
              <button
                onClick={handleAddGamingApp}
                className="px-3 bg-accent text-white rounded-lg text-xs font-bold uppercase hover:opacity-90 transition-all"
              >
                {t('settings.economy.addButton')}
              </button>
            </div>
          )}

          {/* All game catalog here */}

          {/* ===== NOW PLAYING ===== */}
          {hasRunning && (
            <div>
              <h4 className="text-sm font-semibold text-text mb-3">Agora Jogando</h4>
            {runningGames.map((game, idx) => {
              const coverUrl = (game as any).coverUrl
              return (
                <div
                  key={idx}
                  className="relative w-full rounded-2xl overflow-hidden border-2 border-accent/30 bg-accent/5 mb-3"
                >
                  {coverUrl ? (
                    <div className="relative w-full" style={{ aspectRatio: '460/215' }}>
                      <img
                        src={coverUrl}
                        alt={game.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-lg font-bold text-white">{game.name}</span>
                          <span className="text-xs font-medium text-green-400 bg-green-500/20 px-2 py-0.5 rounded-full">
                            Rodando agora
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                      <span className="text-lg font-bold text-text">{game.name}</span>
                      <span className="text-xs font-medium text-green-400">Rodando agora</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

          {/* Custom user-added games (not in catalog) */}
          {gamingApps.filter(a => !mergedCatalog.some((c: any) => c.name === a.name)).length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {gamingApps
                .filter(a => !mergedCatalog.some((c: any) => c.name === a.name))
                .map((app) => (
                  <div
                    key={app.id}
                    className={`relative rounded-xl overflow-hidden border transition-all ${
                      runningNames.has(app.name)
                        ? 'border-accent/50 ring-1 ring-accent/30'
                        : gamePrefs[app.name.toLowerCase()] !== false
                          ? 'border-green-500/30 bg-white/[0.03]'
                          : 'border-border/10 opacity-50 bg-white/[0.01]'
                    }`}
                  >
                    <div className="w-full aspect-[4/5] bg-white/5 flex items-center justify-center relative">
                      <div className="text-text-muted opacity-30">{GAME_ICON}</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleGameEconomy(app.name) }}
                        className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all hover:scale-110 ${
                          gamePrefs[app.name.toLowerCase()] !== false
                            ? 'bg-green-500 text-white'
                            : 'bg-white/10 text-text-muted'
                        }`}
                        title={gamePrefs[app.name.toLowerCase()] !== false ? 'Desativar economia' : 'Ativar economia'}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                      </button>
                    </div>
                    <div className="p-1.5">
                      <p className="text-[10px] font-semibold text-text truncate">{app.name}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteGamingApp(app.id)}
                      className="absolute top-1 right-1 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                    {gamePrefs[app.name.toLowerCase()] !== false && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Game grid */}
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Biblioteca de Jogos</h4>
          {autoDetectOn && (
            <p className="text-[11px] text-text-muted/60 leading-relaxed">
              Jogos ativos têm borda verde. Desativados ficam opacos.
            </p>
          )}
          {mergedCatalog.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-border rounded-xl">
              <span className="text-sm text-text-muted font-medium italic">{scanning ? 'Escaneando...' : 'Nenhum jogo encontrado. Clique em "Escanear PC" para buscar seus jogos.'}</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {mergedCatalog.map((game: any, idx: number) => {
                const coverUrl = getCoverUrl(game)
                const isRunning = runningNames.has(game.name)
                const economyEnabled = gamePrefs[game.name.toLowerCase()] !== false
                return (
                  <div
                    key={idx}
                    onClick={() => toggleGameEconomy(game.name)}
                    className={`relative rounded-xl overflow-hidden border transition-all cursor-pointer ${
                      isRunning
                        ? 'border-accent/50 ring-1 ring-accent/30'
                        : economyEnabled
                          ? 'border-green-500/30 bg-white/[0.03]'
                          : 'border-border/10 opacity-50 bg-white/[0.01]'
                    } hover:brightness-110`}
                  >
                    <div className="w-full aspect-[4/5] bg-white/5 overflow-hidden relative">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={game.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = ''
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-muted opacity-30">
                          {GAME_ICON}
                        </div>
                      )}
                    </div>
                    <div className="p-1.5">
                      <p className="text-[10px] font-semibold text-text truncate">{game.name}</p>
                    </div>
                    {isRunning && (
                      <div className="absolute top-1 left-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse block" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    )
  }
)
