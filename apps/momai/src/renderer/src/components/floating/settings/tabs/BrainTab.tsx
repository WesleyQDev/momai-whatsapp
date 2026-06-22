import { Settings, LocalDetails } from '../../../../hooks/useSettingsCard'
import React, { useMemo } from 'react'

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

export const BrainTab = React.memo(
  ({
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
    const currentBackend = useMemo(() => {
      return settings.local_backend === 'auto'
        ? localDetails.current_local_backend || ''
        : settings.local_backend
    }, [settings.local_backend, localDetails.current_local_backend])

    const isGpuActive = useMemo(() => {
      return ['cuda', 'vulkan'].includes(currentBackend)
    }, [currentBackend])

    const backendOptions = useMemo(
      () => [
        {
          id: 'auto',
          label: t('settings.brain.backend.auto'),
          desc: localDetails.recommended_build
            ? `Para o seu hardware o melhor é usar ${
                localDetails.recommended_build === 'cuda'
                  ? 'NVIDIA CUDA'
                  : localDetails.recommended_build === 'vulkan'
                    ? 'VULKAN'
                    : 'CPU'
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
          desc: t('settings.brain.backend.cpuDesc')
        }
      ],
      [t, localDetails.recommended_build]
    )

    const normalizeMode = (mode: unknown): 'min' | 'medium' | 'max' | 'custom' => {
      const value = String(mode || '').toLowerCase()
      if (value === 'min' || value === 'medium' || value === 'max' || value === 'custom')
        return value
      return 'min'
    }

    const clampTokens = (value: number): number => {
      const stepped = Math.round(Number(value || 0) / 256) * 256
      return Math.max(1024, Math.min(16384, stepped))
    }

    const currentMode = normalizeMode(settings.context_window_mode)
    const currentTokens = clampTokens(Number(settings.context_window_tokens || 2048))
    const ramGb = Number(localDetails.total_ram_gb || 0)
    const vramGb = Number(localDetails.total_vram_gb || 0)
    const gpuBackend = currentBackend === 'cuda' || currentBackend === 'vulkan'

    const estimateAutoTokens = (mode: 'min' | 'medium' | 'max'): number => {
      const factors = { min: 0.3, medium: 0.55, max: 0.85 }
      const factor = factors[mode]
      const mbPer1k = gpuBackend ? 90 : 110
      const baseBudgetGb = gpuBackend
        ? Math.max(2, (vramGb || 4) * 0.35)
        : Math.max(1, (ramGb || 8) * 0.1)
      const tokens = Math.floor((baseBudgetGb * factor * 1024 * 1000) / mbPer1k)
      return clampTokens(tokens)
    }

    const modeTokens = {
      min: estimateAutoTokens('min'),
      medium: estimateAutoTokens('medium'),
      max: estimateAutoTokens('max'),
      custom: currentTokens
    }

    const estimatedCtxGb = useMemo(() => {
      const mbPer1k = gpuBackend ? 90 : 110
      const tokens = currentMode === 'custom' ? currentTokens : modeTokens[currentMode]
      return (tokens / 1000) * (mbPer1k / 1024)
    }, [gpuBackend, currentMode, currentTokens, modeTokens])

    const estimatedModelGb =
      settings.ai_tier === 'ultra' ? 3.8 : settings.ai_tier === 'pro' ? 2.2 : 1.3
    const estimatedTotalGb = estimatedModelGb + estimatedCtxGb

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold text-text tracking-tight">
              {t('settings.brain.title')}
            </h2>
            <p className="text-[11px] text-text-muted font-medium">
              {t('settings.brain.localCoreSubtitle')}
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent/5 border border-accent/20">
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-[9px] font-bold text-accent uppercase tracking-wide">
              {t('settings.brain.active')}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {/* Persona Section */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              {t('settings.general.personaLabel')}
            </label>
            <textarea
              value={settings.assistant_persona}
              onChange={(e) => updateField('assistant_persona', e.target.value)}
              onBlur={() => saveSettings(settings)}
              className="w-full h-28 bg-input border border-border/60 rounded-lg px-3 py-2.5 text-xs text-text focus:border-accent/40 outline-none resize-none transition-all leading-relaxed placeholder:text-text-muted/30"
              placeholder={t('settings.general.personaPlaceholder')}
            />
          </div>

          {/* Modelo Ativo */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              {t('settings.brain.activeModel')}
            </label>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-border/40 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-text leading-none truncate">
                    {tiersConfig?.[settings.ai_tier]?.file || 'Carregando...'}
                  </span>
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-text-muted/40 shrink-0"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                    <span className="text-[9px] text-text-muted font-medium uppercase tracking-wide truncate">
                      {tiersConfig?.[settings.ai_tier]?.repo || '...'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <div className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/10 flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-accent/80" />
                      <span className="text-[9px] font-bold text-accent/80 uppercase tracking-wide">
                        {settings.ai_tier?.toUpperCase() || 'PRO'} MODE
                      </span>
                    </div>
                    <div className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/10 flex items-center gap-1">
                      <span className="text-[9px] font-bold text-text-muted/60 uppercase tracking-wide">
                        {settings.ai_tier === 'ultra' ? 'Q4_K_XL' : 'Q4_K_M'} GGUF
                      </span>
                    </div>
                    {localDetails.installed_version && (
                      <div className="px-2 py-0.5 rounded bg-accent/5 border border-accent/20 flex items-center gap-1">
                        <span className="text-[9px] font-bold text-accent uppercase tracking-wide">
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
          <div className="space-y-4 pt-2">
            {/* Hardware Section */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                {t('settings.brain.hardware')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {/* GPU Card - Exibição */}
                <div className="p-3 rounded-lg border bg-white/[0.03] border-border/40 flex flex-col gap-1.5 relative overflow-hidden">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-1.5">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="2" y="2" width="20" height="8" rx="2" />
                        <rect x="2" y="14" width="20" height="8" rx="2" />
                        <line x1="6" y1="10" x2="6" y2="14" />
                        <line x1="18" y1="10" x2="18" y2="14" />
                      </svg>
                      <span className="text-[10px] font-bold uppercase tracking-wide leading-none">
                        {t('settings.brain.gpuLabel')}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold tracking-tight truncate w-full text-text/90">
                    {localDetails.detected_hardware || t('settings.brain.searching')}
                  </span>
                  {localDetails.recommended_build === 'cuda' && (
                    <div className="mt-0.5">
                      <span className="text-[9px] font-bold text-green-500/80 uppercase tracking-wide px-1">
                        {t('settings.brain.recommended')}
                      </span>
                    </div>
                  )}
                </div>

                {/* CPU Card - Exibição */}
                <div className="p-3 rounded-lg border bg-white/[0.03] border-border/40 flex flex-col gap-1.5 relative overflow-hidden">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-1.5">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                        <rect x="9" y="9" width="6" height="6" />
                        <path d="M9 1v3m6-3v3M9 20v3m6-3v3M20 9h3m-3 6h3M1 9h3m-3 6h3" />
                      </svg>
                      <span className="text-[10px] font-bold uppercase tracking-wide leading-none">
                        {t('settings.brain.processorLabel')}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold tracking-tight truncate w-full text-text/90">
                    {localDetails.cpu_name || '...'}
                  </span>
                  {localDetails.recommended_build === 'cpu' && (
                    <div className="mt-0.5">
                      <span className="text-[9px] font-bold text-green-500/80 uppercase tracking-wide px-1">
                        {t('settings.brain.recommended')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Toggle GPU/CPU */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-border/40">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-accent"
                    >
                      <rect x="2" y="2" width="20" height="8" rx="2" />
                      <rect x="2" y="14" width="20" height="8" rx="2" />
                      <line x1="6" y1="10" x2="6" y2="14" />
                      <line x1="18" y1="10" x2="18" y2="14" />
                    </svg>
                    <span className="text-xs font-semibold text-text">
                      {t('settings.brain.useGpuLabel')}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted font-medium">
                    {isGpuActive
                      ? t('settings.brain.gpuEnabled', {
                          mode: localDetails.recommended_build === 'cuda' ? 'CUDA' : 'VULKAN'
                        })
                      : t('settings.brain.gpuDisabled')}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const target = isGpuActive
                      ? 'cpu'
                      : ['cuda', 'vulkan'].includes(localDetails.recommended_build || '')
                        ? localDetails.recommended_build
                        : 'auto'
                    updateField('local_backend', target, true).then(checkLocalStatus)
                  }}
                  className={`relative w-11 h-5 rounded-full transition-all duration-300 ${
                    isGpuActive ? 'bg-accent' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-lg transition-all duration-300 ${
                      isGpuActive ? 'left-6' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Acceleration Section */}
            <div className="space-y-2 pt-3 border-t border-border/10">
              <button
                onClick={() => setIsAdvancedHardwareOpen(!isAdvancedHardwareOpen)}
                className="flex items-center gap-2 text-[11px] font-semibold text-text-muted uppercase tracking-wide opacity-70 hover:opacity-100 transition-opacity w-full text-left"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform duration-300 ${isAdvancedHardwareOpen ? 'rotate-90' : ''}`}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                {t('settings.brain.advanced')}
              </button>
              {isAdvancedHardwareOpen && (
                <div className="flex flex-col gap-1.5 min-h-[200px]">
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-border/30 space-y-2 mb-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                        Janela de Contexto
                      </label>
                      <button
                        onClick={() => {
                          updateField('context_window_mode', 'min', true)
                          updateField('context_window_tokens', modeTokens.min, true)
                        }}
                        className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-white/[0.05] border border-border/40 text-text-muted hover:text-text hover:bg-white/[0.09] transition-colors"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'min', title: 'Mínimo', subtitle: `${modeTokens.min} tokens` },
                        { id: 'medium', title: 'Médio', subtitle: `${modeTokens.medium} tokens` },
                        { id: 'max', title: 'Máximo', subtitle: `${modeTokens.max} tokens` },
                        {
                          id: 'custom',
                          title: 'Personalizado',
                          subtitle: `${currentTokens} tokens`
                        }
                      ].map((opt) => {
                        const selected = currentMode === opt.id
                        return (
                          <button
                            key={opt.id}
                            onClick={() => {
                              const mode = opt.id as 'min' | 'medium' | 'max' | 'custom'
                              const tokens = mode === 'custom' ? currentTokens : modeTokens[mode]
                              updateField('context_window_mode', mode, true)
                              updateField('context_window_tokens', tokens, true)
                            }}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              selected
                                ? 'bg-accent/10 border-accent/40'
                                : 'bg-white/[0.02] border-border/30 hover:bg-white/[0.04]'
                            }`}
                          >
                            <div className="text-xs font-semibold text-text">{opt.title}</div>
                            <div className="text-[10px] text-text-muted">{opt.subtitle}</div>
                          </button>
                        )
                      })}
                    </div>

                    <div className="pt-1 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-text">
                          Tokens da Janela
                        </span>
                        <input
                          type="number"
                          min={1024}
                          max={16384}
                          step={256}
                          value={currentTokens}
                          onChange={(e) => {
                            const next = clampTokens(Number(e.target.value || 0))
                            updateField('context_window_mode', 'custom', true)
                            updateField('context_window_tokens', next, true)
                          }}
                          className="w-28 bg-input border border-border/60 rounded-md px-2 py-1 text-xs text-text focus:border-accent/40 outline-none"
                        />
                      </div>
                      <input
                        type="range"
                        min={1024}
                        max={16384}
                        step={256}
                        value={currentTokens}
                        onChange={(e) => {
                          const next = clampTokens(Number(e.target.value || 0))
                          updateField('context_window_mode', 'custom', true)
                          updateField('context_window_tokens', next, true)
                        }}
                        className="w-full accent-[var(--color-accent,#8b5cf6)]"
                      />
                      <div className="text-[11px] text-text-muted">
                        Estimativa LLM + janela:{' '}
                        <span className="text-text font-semibold">
                          {estimatedTotalGb.toFixed(2)} GB
                        </span>
                        <span className="ml-1 opacity-80">
                          ({estimatedModelGb.toFixed(1)} GB modelo + {estimatedCtxGb.toFixed(2)} GB
                          contexto)
                        </span>
                      </div>
                    </div>
                  </div>

                  {backendOptions.map((opt) => {
                    const isSelected = settings.local_backend === opt.id
                    const isInstalled =
                      opt.id === 'auto' || localDetails.installed_backends?.includes(opt.id)

                    return (
                      <button
                        key={opt.id}
                        onClick={() =>
                          updateField('local_backend', opt.id, true).then(checkLocalStatus)
                        }
                        className={`group flex items-center justify-between gap-2 p-3 rounded-lg border transition-all duration-200 ${
                          isSelected
                            ? 'bg-accent/5 border-accent/30'
                            : 'bg-white/[0.02] border-border/30 hover:bg-white/[0.04] hover:border-border/50'
                        }`}
                      >
                        <div className="flex flex-col items-start gap-0.5 min-w-0">
                          <span
                            className={`text-xs font-bold ${isSelected ? 'text-accent' : 'text-text'}`}
                          >
                            {opt.label}
                            {opt.id === 'auto' && (
                              <span className="ml-2 text-[9px] text-green-500 font-semibold uppercase tracking-wide">
                                {t('settings.brain.recommended')}
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] text-text-muted font-medium">
                            {opt.desc}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {!isInstalled && (
                            <div className="flex items-center gap-1.5 bg-accent/10 px-2 py-1 rounded text-[10px] font-bold text-accent uppercase tracking-wide hover:bg-accent/20 transition-colors">
                              <span>{t('settings.brain.installNow')}</span>
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                className="animate-bounce"
                              >
                                <path d="M17.5 19a3.5 3.5 0 0 0 0-7h-.5a7 7 0 1 0-12 5" />
                                <path d="M12 11v6" />
                                <path d="M9 14l3 3 3-3" />
                              </svg>
                            </div>
                          )}

                          {isSelected ? (
                            <div className="flex items-center gap-2 text-accent">
                              <span className="text-xs font-bold uppercase tracking-wide opacity-80">
                                {t('settings.brain.configured')}
                              </span>
                              <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-white shadow-lg shadow-accent/20 scale-90">
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            </div>
                          ) : (
                            isInstalled && (
                              <div className="w-5 h-5 rounded-full border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                              </div>
                            )
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
)

BrainTab.displayName = 'BrainTab'
