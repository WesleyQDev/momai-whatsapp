import { Settings, LocalDetails } from '../../../../hooks/useSettingsCard'

interface BrainTabProps {
  t: any
  settings: Settings
  tiersConfig: any
  localDetails: LocalDetails
  isAdvancedHardwareOpen: boolean
  setIsAdvancedHardwareOpen: (open: boolean) => void
  updateField: (field: string, value: any, saveNow?: boolean) => Promise<void>
  saveSettings: (settings: Settings) => Promise<any>
  checkLocalStatus: () => Promise<void>
}

export const BrainTab = ({
  t,
  settings,
  tiersConfig,
  localDetails,
  isAdvancedHardwareOpen,
  setIsAdvancedHardwareOpen,
  updateField,
  saveSettings,
  checkLocalStatus
}: BrainTabProps) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div className="space-y-0.5">
          <h2 className="text-lg font-black text-text uppercase tracking-tight">
            {t('settings.brain.title')}
          </h2>
          <p className="text-[10px] text-text-muted font-bold uppercase tracking-wide opacity-70">
            {t('settings.brain.localCoreSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-accent/5 border border-accent/20">
          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="text-[9px] font-black text-accent uppercase tracking-widest">
            {t('settings.brain.active')}
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {/* Persona Section */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
            {t('settings.general.personaLabel')}
          </label>
          <textarea
            value={settings.assistant_persona}
            onChange={(e) => updateField('assistant_persona', e.target.value)}
            onBlur={() => saveSettings(settings)}
            className="w-full h-32 bg-input border border-border/60 rounded-lg px-4 py-3 text-sm text-text focus:border-accent/40 outline-none resize-none transition-all leading-relaxed placeholder:text-text-muted/30"
            placeholder={t('settings.general.personaPlaceholder')}
          />
        </div>

        {/* Modelo Ativo */}
        <div className="space-y-2">
          <label className="text-[9px] font-black text-text-muted uppercase tracking-widest px-1">
            {t('settings.brain.activeModel')}
          </label>
          <div className="p-4 rounded-xl bg-black/30 border border-white/[0.05] shadow-inner flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-text uppercase tracking-tight leading-none mb-1">
                  {tiersConfig?.[settings.ai_tier]?.file || 'Carregando...'}
                </span>
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-text-muted/40 shrink-0">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                  <span className="text-[9px] text-text-muted font-medium opacity-60 uppercase tracking-widest truncate">
                    {tiersConfig?.[settings.ai_tier]?.repo || '...'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-accent/80" />
                    <span className="text-[8px] font-bold text-accent/80 uppercase tracking-tighter">
                      {settings.ai_tier?.toUpperCase() || 'PRO'} MODE
                    </span>
                  </div>
                  <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 flex items-center gap-1.5">
                    <span className="text-[8px] font-black text-text-muted/60 uppercase tracking-tighter">
                      {settings.ai_tier === 'ultra' ? 'Q4_K_XL' : 'Q4_K_M'} GGUF
                    </span>
                  </div>
                  {localDetails.installed_version && (
                    <div className="px-2 py-0.5 rounded-md bg-accent/5 border border-accent/20 flex items-center gap-1.5">
                      <span className="text-[8px] font-black text-accent uppercase tracking-tighter">
                        v{localDetails.installed_version}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hardware e Configuração */}
        <div className="space-y-6 pt-2">
          {/* Quick Settings */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/[0.05] shadow-inner mb-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text uppercase tracking-tight">
                {t('settings.brain.autoStartLabel') || 'Iniciar Automaticamente'}
              </span>
              <span className="text-[9px] text-text-muted font-medium opacity-60 uppercase tracking-widest leading-relaxed max-w-[200px]">
                {t('settings.brain.autoStartDesc') || 'Ligar a inteligência local ao abrir a MomAI'}
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

          {/* Hardware Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest opacity-70">
                {t('settings.brain.hardware')}
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* GPU Card */}
              <button
                onClick={() => {
                  const target = ['cuda', 'vulkan'].includes(localDetails.recommended_build || '') 
                    ? localDetails.recommended_build 
                    : 'auto'
                  updateField('local_backend', target, true).then(checkLocalStatus)
                }}
                className={`p-3.5 rounded-xl border flex flex-col gap-2 transition-all relative overflow-hidden group text-left ${
                  ['cuda', 'vulkan'].includes(settings.local_backend === 'auto' ? (localDetails.current_local_backend || '') : settings.local_backend)
                    ? 'bg-white/5 border-white/20'
                    : 'bg-black/30 border-white/[0.05] hover:bg-black/40 hover:border-white/10 text-text/60 hover:text-text'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="10" x2="6" y2="14" /><line x1="18" y1="10" x2="18" y2="14" />
                    </svg>
                    <span className="text-[9px] font-bold uppercase tracking-widest leading-none">Placa de Vídeo</span>
                  </div>
                  {['cuda', 'vulkan'].includes(settings.local_backend === 'auto' ? (localDetails.current_local_backend || '') : settings.local_backend) && (
                    <div className="flex items-center gap-1.5 text-text-muted/80 animate-in fade-in duration-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
                      <span className="text-[7px] font-bold uppercase tracking-tighter">Ativo</span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-bold uppercase tracking-tight truncate w-full text-text/90">
                  {localDetails.detected_hardware || t('settings.brain.searching')}
                </span>
                {['cuda', 'vulkan'].includes(localDetails.recommended_build || '') && (
                  <div className="mt-1">
                    <span className="text-[8px] font-bold text-green-500/80 uppercase tracking-widest px-1">
                      Recomendado
                    </span>
                  </div>
                )}
              </button>
              
              {/* CPU Card */}
              <button
                onClick={() => updateField('local_backend', 'cpu', true).then(checkLocalStatus)}
                className={`p-3.5 rounded-xl border flex flex-col gap-2 transition-all relative overflow-hidden group text-left ${
                  (settings.local_backend === 'auto' ? localDetails.current_local_backend : settings.local_backend) === 'cpu'
                    ? 'bg-white/5 border-white/20'
                    : 'bg-black/30 border-white/[0.05] hover:bg-black/40 hover:border-white/10 text-text/60 hover:text-text'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3m6-3v3M9 20v3m6-3v3M20 9h3m-3 6h3M1 9h3m-3 6h3" />
                    </svg>
                    <span className="text-[9px] font-bold uppercase tracking-widest leading-none">Processador</span>
                  </div>
                  {(settings.local_backend === 'auto' ? localDetails.current_local_backend : settings.local_backend) === 'cpu' && (
                    <div className="flex items-center gap-1.5 text-text-muted/80 animate-in fade-in duration-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
                      <span className="text-[7px] font-bold uppercase tracking-tighter">Ativo</span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-bold uppercase tracking-tight truncate w-full text-text/90">
                  {localDetails.cpu_name || '...'}
                </span>
                {localDetails.recommended_build === 'cpu' && (
                  <div className="mt-1">
                    <span className="text-[8px] font-bold text-green-500/80 uppercase tracking-widest px-1">
                      Recomendado
                    </span>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Acceleration Section */}
          <div className="space-y-3 pt-4 border-t border-border/10">
            <button 
              onClick={() => setIsAdvancedHardwareOpen(!isAdvancedHardwareOpen)}
              className="flex items-center gap-2 text-[10px] font-black text-text-muted uppercase tracking-widest opacity-70 hover:opacity-100 transition-opacity w-full text-left"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`transition-transform duration-300 ${isAdvancedHardwareOpen ? 'rotate-90' : ''}`}>
                <path d="M9 18l6-6-6-6" />
              </svg>
              Avançado
            </button>
            {isAdvancedHardwareOpen && (
              <div className="flex flex-col gap-1.5 min-h-[200px] animate-in slide-in-from-top-2 fade-in duration-300">
              {[
                { 
                  id: 'auto', 
                  label: t('settings.brain.backend.auto'),
                  desc: localDetails.recommended_build 
                    ? `Para o seu hardware o melhor é usar ${
                        localDetails.recommended_build === 'cuda' ? 'NVIDIA CUDA' : 
                        localDetails.recommended_build === 'vulkan' ? 'VULKAN' : 'CPU'
                      }`
                    : 'Seleção inteligente baseada no hardware disponível.'
                },
                { 
                  id: 'cuda', 
                  label: t('settings.brain.backend.cuda'),
                  desc: 'Aceleração de alto desempenho para GPUs NVIDIA.'
                },
                { 
                  id: 'vulkan', 
                  label: t('settings.brain.backend.vulkan'),
                  desc: 'Compatibilidade universal para diversas GPUs modernas.'
                },
                { 
                  id: 'cpu', 
                  label: t('settings.brain.backend.cpu'),
                  desc: 'Processamento padrão via processador (mais lento).'
                }
              ].map((opt) => {
                const isSelected = settings.local_backend === opt.id
                const isInstalled = opt.id === 'auto' || localDetails.installed_backends?.includes(opt.id)
                
                return (
                  <button
                    key={opt.id}
                    onClick={() => updateField('local_backend', opt.id, true).then(checkLocalStatus)}
                    className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 ${
                      isSelected 
                        ? 'bg-accent/10 border-accent/40 shadow-lg' 
                        : 'bg-black/10 border-white/5 hover:bg-black/20 hover:border-white/10'
                    }`}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-[12px] font-black uppercase tracking-tight ${isSelected ? 'text-accent' : 'text-text'}`}>
                        {opt.label}
                        {opt.id === 'auto' && (
                          <span className="ml-2 text-[9px] text-green-500 font-bold opacity-80 uppercase tracking-tighter">
                            Recomendado
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-text-muted font-medium opacity-60">
                        {opt.desc}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      {!isInstalled && (
                        <div className="flex items-center gap-2 bg-accent/20 px-3 py-1.5 rounded-lg text-[10px] font-black text-accent uppercase tracking-tighter hover:bg-accent/30 transition-colors">
                          <span>Instalar</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="animate-bounce">
                            <path d="M17.5 19a3.5 3.5 0 0 0 0-7h-.5a7 7 0 1 0-12 5" /><path d="M12 11v6" /><path d="M9 14l3 3 3-3" />
                          </svg>
                        </div>
                      )}
                      
                      {isSelected ? (
                        <div className="flex items-center gap-2 text-accent">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Configurado</span>
                          <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-white shadow-lg shadow-accent/20 scale-90">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        </div>
                      ) : isInstalled && (
                        <div className="w-5 h-5 rounded-full border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
