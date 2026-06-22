import { LocalDetails, Settings } from '../../../../hooks/useSettingsCard'
import React from 'react'

interface UpdatesTabProps {
  t: any
  appVersion: string
  localDetails: LocalDetails
  installStatus: string
  installProgress: number
  handleInstallEngine: (backend?: string) => Promise<void>
  settings: Settings
}

export const UpdatesTab = React.memo(
  ({
    t,
    appVersion,
    localDetails,
    installStatus,
    installProgress,
    handleInstallEngine,
    settings
  }: UpdatesTabProps) => {
    return (
      <div className="space-y-8">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-text tracking-tight">
            {t('settings.updates.title')}
          </h2>
          <p className="text-sm text-text-muted font-medium">{t('settings.updates.subtitle')}</p>
        </div>

        <div className="space-y-4">
          <div className="p-5 rounded-xl border bg-input border-border/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-text">
                  {t('settings.updates.coreTitle')}
                </span>
                <span className="text-xs text-text-muted font-medium">
                  {t('settings.updates.coreVersion', { version: appVersion })}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-bold text-text-muted uppercase border border-border px-3 py-1 rounded-full bg-white/[0.03]">
              {t('settings.updates.systemUpToDate')}
            </span>
          </div>

          {localDetails.installed_version !== localDetails.latest_version &&
            localDetails.latest_version && (
              <div className="p-5 rounded-xl border bg-accent/5 border-accent/20 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-text">
                        {t('settings.updates.engineTitle')}
                      </span>
                      <span className="text-xs text-accent font-bold">
                        Nova versão v{localDetails.latest_version} disponível
                      </span>
                    </div>
                  </div>
                  {installStatus === 'installing' ? (
                    <span className="text-xs font-bold text-accent uppercase tracking-wide">
                      {t('settings.updates.updating', { percent: installProgress })}
                    </span>
                  ) : (
                    <button
                      onClick={() =>
                        handleInstallEngine(
                          settings.local_backend === 'auto' ? undefined : settings.local_backend
                        )
                      }
                      className="px-4 py-2.5 bg-accent text-white text-xs font-bold uppercase rounded-lg hover:opacity-90 transition-all shadow-lg shadow-accent/20"
                    >
                      {t('settings.updates.updateTo', { version: localDetails.latest_version })}
                    </button>
                  )}
                </div>
                {installStatus === 'installing' && (
                  <div className="h-2 w-full bg-white/[0.05] rounded-full overflow-hidden">
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
)

UpdatesTab.displayName = 'UpdatesTab'
