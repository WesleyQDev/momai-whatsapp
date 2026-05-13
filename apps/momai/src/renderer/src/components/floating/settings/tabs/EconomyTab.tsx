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
    const [showAddGame, setShowAddGame] = useState(false)
    const [showTimeout, setShowTimeout] = useState(false)

    useEffect(() => {
      ;(window as any).api?.getEconomyCatalog?.().then(setCatalog).catch(() => {})
    }, [])

    const runningGames = economyState?.detectedGames || []
    const runningNames = new Set(runningGames.map(g => g.name))
    const hasRunning = runningGames.length > 0

    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-text tracking-tight">
            {t('settings.economy.title')}
          </h2>
        </div>

        {/* Settings row: Gaming Mode + LLM Timeout + Add Game */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Gaming Mode toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdateConfig?.({ gaming_mode_enabled: !economyConfig?.gaming_mode_enabled })}
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
            <span className="text-xs font-semibold text-text">Auto-detect</span>
          </div>

          {/* LLM Timeout selector */}
          <select
            value={economyConfig?.idle_timeout_app_open ?? 0}
            onChange={(e) => onUpdateConfig?.({ idle_timeout_app_open: Number(e.target.value) })}
            className="bg-input border border-border rounded-lg px-2 py-1 text-xs text-text outline-none"
            title="LLM timeout when app is open (idle)"
          >
            <option value={0}>LLM timeout: Off</option>
            <option value={1}>1 min</option>
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={30}>30 min</option>
          </select>

          {/* Add game button */}
          <button
            onClick={() => setShowAddGame(!showAddGame)}
            className="text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
          >
            + Add Game
          </button>
        </div>

        {/* LLM Timeout section (collapsible, collapsed by default) */}
        {showTimeout && (
          <div className="space-y-2 p-3 rounded-xl bg-white/[0.03] border border-border/20">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">App open (idle)</span>
              <select
                value={economyConfig?.idle_timeout_app_open ?? 5}
                onChange={(e) => onUpdateConfig?.({ idle_timeout_app_open: Number(e.target.value) })}
                className="bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-text outline-none"
              >
                <option value={0}>Off</option>
                <option value={1}>1 min</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">App minimized</span>
              <select
                value={economyConfig?.idle_timeout_minimized ?? 1}
                onChange={(e) => onUpdateConfig?.({ idle_timeout_minimized: Number(e.target.value) })}
                className="bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-text outline-none"
              >
                <option value={0}>Off</option>
                <option value={1}>1 min</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
              </select>
            </div>
          </div>
        )}

        {/* Add game input (expandable) */}
        {showAddGame && (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Game folder path"
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

        {/* ===== NOW PLAYING SECTION ===== */}
        {hasRunning && (
          <div>
            <h3 className="text-sm font-bold text-text mb-3">Agora Jogando</h3>
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

        {/* ===== GAME CATALOG GRID ===== */}
        <div>
          <h3 className="text-sm font-bold text-text mb-3">Biblioteca de Jogos</h3>

          {/* Custom user-added games (not in catalog) */}
          {gamingApps.filter(a => !catalog.some(c => c.name === a.name)).length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 mb-4">
              {gamingApps
                .filter(a => !catalog.some(c => c.name === a.name))
                .map((app) => (
                  <div
                    key={app.id}
                    className={`relative rounded-xl overflow-hidden border ${
                      runningNames.has(app.name) ? 'border-accent/50 ring-1 ring-accent/30' : 'border-border/20'
                    } bg-white/[0.02] group`}
                  >
                    <div className="w-full aspect-[3/4] bg-white/5 flex items-center justify-center">
                      <div className="text-text-muted opacity-50">{GAME_ICON}</div>
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
                  </div>
                ))}
            </div>
          )}

          {/* Catalog games grid */}
          {catalog.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-border rounded-xl">
              <span className="text-sm text-text-muted font-medium italic">Carregando catálogo...</span>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {catalog.map((game, idx) => {
                const coverUrl = getCoverUrl(game)
                const isRunning = runningNames.has(game.name)
                return (
                  <div
                    key={idx}
                    className={`relative rounded-xl overflow-hidden border ${
                      isRunning ? 'border-accent/50 ring-1 ring-accent/30' : 'border-border/10'
                    } bg-white/[0.02] transition-all hover:border-border/30 hover:bg-white/[0.04]`}
                  >
                    <div className="w-full aspect-[3/4] bg-white/5 overflow-hidden">
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
