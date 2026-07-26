import { Settings, LocalDetails } from '../../../../hooks/useSettingsCard'
import React, { useMemo } from 'react'

interface ModelTabProps {
  t: any
  settings: Settings
  tiersConfig: any
  localDetails: LocalDetails
  updateField: (f: string, v: any, s?: boolean) => Promise<void>
  checkLocalStatus: () => Promise<void>
}

export const ModelTab = React.memo(
  ({ t, settings, tiersConfig, localDetails, updateField, checkLocalStatus }: ModelTabProps) => {
    const currentBackend = useMemo(
      () =>
        settings.local_backend === 'auto'
          ? localDetails.recommended_build || 'cpu'
          : settings.local_backend || 'cpu',
      [settings.local_backend, localDetails.recommended_build]
    )
    const isGpuActive = currentBackend !== 'cpu'

    const backendOptions = useMemo(
      () => [
        { id: 'auto', label: 'Automático', desc: 'Seleciona GPU quando disponível' },
        { id: 'vulkan', label: 'Vulkan (GPU)', desc: 'Aceleração por GPU via Vulkan' },
        { id: 'cuda', label: 'CUDA (GPU)', desc: 'Aceleração por GPU NVIDIA' },
        { id: 'cpu', label: 'CPU (Apenas)', desc: 'Forçar processamento apenas pela CPU' }
      ],
      []
    )

    return (
      <div className="space-y-5">
        {/* Hardware */}
        <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">
          Hardware
        </span>
        <div className="rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border/20">
            <div>
              <div className="text-xs font-semibold text-text">GPU</div>
              <div className="text-[11px] text-text-muted font-medium mt-0.5">
                {localDetails.detected_hardware || 'Buscando...'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-text">CPU</div>
              <div className="text-[11px] text-text-muted font-medium mt-0.5">
                {localDetails.cpu_name || '...'}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-xs font-semibold text-text">Aceleração GPU</div>
              <div className="text-[11px] text-text-muted font-medium mt-0.5">
                {isGpuActive ? 'Ativado' : 'Desativado'}
              </div>
            </div>
            <button
              onClick={() => {
                const t = isGpuActive
                  ? 'cpu'
                  : ['cuda', 'vulkan'].includes(localDetails.recommended_build || '')
                    ? localDetails.recommended_build
                    : 'auto'
                updateField('local_backend', t, true).then(checkLocalStatus)
              }}
              className={`relative w-11 h-5 rounded-full transition-all shrink-0 ${isGpuActive ? 'bg-accent' : 'bg-white/10'}`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-lg transition-all ${isGpuActive ? 'left-6' : 'left-0.5'}`}
              />
            </button>
          </div>
        </div>

        {/* Backends */}
        <span className="text-xs font-bold text-text-muted uppercase tracking-wide block">
          Backends
        </span>
        <div className="rounded-xl bg-white/[0.03] border border-border/40 overflow-hidden">
          {backendOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => updateField('local_backend', opt.id, true).then(checkLocalStatus)}
              className={`flex items-center justify-between w-full p-4 border-b border-border/20 last:border-none text-left transition-colors ${settings.local_backend === opt.id ? 'bg-accent/5' : 'hover:bg-white/[0.02]'}`}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`text-xs font-semibold ${settings.local_backend === opt.id ? 'text-accent' : 'text-text'}`}
                >
                  {opt.label}
                </div>
                <div className="text-[11px] text-text-muted font-medium mt-0.5">{opt.desc}</div>
              </div>
              {opt.id !== 'auto' && !localDetails.installed_backends?.includes(opt.id) && (
                <span className="text-[10px] font-semibold text-accent uppercase ml-3 shrink-0">
                  Instalar
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }
)
ModelTab.displayName = 'ModelTab'
