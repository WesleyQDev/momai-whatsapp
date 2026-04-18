import { Settings, Theme } from '../../../../hooks/useSettingsCard'
import { useEffect, useState } from 'react'

interface GeneralTabProps {
  t: any
  settings: Settings
  theme: Theme
  updateField: (field: string, value: any, saveNow?: boolean) => Promise<void>
  saveSettings: (settings: Settings) => Promise<any>
  changeTheme: (theme: Theme) => void
  handleTierChange: (tier: 'lite' | 'pro' | 'ultra') => void
  handleDevMode: () => void
  resetOnboarding: () => void
  tiersConfig: any
}

export const GeneralTab = ({
  t,
  settings,
  theme,
  updateField,
  saveSettings,
  changeTheme,
  handleTierChange,
  handleDevMode,
  resetOnboarding,
  tiersConfig
}: GeneralTabProps) => {
  const [autoStartWindows, setAutoStartWindows] = useState(false)
  const [showIaTooltip, setShowIaTooltip] = useState(false)
  const [isDevMode, setIsDevMode] = useState(() => localStorage.getItem('momai_dev_mode') === 'true')

  useEffect(() => {
    window.api
      ?.getAutoStart?.()
      .then(setAutoStartWindows)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const syncDevMode = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') {
        setIsDevMode(detail)
        return
      }
      setIsDevMode(localStorage.getItem('momai_dev_mode') === 'true')
    }

    window.addEventListener('momai_dev_mode_sync', syncDevMode as EventListener)
    return () => window.removeEventListener('momai_dev_mode_sync', syncDevMode as EventListener)
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
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-text tracking-tight uppercase">
          {t('settings.general.title')}
        </h2>
        <p className="text-[11px] text-text-muted font-medium">{t('settings.general.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
              {t('settings.general.userLabel')}
            </label>
            <input
              type="text"
              value={settings.user_name}
              onChange={(e) => updateField('user_name', e.target.value)}
              onBlur={() => saveSettings(settings)}
              className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text focus:border-accent/40 outline-none transition-all"
              placeholder={t('settings.general.userPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
              {t('settings.general.themeLabel')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => changeTheme('dark')}
                className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-xs font-bold transition-all ${theme === 'dark' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-input border-border text-text-muted hover:text-text'}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                {t('settings.general.theme.dark')}
              </button>
              <button
                onClick={() => changeTheme('light')}
                className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-xs font-bold transition-all ${theme === 'light' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-input border-border text-text-muted hover:text-text'}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
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

        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">
              {t('settings.language.uiLabel')}
            </span>
            <select
              value={settings.locale}
              onChange={(e) => updateField('locale', e.target.value, true)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none"
            >
              <option value="pt-BR">{t('settings.language.ptBR')}</option>
              <option value="en-US">{t('settings.language.enUS')}</option>
            </select>
          </div>
        </div>

        {/* Auto-start Settings */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/[0.05] shadow-inner">
            <div className="flex flex-col gap-1 pr-4">
              <span className="text-[11px] font-bold text-text uppercase tracking-tight">
                {t('settings.general.autoStartWindowsLabel')}
              </span>
              <span className="text-[9px] text-text-muted font-medium opacity-60">
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

          <div className="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/[0.05] shadow-inner">
            <div className="flex flex-col gap-1 pr-4 relative">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-text uppercase tracking-tight">
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
                    className="text-text-muted/30 hover:text-text-muted/50 transition-colors"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  {showIaTooltip && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 p-2.5 rounded-lg bg-gray-800/95 border border-white/5 text-[10px] text-text-muted/80 leading-relaxed z-50">
                      <span className="font-bold">{t('common.on')}:</span>{' '}
                      {t('settings.general.localAiTooltipOn')}
                      <br />
                      <span className="font-bold">{t('common.off')}:</span>{' '}
                      {t('settings.general.localAiTooltipOff')}
                    </div>
                  )}
                </button>
              </div>
              <span className="text-[9px] text-text-muted font-medium opacity-60">
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

          <div className="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/[0.05] shadow-inner">
            <div className="flex flex-col gap-1 pr-4">
              <span className="text-[11px] font-bold text-text uppercase tracking-tight">
                {t('settings.general.skipIntroLabel')}
              </span>
              <span className="text-[9px] text-text-muted font-medium opacity-60">
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
        </div>
        {/* Modalidade da Assistente - AI Tiers */}
        <div className="space-y-4 pt-6 border-t border-border/40">
          <div className="flex items-center justify-between px-1">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest opacity-70">
              {t('settings.general.assistantModeLabel')}
            </label>
          </div>

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
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
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
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
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
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
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
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                    isSelected
                      ? 'bg-accent/10 border-accent/40 shadow-sm'
                      : 'bg-input border-border hover:bg-black/10 hover:border-border/80'
                  }`}
                >
                  <div
                    className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-white/5 shadow-inner transition-all ${tier.bg} ${tier.color}`}
                  >
                    {tier.icon}
                  </div>

                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[13px] font-black uppercase tracking-tight ${tier.color}`}
                        >
                          {tier.title}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${isSelected ? 'bg-accent/20 text-accent' : 'bg-black/20 text-text-muted'}`}
                        >
                          {tier.model}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 opacity-80">
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className={isSelected ? 'text-accent' : 'text-text-muted'}
                        >
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider ${isSelected ? 'text-text/90' : 'text-text-muted'}`}
                        >
                          {tier.requirement}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] font-medium text-text-muted mt-0.5 leading-relaxed">
                      {tier.description}
                    </p>
                  </div>

                  <div className="shrink-0">
                    <div
                      className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center ${
                        isSelected
                          ? 'border-accent bg-accent'
                          : 'border-text-muted/40 bg-transparent'
                      }`}
                    >
                      {isSelected && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="4"
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
        <div className="pt-2 flex justify-end items-center gap-6">
          <button
            type="button"
            onClick={handleDevMode}
            className={`text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 ${
              isDevMode
                ? 'text-accent'
                : 'text-text-muted/30 hover:text-accent/50'
            }`}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            {t('settings.general.devMode')}
          </button>

          <button
            type="button"
            onClick={resetOnboarding}
            className="text-[9px] font-bold text-text-muted/30 uppercase tracking-widest hover:text-red-500/50 transition-colors flex items-center gap-1.5"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
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
