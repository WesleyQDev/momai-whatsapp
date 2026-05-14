import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useI18n } from '../../i18n'

import iconGif from '../../assets/icon.gif'

interface OnboardingCardProps {
  onFinish: (savedSettings?: Record<string, any>) => void
}

type Theme = 'dark' | 'light'

interface Voice {
  id: string
  name: string
  trait: 'female' | 'male'
}

interface LanguageGroup {
  langName: string
  code: string
  voices: Voice[]
}

const VOICE_CATALOG: LanguageGroup[] = [
  {
    langName: 'Português (Brasil)',
    code: 'p',
    voices: [
      { id: 'pf_dora', name: 'Dora (Feminina)', trait: 'female' },
      { id: 'pm_alex', name: 'Alex (Masculina)', trait: 'male' },
      { id: 'pm_santa', name: 'Santa (Masculina)', trait: 'male' }
    ]
  },
  {
    langName: 'English (US)',
    code: 'a',
    voices: [
      { id: 'af_heart', name: 'Heart (Female)', trait: 'female' },
      { id: 'af_bella', name: 'Bella (Female)', trait: 'female' },
      { id: 'am_adam', name: 'Adam (Male)', trait: 'male' },
      { id: 'am_fenrir', name: 'Fenrir (Male)', trait: 'male' }
    ]
  }
]

const TTS_ENGINES = [
  {
    id: 'kokoro',
    labelKey: 'onboarding.ttsEngine.kokoro',
    descKey: 'onboarding.ttsEngine.kokoro.desc'
  },
  {
    id: 'edge-tts',
    labelKey: 'onboarding.ttsEngine.edge-tts',
    descKey: 'onboarding.ttsEngine.edge-tts.desc'
  }
]

const EDGE_VOICE_CATALOG: LanguageGroup[] = [
  {
    langName: 'Português (Brasil)',
    code: 'p',
    voices: [
      { id: 'pt-BR-FranciscaNeural', name: 'Francisca (Feminina)', trait: 'female' },
      { id: 'pt-BR-AntonioNeural', name: 'Antônio (Masculina)', trait: 'male' }
    ]
  },
  {
    langName: 'English (US)',
    code: 'a',
    voices: [
      { id: 'en-US-AvaMultilingualNeural', name: 'Ava (Female)', trait: 'female' },
      { id: 'en-US-AndrewMultilingualNeural', name: 'Andrew (Male)', trait: 'male' }
    ]
  }
]

interface TierCardProps {
  id: 'lite' | 'pro' | 'ultra'
  onSelect: (id: 'lite' | 'pro' | 'ultra') => void
  t: (key: string) => string
}

const TierCard = ({ id, onSelect, t }: TierCardProps) => {
  const styles = {
    lite: { text: 'text-emerald-500', iconBg: 'bg-emerald-500/10' },
    pro: { text: 'text-red-500', iconBg: 'bg-red-500/10' },
    ultra: { text: 'text-yellow-400', iconBg: 'bg-yellow-400/10' }
  }[id]

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className="no-drag group relative bg-white/[0.03] border border-white/5 rounded-2xl p-6 text-left flex flex-row items-center hover:bg-white/[0.08] transition-[transform,background-color] duration-150 hover:scale-[1.02] active:scale-[0.98] w-full gap-6 h-[140px] transform-gpu will-change-transform overflow-hidden"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="relative z-10 flex flex-row items-center gap-6 w-full pointer-events-none">
        <div
          className={`w-16 h-16 shrink-0 rounded-xl ${styles.iconBg} flex items-center justify-center ${styles.text} shadow-inner border border-white/5`}
        >
          {id === 'lite' && (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          )}
          {id === 'pro' && (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          )}
          {id === 'ultra' && (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          )}
        </div>

        <div className="flex flex-col items-start w-full">
          <h3 className={`text-2xl font-bold ${styles.text} uppercase tracking-tight mb-1`}>
            {t(`onboarding.tier.${id}.title`)}
          </h3>

          <div className="w-full">
            <p
              className={`text-[13px] ${styles.text} font-medium leading-relaxed text-left w-full opacity-80 max-w-[400px]`}
            >
              {t(`onboarding.tier.${id}.hover`)}
            </p>
          </div>
        </div>
      </div>
    </button>
  )
}

export default function OnboardingCard({ onFinish }: OnboardingCardProps) {
  const { t, setLocale } = useI18n()
  const [step, setStep] = useState(1)
  const [name, setName] = useState(localStorage.getItem('momai_user_name') || '')
  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem('momai_theme') as Theme) || 'dark'
  )
  const [selectedVoice, setSelectedVoice] = useState('pf_dora')
  const [selectedEngine, setSelectedEngine] = useState<string>('edge-tts')
  const [selectedLang, setSelectedLang] = useState('p')
  const [selectedTier, setSelectedTier] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [initMsg, setInitMsg] = useState<string | null>(null)

  function getAvailableEngines(tier: string | null): typeof TTS_ENGINES {
    if (tier === 'lite') return TTS_ENGINES.filter((e) => e.id === 'edge-tts')
    return TTS_ENGINES
  }

  function getVoiceCatalog(engine: string): LanguageGroup[] {
    return engine === 'edge-tts' ? EDGE_VOICE_CATALOG : VOICE_CATALOG
  }

  // 1. Initial Data Loading & App State
  useEffect(() => {
    const loadExistingSettings = async () => {
      try {
        const res = await api.get('/settings')
        const data = res.data
        if (data.user_name) setName(data.user_name)
        if (data.locale) {
          const langCode = data.locale === 'pt-BR' ? 'p' : 'a'
          setSelectedLang(langCode)
          setLocale(data.locale)
        }
        if (data.tts_voice) setSelectedVoice(data.tts_voice)
        if (data.tts_engine) setSelectedEngine(data.tts_engine)
        if (data.ai_tier) setSelectedTier(data.ai_tier)
      } catch (err) {
        console.debug('[Onboarding] Failed to load existing settings:', err)
      }
    }

    loadExistingSettings()

    // Prevent resizing during onboarding
    window.api?.setResizable?.(false)

    window.api
      .getAppVersion?.()
      .then(setAppVersion)
      .catch(() => {})

    return () => {
      // Re-enable resizing when leaving onboarding
      window.api?.setResizable?.(true)
    }
  }, [setLocale]) // setLocale is stable from useI18n

  // 2. Progress & System Event Listeners
  useEffect(() => {
    const handleProgress = (e: any) => {
      const msg = e.detail?.status || e.detail?.message
      if (msg) setInitMsg(msg)
    }

    window.addEventListener('ai_model_change_progress' as any, handleProgress)
    window.addEventListener('momai_setup_progress' as any, handleProgress)

    return () => {
      window.removeEventListener('ai_model_change_progress' as any, handleProgress)
      window.removeEventListener('momai_setup_progress' as any, handleProgress)
    }
  }, [])

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('momai_theme', newTheme)
  }

  const handleSelectTier = async (tier: string) => {
    setSelectedTier(tier)
    localStorage.setItem('momai_ai_tier', tier)
    if (tier === 'lite') {
      setSelectedEngine('edge-tts')
    }
    setStep(2)
    try {
      await api.post(`/setup/apply-tier?tier=${tier}`)
    } catch (err) {
      console.debug('[Onboarding] Failed to pre-apply tier:', err)
    }
  }

  const handleFinish = () => {
    if (!name.trim()) return
    setIsSaving(true)

    window.api?.setResizable?.(true)

    const ttsEnabled = selectedTier !== 'lite'

    const payload = {
      user_name: name,
      tts_voice: selectedVoice,
      tts_engine: selectedEngine,
      onboarding_completed: true,
      locale: selectedLang === 'p' ? 'pt-BR' : 'en-US',
      ai_tier: selectedTier,
      tts_enabled: ttsEnabled,
      wake_word_enabled: selectedTier === 'ultra'
    }

    window.api?.markFirstLaunchFinished?.(payload)

    onFinish(payload)

    api
      .patch('/settings', payload)
      .then(() => {
        window.dispatchEvent(new CustomEvent('momai_settings_sync', { detail: payload }))
      })
      .catch(() => {
        console.debug('[Onboarding] Backend not ready, settings will be queued by App.tsx')
      })
      .finally(() => {
        setIsSaving(false)
      })
  }

  // Reset voice when engine changes if current voice doesn't exist in new catalog
  useEffect(() => {
    const catalog = getVoiceCatalog(selectedEngine)
    const exists = catalog.some((g) => g.voices.some((v) => v.id === selectedVoice))
    if (!exists) {
      const firstVoice = catalog[0]?.voices[0]?.id
      if (firstVoice) setSelectedVoice(firstVoice)
    }
  }, [selectedEngine])

  // 3. Global Shortcuts / Enter to Finish
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && step === 2 && name.trim() && !isSaving) {
        handleFinish()
      }
    }

    if (step === 2) {
      window.addEventListener('keydown', handleGlobalKeyDown)
    }

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [step, name, isSaving])

  return (
    <div
      className="fixed inset-0 z-[301] bg-bg flex animate-fade-in overflow-hidden transition-colors duration-500"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <span className="text-[10px] font-black text-text-muted/70 uppercase tracking-[0.18em]">
          Version {appVersion}
        </span>
      </div>

      {/* Language Selector Top Right */}
      <div className="absolute top-4 right-6 z-[305] flex items-center gap-3">
        <button
          onClick={() => {
            const nextLang = selectedLang === 'p' ? 'a' : 'p'
            setSelectedLang(nextLang)
            const group = getVoiceCatalog(selectedEngine).find((g) => g.code === nextLang)
            if (group) {
              setSelectedVoice(group.voices[0].id)
              setLocale(nextLang === 'p' ? 'pt-BR' : ('en-US' as any))
            }
          }}
          className="no-drag flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/5 hover:border-accent/40 hover:bg-white/[0.08] transition-all duration-300 group shadow-sm active:scale-95"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5">
            {/* Brazil Flag */}
            <div
              className={`transition-all duration-500 flex items-center ${
                selectedLang === 'p'
                  ? 'opacity-100 scale-110 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]'
                  : 'opacity-20 grayscale scale-90 blur-[0.5px]'
              }`}
            >
              <svg width="20" height="14" viewBox="0 0 720 504" className="rounded-[2px]">
                <rect width="720" height="504" fill="#009c3b" />
                <path d="M360 432L648 252 360 72 72 252z" fill="#ffdf00" />
                <circle cx="360" cy="252" r="126" fill="#002776" />
                <path d="M245 285a126 126 0 0 1 230-66 126 126 0 0 0-230 66z" fill="#fff" />
              </svg>
            </div>

            <div className="w-[1px] h-3 bg-white/10" />

            {/* USA Flag */}
            <div
              className={`transition-all duration-500 flex items-center ${
                selectedLang === 'a'
                  ? 'opacity-100 scale-110 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                  : 'opacity-20 grayscale scale-90 blur-[0.5px]'
              }`}
            >
              <svg width="20" height="14" viewBox="0 0 741 390" className="rounded-[2px]">
                <rect width="741" height="390" fill="#bf0a30" />
                <path
                  d="M0 30h741M0 90h741M0 150h741M0 210h741M0 270h741M0 330h741"
                  stroke="#fff"
                  strokeWidth="30"
                />
                <rect width="296.4" height="210" fill="#002868" />
                <g fill="#fff">
                  <circle cx="25" cy="25" r="6" />
                  <circle cx="75" cy="25" r="6" />
                  <circle cx="125" cy="25" r="6" />
                  <circle cx="175" cy="25" r="6" />
                  <circle cx="225" cy="25" r="6" />
                  <circle cx="50" cy="65" r="6" />
                  <circle cx="100" cy="65" r="6" />
                  <circle cx="150" cy="65" r="6" />
                  <circle cx="200" cy="65" r="6" />
                  <circle cx="25" cy="105" r="6" />
                  <circle cx="75" cy="105" r="6" />
                  <circle cx="125" cy="105" r="6" />
                  <circle cx="175" cy="105" r="6" />
                  <circle cx="225" cy="105" r="6" />
                </g>
              </svg>
            </div>
          </div>
        </button>
      </div>

      {/* Left Pane - Branding & Status */}
      <div className="w-[350px] bg-sidebar pt-2 pb-12 px-10 flex flex-col justify-between items-center border-r border-border/10 relative overflow-hidden transition-colors duration-500 shrink-0">
        <div className="relative z-10 flex flex-col items-center text-center w-full">
          {/* Logo Icon */}
          <div className="w-16 h-16 flex items-center justify-center -mb-1">
            <img src={iconGif} alt="MomAI" className="w-full h-full object-contain" />
          </div>

          <div className="space-y-4 w-full">
            <h1 className="text-3xl font-black text-text tracking-tighter uppercase leading-[0.9]">
              MomAI
              <br />
              <span className="text-accent underline decoration-accent/10 text-[16px] tracking-normal lowercase">
                100% local e gratuita
              </span>
            </h1>

            {/* Requirements Section */}
            <div className="w-full pt-12 space-y-6">
              <div className="flex items-center gap-2.5 border-b border-white/5 pb-3 mb-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-accent/80"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span className="text-[10px] font-black text-text/60 uppercase tracking-[0.2em]">
                  Requisitos
                </span>
              </div>

              <div className="space-y-6">
                {/* Lite */}
                <div className="flex gap-4 items-center group/req">
                  <div className="text-emerald-500 shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <p className="text-[13px] text-text font-bold leading-snug text-left">
                    {t('onboarding.tier.lite.requirements')}
                  </p>
                </div>

                {/* Pro */}
                <div className="flex gap-4 items-center group/req">
                  <div className="text-red-500 shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                  <p className="text-[13px] text-text font-bold leading-snug text-left">
                    {t('onboarding.tier.pro.requirements')}
                  </p>
                </div>

                {/* Ultra */}
                <div className="flex gap-4 items-center group/req">
                  <div className="text-yellow-400 shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <p className="text-[13px] text-text font-bold leading-snug text-left">
                    {t('onboarding.tier.ultra.requirements')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 relative z-10 w-full max-w-[200px] flex flex-col items-center">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full bg-accent ${step === 1 ? 'animate-pulse' : ''}`}
            />
            <span className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">
              {step === 1 ? 'Intelligence Selection' : 'Personality Setup'}
            </span>
          </div>
          <div className="h-1 w-full bg-text/5 rounded-full overflow-hidden">
            <div
              className={`h-full bg-accent rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]`}
              style={{ width: step === 1 ? '33%' : '66%' }}
            />
          </div>
        </div>

        {/* Abstract decor */}
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-accent/5 rounded-full blur-[100px]" />
      </div>

      {/* Right Pane - Configuration Form */}
      <div
        className="no-drag flex-1 bg-card p-8 flex flex-col justify-center overflow-y-auto transition-colors duration-500"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="w-full max-w-none mx-auto px-6">
          {step === 1 ? (
            <div className="space-y-10 animate-fade-in flex flex-col items-center text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-text tracking-tight">
                  {t('onboarding.tier.title')}
                </h2>
                <p className="text-sm text-text-muted font-normal opacity-50">
                  {t('onboarding.tier.subtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 w-full max-w-[700px] px-4 py-4">
                <TierCard id="lite" onSelect={handleSelectTier} t={t} />
                <TierCard id="pro" onSelect={handleSelectTier} t={t} />
                <TierCard id="ultra" onSelect={handleSelectTier} t={t} />
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm mx-auto space-y-8 animate-fade-in">
              <div className="space-y-1">
                <button
                  onClick={() => setStep(1)}
                  className="no-drag group inline-flex items-center gap-2.5 text-[10px] font-bold text-accent uppercase tracking-wider mb-6 transition-all opacity-80 hover:opacity-100"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-all shadow-sm">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </div>
                  Voltar
                </button>
                <h2 className="text-xl font-black text-text uppercase tracking-tight">
                  {t('onboarding.title')}
                </h2>
                <p className="text-[10px] text-text-muted font-medium opacity-50">
                  {t('onboarding.subtitle')}
                </p>
              </div>

              <div className="space-y-6">
                {/* ─── Voice Settings Section ─── */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
                      {t('onboarding.voiceSection')}
                    </span>
                  </div>

                  {/* TTS Engine Selector */}
                  <div className="space-y-2 mb-3">
                    <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                      {t('onboarding.ttsEngineLabel')}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {getAvailableEngines(selectedTier).map((engine) => (
                        <button
                          key={engine.id}
                          onClick={() => setSelectedEngine(engine.id)}
                          className={`no-drag py-2 px-3 rounded-lg border text-left transition-all ${
                            selectedEngine === engine.id
                              ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20'
                              : 'bg-input border-border/20 text-text-muted hover:bg-white/[0.05]'
                          }`}
                          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        >
                          <div className="flex items-center gap-1.5">
                            {engine.id === 'edge-tts' && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                              </svg>
                            )}
                            <span className="text-[10px] font-bold">{t(engine.labelKey)}</span>
                          </div>
                          <div className={`text-[8px] mt-0 ${selectedEngine === engine.id ? 'text-white/70' : 'opacity-50'}`}>
                            {t(engine.descKey)}
                          </div>
                          {engine.id === 'edge-tts' && selectedEngine === 'edge-tts' && (
                            <div className="flex items-center gap-1 mt-0.5 text-[7px] font-semibold text-yellow-300">
                              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              {t('onboarding.ttsEngine.internetHint')}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Voice Selector */}
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                      {t('onboarding.voiceLabel')}
                    </label>
                    <div className="relative group">
                      <select
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="no-drag w-full bg-input border border-border/20 rounded-lg px-4 py-3 text-xs font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                      >
                        {getVoiceCatalog(selectedEngine)
                          .find((g) => g.code === selectedLang)
                          ?.voices.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── Divider ─── */}
                <div className="border-t border-white/5" />

                {/* ─── Personality Section ─── */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
                      {t('onboarding.personalitySection')}
                    </span>
                  </div>

                  {/* Name Input */}
                  <div className="space-y-2 mb-4">
                    <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                      {t('onboarding.nameLabel')}
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="no-drag w-full bg-input border border-border/20 rounded-lg px-3.5 py-3 text-sm font-bold text-text focus:border-accent/40 outline-none transition-all placeholder:opacity-10 shadow-inner select-text"
                      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                      placeholder={t('onboarding.namePlaceholder')}
                    />
                  </div>

                  {/* Theme + Language Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                        {t('onboarding.themeLabel')}
                      </label>
                      <div className="relative group">
                        <select
                          value={theme}
                          onChange={(e) => changeTheme(e.target.value as Theme)}
                          className="no-drag w-full bg-input border border-border/20 rounded-lg px-3 py-2 text-[10px] font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
                        >
                          <option value="dark">{t('onboarding.theme.dark')}</option>
                          <option value="light">{t('onboarding.theme.light')}</option>
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                        Language
                      </label>
                      <div className="relative group">
                        <select
                          value={selectedLang}
                          onChange={(e) => {
                            const newLang = e.target.value
                            setSelectedLang(newLang)
                            const group = getVoiceCatalog(selectedEngine).find((g) => g.code === newLang)
                            if (group) {
                              setSelectedVoice(group.voices[0].id)
                              setLocale(newLang === 'p' ? 'pt-BR' : ('en-US' as any))
                            }
                          }}
                          className="no-drag w-full bg-input border border-border/20 rounded-lg px-3 py-2 text-[10px] font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
                        >
                          {getVoiceCatalog(selectedEngine).map((g) => (
                            <option key={g.code} value={g.code}>
                              {g.langName}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 space-y-6">
                <button
                  onClick={handleFinish}
                  disabled={!name.trim() || isSaving}
                  className={`no-drag group relative w-full py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center overflow-hidden ${
                    !name.trim() || isSaving
                      ? 'bg-white/[0.02] text-text/20 cursor-not-allowed border border-white/5'
                      : 'bg-accent text-white shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)] hover:shadow-[0_0_25px_rgba(var(--accent-rgb),0.4)] hover:-translate-y-0.5 active:scale-[0.98]'
                  }`}
                >
                  {/* Glossy overlay effect */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <span className="relative z-10 transition-transform duration-500">
                    {isSaving ? 'Configuring System...' : t('onboarding.finish')}
                  </span>
                </button>

                <div className="flex items-center justify-between px-1 pt-2 opacity-30">
                  <span className="text-[9px] font-medium uppercase tracking-widest">
                    Wesley Developer Studios
                  </span>
                  <span className="text-[9px] font-medium uppercase tracking-widest">
                    V{appVersion}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
