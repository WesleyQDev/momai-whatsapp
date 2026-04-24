import { LocalDetails, Settings } from '../../../../hooks/useSettingsCard'

interface UpdatesTabProps {
  t: any
  appVersion: string
  localDetails: LocalDetails
  installStatus: string
  installProgress: number
  handleInstallEngine: (backend?: string) => Promise<void>
  settings: Settings
}

export const UpdatesTab = ({
  t,
  appVersion,
  localDetails,
  installStatus,
  installProgress,
  handleInstallEngine,
  settings
}: UpdatesTabProps) => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-text tracking-tight uppercase">
          {t('settings.updates.title')}
        </h2>
        <p className="text-[11px] text-text-muted font-medium">{t('settings.updates.subtitle')}</p>
      </div>

      <div className="space-y-4">
        <div className="p-5 rounded-xl border bg-input border-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-black text-text uppercase tracking-tight">
                {t('settings.updates.coreTitle')}
              </span>
              <span className="text-[10px] text-text-muted font-medium">
                {t('settings.updates.coreVersion', { version: appVersion })}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-black text-text-muted uppercase border border-border px-3 py-1 rounded-full bg-black/20">
            {t('settings.updates.systemUpToDate')}
          </span>
        </div>

        {localDetails.installed_version !== localDetails.latest_version &&
          localDetails.latest_version && (
            <div className="p-5 rounded-xl border bg-accent/5 border-accent/20 space-y-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-black text-text uppercase tracking-tight">
                      {t('settings.updates.engineTitle')}
                    </span>
                    <span className="text-[10px] text-accent font-bold uppercase">
                      Nova versão v{localDetails.latest_version} disponível
                    </span>
                  </div>
                </div>
                {installStatus === 'installing' ? (
                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">
                    {t('settings.updates.updating', { percent: installProgress })}
                  </span>
                ) : (
                  <button
                    onClick={() =>
                      handleInstallEngine(
                        settings.local_backend === 'auto' ? undefined : settings.local_backend
                      )
                    }
                    className="px-4 py-2 bg-accent text-white text-[10px] font-black uppercase rounded-lg hover:opacity-90 transition-all shadow-lg shadow-accent/20"
                  >
                    {t('settings.updates.updateTo', { version: localDetails.latest_version })}
                  </button>
                )}
              </div>
              {installStatus === 'installing' && (
                <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300 ease-out"
                    style={{ width: `${installProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  )
}
