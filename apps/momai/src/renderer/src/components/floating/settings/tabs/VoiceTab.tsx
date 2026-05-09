import { Settings, Tab } from '../../../../hooks/useSettingsCard'
import React, { useState, useEffect } from 'react'
import { useTTS } from '../../../../hooks/useTTS'

interface VoiceTabProps {
  t: any
  settings: Settings
  setActiveTab: (tab: Tab) => void
  expandedLang: string | null
  setExpandedLang: (lang: string | null) => void
  updateField: (field: string, value: any, saveNow?: boolean) => Promise<void>
}

export const VoiceTab = React.memo(
  ({ t, settings, setActiveTab, expandedLang, setExpandedLang, updateField }: VoiceTabProps) => {
    const {
      isReady,
      isSpeaking,
      currentEngine,
      availableVoices,
      setEngine,
      setVoice,
      refreshVoices
    } = useTTS()

    const [localEngine, setLocalEngine] = useState(currentEngine)
    const [isLoadingVoices, setIsLoadingVoices] = useState(false)

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

    const engines = [
      {
        id: 'kokoro' as const,
        name: 'Kokoro (Local)',
        description: 'Alta qualidade, requer Python'
      },
      {
        id: 'edge-tts' as const,
        name: 'Edge TTS (Online)',
        description: 'Alta qualidade, requer internet'
      },
      {
        id: 'say' as const,
        name: 'Say.js (Local)',
        description: 'Voz do sistema, sem dependências'
      }
    ]

    // Carregar vozes quando a engine muda
    useEffect(() => {
      const loadVoices = async () => {
        setIsLoadingVoices(true)
        try {
          await refreshVoices(localEngine)
        } catch (error) {
          console.error('Erro ao carregar vozes:', error)
        } finally {
          setIsLoadingVoices(false)
        }
      }

      if (isReady) {
        loadVoices()
      }
    }, [localEngine, isReady, refreshVoices])

    // Atualizar engine local quando a engine do hook mudar
    useEffect(() => {
      setLocalEngine(currentEngine)
    }, [currentEngine])

    const handleEngineChange = async (engine: typeof localEngine) => {
      try {
        const { stopVoice } = await import('../../../../services/api')
        stopVoice().catch(() => {})
      } catch {}
      setLocalEngine(engine)
      await updateField('tts_engine', engine, true)
      await setEngine(engine)
      setExpandedLang(null)
    }

    const handleVoiceSelect = async (voiceId: string) => {
      try {
        const { stopVoice } = await import('../../../../services/api')
        stopVoice().catch(() => {})
      } catch {}
      await updateField('tts_voice', voiceId, true)
      await setVoice(voiceId)
    }

    return (
      <div className="relative min-h-full flex flex-col gap-6">
        {settings.ai_tier === 'lite' && (
          <div className="absolute inset-x-[-2rem] inset-y-[-2rem] z-20 flex items-center justify-center backdrop-blur-sm bg-black/30 rounded-3xl">
            <div className="max-w-[340px] flex flex-col items-center text-center gap-4">
              <div className="p-4 rounded-full bg-white/[0.05] text-text-muted mb-2 border border-white/10 shadow-2xl">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                  <line x1="16" y1="8" x2="2" y2="22" />
                  <line x1="17.5" y1="15" x2="9" y2="15" />
                </svg>
              </div>
              <div className="space-y-3 px-4">
                <h3 className="text-sm font-bold text-text">Foco em Desempenho</h3>
                <p className="text-xs text-text-muted font-medium leading-relaxed">
                  A modalidade <strong className="text-text">Lite</strong> foca em agilidade e baixo
                  consumo, por isso os recursos de voz ficam em repouso.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('general')}
                className="mt-3 px-6 py-2.5 bg-white/[0.05] hover:bg-white/10 border border-white/10 text-text-muted hover:text-text rounded-xl text-xs font-semibold transition-all shadow-xl"
              >
                Alterar para Pro ou Ultra
              </button>
            </div>
          </div>
        )}

        <div
          className={`space-y-5 ${settings.ai_tier === 'lite' ? 'opacity-20 pointer-events-none grayscale' : ''}`}
        >
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-text tracking-tight">
              {t('settings.tabs.voice')}
            </h2>
            <p className="text-xs text-text-muted font-medium">
              Gerencie as capacidades de fala e escuta.
            </p>
          </div>

          {/* Recursos de Voz */}
          <div className="space-y-3">
            <div className="rounded-xl border border-border/40 bg-white/[0.03] group transition-all duration-300 hover:border-border/60">
              <div className="flex items-center justify-between gap-2 p-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                      settings.daily_briefing_enabled
                        ? 'bg-accent/15 text-accent'
                        : 'bg-white/[0.05] text-text-muted/50'
                    }`}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      <path d="M12 7v6" />
                      <path d="M9 10h6" />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-0">
                    <span
                      className={`text-xs font-semibold transition-colors duration-300 ${
                        settings.daily_briefing_enabled ? 'text-text' : 'text-text-muted'
                      }`}
                    >
                      {t('settings.general.dailyBriefingLabel')}
                    </span>
                    <span className="text-[11px] text-text-muted font-medium">
                      {t('settings.general.dailyBriefingSubtitle')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() =>
                    updateField('daily_briefing_enabled', !settings.daily_briefing_enabled, true)
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.daily_briefing_enabled ? 'bg-accent/80' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.daily_briefing_enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.daily_briefing_enabled && (
                <div className="border-t border-border/40">
                  <div className="px-4 py-2.5 border-b border-border/20 bg-white/[0.02]">
                    <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                      Componentes
                    </span>
                  </div>
                  <div className="px-4 pb-3 pt-1 space-y-0 divide-y divide-border/10">
                    <div className="flex items-center justify-between py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-text">Saudação automática</span>
                        <span className="text-[10px] text-text-muted/70">
                          &quot;Bom dia!&quot; conforme o horário
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          updateField(
                            'greeting_auto_saudacao',
                            !settings.greeting_auto_saudacao,
                            true
                          )
                        }
                        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors ${settings.greeting_auto_saudacao ? 'bg-accent border-accent' : 'bg-white/10 border-transparent'}`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${settings.greeting_auto_saudacao ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                        />
                      </button>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-text">Resumo do dia</span>
                        <span className="text-[10px] text-text-muted/70">
                          Data, dia da semana e lembretes
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          updateField('greeting_resumo', !settings.greeting_resumo, true)
                        }
                        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors ${settings.greeting_resumo ? 'bg-accent border-accent' : 'bg-white/10 border-transparent'}`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${settings.greeting_resumo ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                        />
                      </button>
                    </div>
                    <div className="py-2.5 space-y-1.5">
                      <span className="text-xs font-semibold text-text">Ação personalizada</span>
                      <span className="text-[10px] text-text-muted/70">
                        Instrução extra para a IA
                      </span>
                      <input
                        value={settings.greeting_acao}
                        onChange={(e) => updateField('greeting_acao', e.target.value, true)}
                        placeholder="Ex: Me conte uma curiosidade do dia"
                        className="w-full mt-1 p-2 rounded-lg border border-border/40 bg-input text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
                      />
                    </div>
                    <div className="py-2.5 space-y-1.5">
                      <span className="text-xs font-semibold text-text">Mensagem fixa</span>
                      <span className="text-[10px] text-text-muted/70">
                        Usa este texto exato em vez de IA
                      </span>
                      <input
                        value={settings.greeting_fixa}
                        onChange={(e) => updateField('greeting_fixa', e.target.value, true)}
                        placeholder="Ex: Bem-vindo de volta!"
                        className="w-full mt-1 p-2 rounded-lg border border-border/40 bg-input text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Seleção de Engine TTS */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                Engine de TTS
              </label>
              <div className="grid grid-cols-3 gap-2">
                {engines.map((engine) => (
                  <button
                    key={engine.id}
                    onClick={() => handleEngineChange(engine.id)}
                    className={`p-3 rounded-lg border text-xs font-medium transition-all ${
                      localEngine === engine.id
                        ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20'
                        : 'bg-input border-border/40 text-text-muted hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-semibold">{engine.name}</span>
                      <span className="text-[9px] opacity-70">{engine.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Catálogo de Vozes */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                {t('settings.voice.catalogLabel')}
              </label>

              {isLoadingVoices ? (
                <div className="flex items-center justify-center h-[200px] rounded-xl bg-white/[0.03] border border-border/40">
                  <div className="text-xs text-text-muted">Carregando vozes...</div>
                </div>
              ) : localEngine === 'kokoro' ? (
                <div className="flex gap-3 h-[200px]">
                  <div className="w-[160px] space-y-1 overflow-y-auto custom-scrollbar pr-2">
                    {voiceCatalog.map((catalog) => (
                      <button
                        key={catalog.code}
                        onClick={() => setExpandedLang(catalog.code)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg border text-[11px] font-semibold uppercase tracking-wide transition-all ${expandedLang === catalog.code ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-white/[0.03] border-transparent text-text-muted hover:bg-white/[0.05]'}`}
                      >
                        {t(catalog.langKey)}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 p-2 rounded-xl bg-white/[0.03] border border-border/40 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 gap-1.5">
                      {voiceCatalog
                        .find((c) => c.code === expandedLang)
                        ?.voices.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => handleVoiceSelect(v.id)}
                            className={`flex items-center justify-between p-2 rounded-lg border text-xs font-medium transition-all ${settings.tts_voice === v.id ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20' : 'bg-input border-border/40 text-text-muted hover:bg-white/[0.05]'}`}
                          >
                            <div className="flex flex-col items-start gap-0">
                              <span>
                                {v.suggested
                                  ? t('settings.voice.nameSuggested', { name: v.name })
                                  : v.name}
                              </span>
                              <span className="text-[9px] uppercase font-semibold tracking-wide opacity-60">
                                {t(`settings.voice.trait.${v.trait}`)}
                              </span>
                            </div>
                            {settings.tts_voice === v.id && (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                (() => {
                  const groups: Record<
                    string,
                    { code: string; langKey: string; voices: typeof availableVoices }
                  > = {}
                  for (const v of availableVoices) {
                    const lang = v.language.split('-')[0]
                    if (!groups[lang])
                      groups[lang] = { code: lang, langKey: lang.toUpperCase(), voices: [] }
                    groups[lang].voices.push(v)
                  }
                  const sorted = Object.values(groups).sort((a, b) =>
                    a.code === 'pt' ? -1 : b.code === 'pt' ? 1 : a.code.localeCompare(b.code)
                  )
                  const currentLang =
                    expandedLang && sorted.find((g) => g.code === expandedLang)
                      ? expandedLang
                      : sorted[0]?.code || null
                  return (
                    <div className="flex gap-3 h-[200px]">
                      <div className="w-[160px] space-y-1 overflow-y-auto custom-scrollbar pr-2">
                        {sorted.map((g) => (
                          <button
                            key={g.code}
                            onClick={() => setExpandedLang(g.code)}
                            className={`w-full flex items-center justify-between p-2 rounded-lg border text-[11px] font-semibold uppercase tracking-wide transition-all ${currentLang === g.code ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-white/[0.03] border-transparent text-text-muted hover:bg-white/[0.05]'}`}
                          >
                            {g.langKey}
                          </button>
                        ))}
                      </div>
                      <div className="flex-1 p-2 rounded-xl bg-white/[0.03] border border-border/40 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 gap-1.5">
                          {sorted
                            .find((g) => g.code === currentLang)
                            ?.voices.map((v) => (
                              <button
                                key={v.id}
                                onClick={() => handleVoiceSelect(v.id)}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs font-medium transition-all ${settings.tts_voice === v.id ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20' : 'bg-input border-border/40 text-text-muted hover:bg-white/[0.05]'}`}
                              >
                                <div className="flex flex-col items-start gap-0">
                                  <span>{v.name}</span>
                                  <span className="text-[9px] uppercase font-semibold tracking-wide opacity-60">
                                    {v.language} • {v.gender || 'voz'}
                                  </span>
                                </div>
                                {settings.tts_voice === v.id && (
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            ))}
                        </div>
                      </div>
                    </div>
                  )
                })()
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
)
