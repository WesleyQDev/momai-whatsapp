import { Settings, Tab } from '../../../../hooks/useSettingsCard'

interface VoiceTabProps {
  t: any
  settings: Settings
  setActiveTab: (tab: Tab) => void
  expandedLang: string | null
  setExpandedLang: (lang: string | null) => void
  updateField: (field: string, value: any, saveNow?: boolean) => Promise<void>
}

export const VoiceTab = ({
  t,
  settings,
  setActiveTab,
  expandedLang,
  setExpandedLang,
  updateField,
}: VoiceTabProps) => {
  const voiceCatalog = [
    {
      langKey: 'settings.voice.lang.ptBR',
      code: 'p',
      voices: [
        { id: 'pf_dora', name: 'Dora', trait: 'female', suggested: true },
        { id: 'pm_alex', name: 'Alex', trait: 'male' },
        { id: 'pm_santa', name: 'Santa', trait: 'male' }
      ]
    },
    {
      langKey: 'settings.voice.lang.enUS',
      code: 'a',
      voices: [
        { id: 'af_heart', name: 'Heart', trait: 'female' },
        { id: 'af_bella', name: 'Bella', trait: 'female' },
        { id: 'am_adam', name: 'Adam', trait: 'male' },
        { id: 'am_fenrir', name: 'Fenrir', trait: 'male' }
      ]
    },
    {
      langKey: 'settings.voice.lang.enUK',
      code: 'b',
      voices: [
        { id: 'bf_alice', name: 'Alice', trait: 'female' },
        { id: 'bm_george', name: 'George', trait: 'male' }
      ]
    },
    {
      langKey: 'settings.voice.lang.es',
      code: 'e',
      voices: [
        { id: 'ef_dora', name: 'Dora', trait: 'female' },
        { id: 'em_alex', name: 'Alex', trait: 'male' }
      ]
    },
    {
      langKey: 'settings.voice.lang.it',
      code: 'i',
      voices: [
        { id: 'if_sara', name: 'Sara', trait: 'female' },
        { id: 'im_nicola', name: 'Nicola', trait: 'male' }
      ]
    }
  ]

  return (
    <div className="relative min-h-full flex flex-col gap-6 animate-in fade-in slide-in-from-right-2 duration-300">
      {settings.ai_tier === 'lite' && (
        <div className="absolute inset-x-[-2rem] inset-y-[-2rem] z-20 flex items-center justify-center backdrop-blur-[3px] bg-black/40 rounded-3xl animate-in fade-in duration-500">
          <div className="max-w-[340px] flex flex-col items-center text-center gap-4">
            <div className="p-4 rounded-full bg-white/5 text-text-muted mb-2 border border-white/5 shadow-2xl shadow-black">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                <line x1="16" y1="8" x2="2" y2="22" />
                <line x1="17.5" y1="15" x2="9" y2="15" />
              </svg>
            </div>
            <div className="space-y-3 px-4">
              <h3 className="text-[13px] font-black uppercase tracking-widest text-text">
                Foco em Desempenho
              </h3>
              <p className="text-[12px] text-text-muted font-medium leading-relaxed">
                A modalidade <strong className="text-text">Lite</strong> foca em agilidade e baixo consumo, por isso os recursos de voz ficam em repouso.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('general')}
              className="mt-3 px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-text-muted hover:text-text rounded-xl text-[10px] font-black transition-all uppercase tracking-widest shadow-xl shadow-black/20"
            >
              Alterar para Pro ou Ultra
            </button>
          </div>
        </div>
      )}

      <div className={`space-y-6 ${settings.ai_tier === 'lite' ? 'opacity-20 pointer-events-none grayscale' : ''}`}>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-text tracking-tight uppercase">
            {t('settings.tabs.voice')}
          </h2>
          <p className="text-[11px] text-text-muted font-medium">
            Gerencie as capacidades de fala e escuta.
          </p>
        </div>

      {/* Recursos de Voz */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-text uppercase tracking-wider">
                {t('settings.general.dailyBriefingLabel')}
              </span>
              <span className="text-[10px] text-text-muted font-medium">
                {t('settings.general.dailyBriefingSubtitle')}
              </span>
            </div>
          </div>
          <button
            onClick={() =>
              updateField('daily_briefing_enabled', !settings.daily_briefing_enabled, true)
            }
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${settings.daily_briefing_enabled ? 'bg-accent' : 'bg-text-muted/20'}`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.daily_briefing_enabled ? 'translate-x-4.5' : 'translate-x-1'}`}
            />
          </button>
        </div>

        <div className="space-y-3">
          <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
            {t('settings.voice.catalogLabel')}
          </label>
          <div className="flex gap-4 h-[220px]">
            <div className="w-[160px] space-y-1.5 overflow-y-auto custom-scrollbar pr-2">
              {voiceCatalog.map((catalog) => (
                <button
                  key={catalog.code}
                  onClick={() => setExpandedLang(catalog.code)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-[9px] font-black uppercase tracking-tight transition-all ${expandedLang === catalog.code ? 'bg-accent/10 border-accent/40 text-accent shadow-sm' : 'bg-black/10 border-transparent text-text-muted hover:bg-black/20'}`}
                >
                  {t(catalog.langKey)}
                </button>
              ))}
            </div>

            <div className="flex-1 p-2.5 rounded-xl bg-black/10 border border-border/40 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 gap-1">
                {voiceCatalog
                  .find((c) => c.code === expandedLang)
                  ?.voices.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => updateField('tts_voice', v.id, true)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-[10px] font-bold transition-all ${settings.tts_voice === v.id ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20' : 'bg-input border-border/40 text-text-muted hover:bg-black/20'}`}
                    >
                      <div className="flex flex-col items-start gap-0.5">
                        <span>
                          {v.suggested
                            ? t('settings.voice.nameSuggested', { name: v.name })
                            : v.name}
                        </span>
                        <span className="text-[7px] uppercase font-black tracking-tighter opacity-60">
                          {t(`settings.voice.trait.${v.trait}`)}
                        </span>
                      </div>
                      {settings.tts_voice === v.id && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}
