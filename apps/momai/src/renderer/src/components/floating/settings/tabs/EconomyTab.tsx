import React from 'react'

interface EconomyTabProps {
  t: any
  newApp: { name: string; executable: string }
  setNewApp: (app: { name: string; executable: string }) => void
  handleAddGamingApp: () => Promise<void>
  handleDeleteGamingApp: (id: number) => Promise<void>
  gamingApps: any[]
}

export const EconomyTab = React.memo(
  ({
    t,
    newApp,
    setNewApp,
    handleAddGamingApp,
    handleDeleteGamingApp,
    gamingApps
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

          <div className="space-y-2">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              {t('settings.economy.addTrigger')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t('settings.economy.appNamePlaceholder')}
                value={newApp.name}
                onChange={(e) => setNewApp({ ...newApp, name: e.target.value })}
                className="flex-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm font-medium text-text outline-none focus:border-accent/40"
              />
              <input
                type="text"
                placeholder={t('settings.economy.appExePlaceholder')}
                value={newApp.executable}
                onChange={(e) => setNewApp({ ...newApp, executable: e.target.value })}
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
                      <span className="text-xs text-accent font-mono">{app.executable}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteGamingApp(app.id)}
                      className="p-2 text-text-muted hover:text-red-500 transition-colors"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
)
