import React from 'react'

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
    detectedGames: { name: string; processName: string }[]
  }
}

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
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-text tracking-tight">
              {t('settings.economy.title')}
            </h2>
            <span className="text-[10px] font-bold bg-accent text-white px-2 py-0.5 rounded-md tracking-wide">
              {t('settings.economy.badge')}
            </span>
          </div>
          <p className="text-sm text-text-muted font-medium">{t('settings.economy.subtitle')}</p>
        </div>

        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-accent/5 border border-border/20 flex gap-4">
            <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 12h4M14 8h-4v8h4M15 12h3" />
                <rect x="2" y="6" width="20" height="12" rx="2" />
              </svg>
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-sm font-bold text-text">
                {t('settings.economy.monitoringTitle')}
              </span>
              <p className="text-xs text-text-muted leading-relaxed">
                {t('settings.economy.monitoringBody')}
              </p>
            </div>
          </div>

        </div>

        {/* LLM Timeout Controls */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            LLM Timeout
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-border/40">
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
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-border/40">
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
        </div>

        {/* Gaming Mode */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            Gaming Mode
          </label>
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-border/40">
            <div className="flex flex-col">
              <span className="text-sm text-text">Auto-detect games</span>
              <span className="text-xs text-text-muted">Save resources when gaming</span>
            </div>
            <button
              onClick={() => onUpdateConfig?.({ gaming_mode_enabled: !economyConfig?.gaming_mode_enabled })}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                economyConfig?.gaming_mode_enabled ? 'bg-accent' : 'bg-white/10'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  economyConfig?.gaming_mode_enabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            {t('settings.economy.addTrigger')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('settings.economy.appExePlaceholder')}
              value={newApp.path || newApp.executable}
              onChange={(e) => {
                const path = e.target.value
                const name = path.split(/[\\/]/).pop() || path
                setNewApp({ name, executable: path })
              }}
              className="flex-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm font-medium text-text outline-none focus:border-accent/40"
            />
            <button
              onClick={handleAddGamingApp}
              className="px-5 bg-accent text-white rounded-lg text-sm font-bold uppercase hover:opacity-90 transition-all"
            >
              {t('settings.economy.addButton')}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            {t('settings.economy.monitoredApps')}
          </label>
          <div className="grid grid-cols-1 gap-2">
            {gamingApps.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-border rounded-xl">
                <span className="text-sm text-text-muted font-medium italic">
                  {t('settings.economy.emptyApps')}
                </span>
              </div>
            ) : (
              gamingApps.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-2 p-4 rounded-xl bg-white/[0.03] border border-border/40"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-semibold text-text">{app.name}</span>
                    <span className="text-xs text-text-muted font-mono truncate">{app.executable}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteGamingApp(app.id)}
                    className="p-2 text-text-muted hover:text-red-500 transition-colors shrink-0"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Active Status */}
        {economyState?.active && (
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30">
            <span className="text-sm text-green-400 font-medium">
              Economy active — {economyState.reason === 'gaming' ? 'Game detected' : 'Idle timeout'}
            </span>
            {economyState.detectedGames.length > 0 && (
              <div className="mt-1 text-xs text-green-400/70">
                {economyState.detectedGames.map(g => g.name).join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
)
