import { Settings, Theme } from '../../../../hooks/useSettingsCard'

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
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="space-y-1">
        <h2 className="text-lg font-black text-text tracking-tight uppercase">
          {t('settings.general.title')}
        </h2>
        <p className="text-[11px] text-text-muted font-medium">
          {t('settings.general.subtitle')}
        </p>
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                {t('settings.general.theme.dark')}
              </button>
              <button
                onClick={() => changeTheme('light')}
                className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-xs font-bold transition-all ${theme === 'light' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-input border-border text-text-muted hover:text-text'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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

        {/* Modalidade da Assistente - AI Tiers */}
        <div className="space-y-4 pt-6 border-t border-border/40">
          <div className="flex items-center justify-between px-1">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest opacity-70">
              Modalidade da Assistente
            </label>
          </div>
          
          <div className="flex flex-col gap-2">
            {[
              { 
                id: 'lite', 
                title: 'Modo Lite', 
                model: tiersConfig?.lite?.file || 'Qwen 3 0.6B',
                description: 'Apenas texto. Foco total em agilidade e economia de recursos.',
                requirement: 'Usa ~1.5GB RAM',
                color: 'text-emerald-500',
                bg: 'bg-emerald-500/10',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                )
              },
              { 
                id: 'pro', 
                title: 'Modo Pro', 
                model: tiersConfig?.pro?.file || 'LFM 2.5 1.2B',
                description: 'Texto rápido e processamento de voz / síntese neural ativados.',
                requirement: 'Usa ~2.8GB (RAM/VRAM)',
                color: 'text-red-500',
                bg: 'bg-red-500/10',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                )
              },
              { 
                id: 'ultra', 
                title: 'Modo Ultra', 
                model: tiersConfig?.ultra?.file || 'Qwen 3 4B',
                description: 'Capacidade máxima com reconhecimento avançado, voz, internet e calendário.',
                requirement: 'Usa ~5.5GB (RAM/VRAM)',
                color: 'text-yellow-400',
                bg: 'bg-yellow-400/10',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                  <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-white/5 shadow-inner transition-all ${tier.bg} ${tier.color}`}>
                    {tier.icon}
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-black uppercase tracking-tight ${tier.color}`}>
                          {tier.title}
                        </span>
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${isSelected ? 'bg-accent/20 text-accent' : 'bg-black/20 text-text-muted'}`}>
                          {tier.model}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 opacity-80">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isSelected ? 'text-accent' : 'text-text-muted'}>
                          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                        <span className={`text-[9px] font-black uppercase tracking-wider ${isSelected ? 'text-text/90' : 'text-text-muted'}`}>
                          {tier.requirement}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] font-medium text-text-muted mt-0.5 leading-relaxed">
                      {tier.description}
                    </p>
                  </div>
                  
                  <div className="shrink-0">
                    <div className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center ${
                        isSelected 
                          ? 'border-accent bg-accent' 
                          : 'border-text-muted/40 bg-transparent'
                    }`}>
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
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
            onClick={handleDevMode}
            className={`text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 ${
              localStorage.getItem('momai_dev_mode') === 'true' ? 'text-accent' : 'text-text-muted/30 hover:text-accent/50'
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
            Modo Desenvolvedor
          </button>

          <button
            onClick={resetOnboarding}
            className="text-[9px] font-bold text-text-muted/30 uppercase tracking-widest hover:text-red-500/50 transition-colors flex items-center gap-1.5"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
            </svg>
            Reiniciar Boas-vindas
          </button>
        </div>
      </div>
    </div>
  )
}
