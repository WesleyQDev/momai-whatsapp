import { Settings, Theme } from '../../../../hooks/useSettingsCard'
import React, { useEffect, useState } from 'react'

interface GeneralTabProps {
  t: any
  settings: Settings
  theme: Theme
  updateField: (field: string, value: any, saveNow?: boolean) => Promise<void>
  saveSettings: (settings: Settings) => Promise<any>
  changeTheme: (theme: Theme) => void
  handleTierChange: (tier: 'lite' | 'pro' | 'ultra') => void
  resetOnboarding: () => void
  tiersConfig: any
}

export const GeneralTab = React.memo(
  ({
    t,
    settings,
    theme,
    updateField,
    saveSettings,
    changeTheme,
    handleTierChange,
    resetOnboarding,
    tiersConfig
  }: GeneralTabProps) => {
    const [autoStartWindows, setAutoStartWindows] = useState(false)
    const [showIaTooltip, setShowIaTooltip] = useState(false)

    useEffect(() => {
      window.api
        ?.getAutoStart?.()
        .then(setAutoStartWindows)
        .catch(() => {})
    }, [])

    const handleAutoStartWindows = async (enabled: boolean) => {
      try {
        const result = await window.api?.setAutoStart(enabled)
        setAutoStartWindows(result ?? enabled)
      } catch (error) {
        console.error('Failed to set auto-start:', error)
      }
    }

    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-text tracking-tight">
            {t('settings.general.title')}
          </h2>
          <p className="text-xs text-text-muted font-medium">{t('settings.general.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                {t('settings.general.userLabel')}
              </label>
              <input
                type="text"
                value={settings.user_name}
                onChange={(e) => updateField('user_name', e.target.value)}
                onBlur={() => saveSettings(settings)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-text focus:border-accent/40 outline-none transition-all"
                placeholder={t('settings.general.userPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                {t('settings.general.themeLabel')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => changeTheme('dark')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${theme === 'dark' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-input border-border text-text-muted hover:text-text'}`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  {t('settings.general.theme.dark')}
                </button>
                <button
                  onClick={() => changeTheme('light')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${theme === 'light' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-input border-border text-text-muted hover:text-text'}`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.07" x2="5.64" y2="17.66" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                  {t('settings.general.theme.light')}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                {t('settings.language.uiLabel')}
              </span>
              <select
                value={settings.locale}
                onChange={(e) => updateField('locale', e.target.value, true)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 pr-8 text-xs font-medium text-text outline-none appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff44' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundPosition: 'right 8px center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '14px'
                }}
              >
                <option value="pt-BR">{t('settings.language.ptBR')}</option>
                <option value="en-US">{t('settings.language.enUS')}</option>
                <option value="es">{t('settings.language.es')}</option>
                <option value="fr">{t('settings.language.fr')}</option>
                <option value="de">{t('settings.language.de')}</option>
                <option value="it">{t('settings.language.it')}</option>
              </select>
            </div>
          </div>

          {/* Auto-start Settings */}
          <div className="rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <div className="flex flex-col gap-0.5 pr-4">
                <span className="text-xs font-semibold text-text">
                  {t('settings.general.autoStartWindowsLabel')}
                </span>
                <span className="text-[11px] text-text-muted font-medium">
                  {t('settings.general.autoStartWindowsDesc')}
                </span>
              </div>
              <button
                onClick={() => handleAutoStartWindows(!autoStartWindows)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoStartWindows ? 'bg-accent/80' : 'bg-white/10'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoStartWindows ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <div className="flex flex-col gap-0.5 pr-4 relative">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-text">
                    {t('settings.general.localAiLabel')}
                  </span>
                  <button
                    onClick={() => setShowIaTooltip(!showIaTooltip)}
                    onMouseEnter={() => setShowIaTooltip(true)}
                    onMouseLeave={() => setShowIaTooltip(false)}
                    className="relative group"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-text-muted/40 hover:text-text-muted/70 transition-colors"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    {showIaTooltip && (
                      <div className="absolute bottom-full left-0 mb-2 w-60 p-2.5 rounded-lg bg-gray-800/95 border border-white/10 text-[11px] text-text-muted/90 leading-relaxed z-50 shadow-xl">
                        <span className="font-semibold">{t('common.on')}:</span>{' '}
                        {t('settings.general.localAiTooltipOn')}
                        <br />
                        <span className="font-semibold">{t('common.off')}:</span>{' '}
                        {t('settings.general.localAiTooltipOff')}
                      </div>
                    )}
                  </button>
                </div>
                <span className="text-[11px] text-text-muted font-medium">
                  {t('settings.general.localAiDesc')}
                </span>
              </div>
              <button
                onClick={() => updateField('auto_start_llm', !settings.auto_start_llm, true)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.auto_start_llm !== false ? 'bg-accent/80' : 'bg-white/10'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.auto_start_llm !== false ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex flex-col gap-0.5 pr-4">
                <span className="text-xs font-semibold text-text">
                  {t('settings.general.skipIntroLabel')}
                </span>
                <span className="text-[11px] text-text-muted font-medium">
                  {t('settings.general.skipIntroDesc')}
                </span>
              </div>
              <button
                onClick={() => updateField('skip_intro', !settings.skip_intro, true)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.skip_intro ? 'bg-accent/80' : 'bg-white/10'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.skip_intro ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex flex-col gap-0.5 pr-4">
                <span className="text-xs font-semibold text-text">
                  {t('settings.general.keepInTrayLabel')}
                </span>
                <span className="text-[11px] text-text-muted font-medium">
                  {t('settings.general.keepInTrayDesc')}
                </span>
              </div>
              <button
                onClick={() => updateField('keep_in_tray', !settings.keep_in_tray, true)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.keep_in_tray !== false ? 'bg-accent/80' : 'bg-white/10'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.keep_in_tray !== false ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
          {/* Modalidade da Assistente - AI Tiers */}
          <div className="space-y-3 pt-4 border-t border-border/40">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              {t('settings.general.assistantModeLabel')}
            </label>

            <div className="flex flex-col gap-2">
              {[
                {
                  id: 'lite',
                  title: t('settings.tier.lite.title'),
                  model: tiersConfig?.lite?.file || 'Qwen 3 0.6B',
                  description: t('settings.tier.lite.description'),
                  requirement: t('settings.tier.lite.requirement'),
                  color: 'text-emerald-500',
                  bg: 'bg-emerald-500/10',
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  )
                },
                {
                  id: 'pro',
                  title: t('settings.tier.pro.title'),
                  model: tiersConfig?.pro?.file || 'LFM 2.5 1.2B',
                  description: t('settings.tier.pro.description'),
                  requirement: t('settings.tier.pro.requirement'),
                  color: 'text-red-500',
                  bg: 'bg-red-500/10',
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  )
                },
                {
                  id: 'ultra',
                  title: t('settings.tier.ultra.title'),
                  model: tiersConfig?.ultra?.file || 'Qwen 3 4B',
                  description: t('settings.tier.ultra.description'),
                  requirement: t('settings.tier.ultra.requirement'),
                  color: 'text-yellow-400',
                  bg: 'bg-yellow-400/10',
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  )
                }
              ].map((tier) => {
                const isSelected = settings.ai_tier === tier.id
                return (
                  <button
                    key={tier.id}
                    onClick={() => handleTierChange(tier.id as any)}
                    className={`flex items-center gap-3 p-3.5 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'bg-accent/5 border-accent/30'
                        : 'bg-input border-border hover:bg-white/[0.03] hover:border-border/60'
                    }`}
                  >
                    <div
                      className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border border-white/5 shadow-inner transition-all ${tier.bg} ${tier.color}`}
                    >
                      {tier.icon}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-bold ${tier.color}`}>{tier.title}</span>
                          <span
                            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md truncate ${isSelected ? 'bg-accent/10 text-accent' : 'bg-white/[0.05] text-text-muted'}`}
                          >
                            {tier.model}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-80 shrink-0">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className={isSelected ? 'text-accent' : 'text-text-muted'}
                          >
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                          </svg>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide ${isSelected ? 'text-text/90' : 'text-text-muted'}`}
                          >
                            {tier.requirement}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs font-medium text-text-muted leading-relaxed">
                        {tier.description}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <div
                        className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center ${
                          isSelected
                            ? 'border-accent bg-accent'
                            : 'border-text-muted/30 bg-transparent'
                        }`}
                      >
                        {isSelected && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Manutencao Sutil */}
          <div className="pt-3 flex justify-end items-center">
            <button
              type="button"
              onClick={resetOnboarding}
              className="text-[11px] font-medium text-text-muted/40 uppercase tracking-wide hover:text-red-500/60 transition-colors flex items-center gap-1"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              {t('settings.general.resetOnboarding')}
            </button>
          </div>
        </div>
      </div>
    )
  }
)
