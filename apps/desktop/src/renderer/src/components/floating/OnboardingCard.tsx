import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useI18n } from '../../i18n'

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

export default function OnboardingCard({ onFinish }: OnboardingCardProps) {
  const { t, setLocale } = useI18n()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem('momai_theme') as Theme) || 'dark'
  )
  const [selectedVoice, setSelectedVoice] = useState('pf_dora')
  const [selectedLang, setSelectedLang] = useState('p')
  const [selectedTier, setSelectedTier] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [initMsg, setInitMsg] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getAppVersion?.()
      .then(setAppVersion)
      .catch(() => {})

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
    setStep(2)
    // Silently trigger tier application
    try {
      await api.post(`/setup/apply-tier?tier=${tier}`)
    } catch (err) {
      console.warn('[Onboarding] Failed to pre-apply tier:', err)
    }
  }

  const handleFinish = async () => {
    if (!name.trim()) return
    setIsSaving(true)
    try {
      const payload = {
        user_name: name,
        tts_voice: selectedVoice,
        onboarding_completed: true,
        locale: selectedLang === 'p' ? 'pt-BR' : 'en-US',
        ai_tier: selectedTier
      }
      // Signal main process first (works offline - saves to local file)
      window.api?.markFirstLaunchFinished?.(payload)
      // Call onFinish to allow App.tsx to queue if backend is not ready
      onFinish(payload)
      // Try to sync with backend (non-blocking)
      try {
        await api.patch('/settings', payload)
        window.dispatchEvent(new CustomEvent('momai_settings_sync', { detail: payload }))
      } catch (apiError) {
        console.warn('[Onboarding] Backend not ready, settings will be queued by App.tsx')
      }
    } catch (error) {
      console.error('Erro ao salvar onboarding:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const TierCard = ({ id }: { id: 'lite' | 'pro' | 'ultra' }) => {
    const styles = {
      lite: { text: 'text-emerald-500', iconBg: 'bg-emerald-500/10' },
      pro: { text: 'text-red-500', iconBg: 'bg-red-500/10' },
      ultra: { text: 'text-yellow-400', iconBg: 'bg-yellow-400/10' }
    }[id]

    return (
      <button
        onClick={() => handleSelectTier(id)}
        className="group relative bg-white/[0.03] border border-white/5 rounded-3xl p-6 text-center flex flex-col items-center hover:border-accent/40 hover:bg-white/[0.05] transition-all duration-500 overflow-hidden active:scale-[0.97] min-h-[300px] justify-between w-full"
      >
        {/* Subtle background pattern/glow */}
        <div className={`absolute -top-24 -right-24 w-48 h-48 ${styles.iconBg} blur-[80px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />

        <div className="relative z-10 flex flex-col items-center space-y-6 w-full">
          <div
            className={`w-16 h-16 rounded-2xl ${styles.iconBg} flex items-center justify-center ${styles.text} shadow-inner border border-white/5 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3`}
          >
            {id === 'lite' && (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            )}
            {id === 'pro' && (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            )}
            {id === 'ultra' && (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            )}
          </div>
          
          <div className="flex flex-col items-center w-full">
            <h3 className={`text-2xl font-black ${styles.text} uppercase tracking-tight mb-3`}>
              {t(`onboarding.tier.${id}.title`)}
            </h3>
            
            <div className="relative w-full">
              {/* Default Description - Defines the height of the container */}
              <p className="text-xs text-text-muted leading-relaxed font-medium opacity-60 group-hover:opacity-0 transition-all duration-300 text-center px-2">
                {t(`onboarding.tier.${id}.desc`)}
              </p>
              
              {/* Hover Detailed Info - Overlayed precisely */}
              <p className={`text-[13px] ${styles.text} font-bold leading-tight opacity-0 group-hover:opacity-100 transition-all duration-300 absolute inset-0 flex items-center justify-center text-center px-2 pointer-events-none`}>
                {t(`onboarding.tier.${id}.hover`)}
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 w-full pt-4">
          <div className="h-[2px] w-0 bg-gradient-to-r from-transparent via-accent to-transparent group-hover:w-full transition-all duration-700 mx-auto" />
        </div>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[301] bg-bg flex animate-fade-in overflow-hidden select-none transition-colors duration-500">
      {/* Left Pane - Branding & Status */}
      <div className="w-[40%] bg-sidebar p-12 flex flex-col justify-between border-r border-border/10 relative overflow-hidden transition-colors duration-500">
        <div className="space-y-6 relative z-10">
          {/* Logo Icon */}
          <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-white shadow-2xl shadow-accent/20">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-black text-text tracking-tighter uppercase leading-[0.9]">
              MomAI
              <br />
              <span className="text-accent underline decoration-accent/10">Assistant</span>
            </h1>
            <p className="text-[12px] text-text-muted font-medium max-w-[180px] leading-relaxed opacity-60">
              Professional intelligence for your desktop workflow.
            </p>
          </div>
        </div>

        <div className="space-y-4 relative z-10 w-full max-w-[200px]">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full bg-accent ${step === 1 ? 'animate-pulse' : ''}`} />
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
      <div className="flex-1 bg-card p-8 flex flex-col justify-center overflow-y-auto transition-colors duration-500">
        <div className="w-full max-w-5xl mx-auto">
          {step === 1 ? (
            <div className="space-y-12 animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col items-center text-center">
              <div className="space-y-3">
                <h2 className="text-4xl font-black text-text tracking-tighter uppercase">
                  {t('onboarding.tier.title')}
                </h2>
                <p className="text-base text-text-muted font-medium opacity-60">
                  {t('onboarding.tier.subtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full px-2">
                <TierCard id="lite" />
                <TierCard id="pro" />
                <TierCard id="ultra" />
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm mx-auto space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="space-y-1">
                <button
                  onClick={() => setStep(1)}
                  className="text-[10px] font-bold text-accent uppercase tracking-tighter flex items-center gap-2 mb-4 hover:opacity-70 transition-opacity"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Voltar para seleção
                </button>
                <h2 className="text-xl font-black text-text uppercase tracking-tight">
                  {t('onboarding.title')}
                </h2>
                <p className="text-[10px] text-text-muted font-medium opacity-50">
                  {t('onboarding.subtitle')}
                </p>
              </div>

              <div className="space-y-6">
                {/* Name Input */}
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                    {t('onboarding.nameLabel')}
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-input border border-border/20 rounded-lg px-3.5 py-3 text-sm font-bold text-text focus:border-accent/40 outline-none transition-all placeholder:opacity-10 shadow-inner"
                    placeholder={t('onboarding.namePlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Theme Selector */}
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                      {t('onboarding.themeLabel')}
                    </label>
                    <div className="relative group">
                      <select
                        value={theme}
                        onChange={(e) => changeTheme(e.target.value as Theme)}
                        className="w-full bg-input border border-border/20 rounded-lg px-3 py-2 text-[10px] font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
                      >
                        <option value="dark">{t('onboarding.theme.dark')}</option>
                        <option value="light">{t('onboarding.theme.light')}</option>
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Language Selector */}
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
                          const group = VOICE_CATALOG.find((g) => g.code === newLang)
                          if (group) {
                            setSelectedVoice(group.voices[0].id)
                            setLocale(newLang === 'p' ? 'pt-BR' : ('en-US' as any))
                          }
                        }}
                        className="w-full bg-input border border-border/20 rounded-lg px-3 py-2 text-[10px] font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
                      >
                        {VOICE_CATALOG.map((g) => (
                          <option key={g.code} value={g.code}>
                            {g.langName}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {(selectedTier === 'pro' || selectedTier === 'ultra') && (
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                      {t('onboarding.voiceLabel')}
                    </label>
                    <div className="relative group">
                      <select
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="w-full bg-input border border-border/20 rounded-lg px-4 py-3 text-xs font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
                      >
                        {VOICE_CATALOG.find((g) => g.code === selectedLang)?.voices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}
              </div>


              <div className="pt-6 space-y-6">
                <button
                  onClick={handleFinish}
                  disabled={!name.trim() || isSaving}
                  className={`w-full py-3.5 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-3 ${
                    !name.trim() || isSaving
                      ? 'bg-text/5 text-text/20 cursor-not-allowed'
                      : 'bg-text/10 text-text/60 hover:bg-accent hover:text-white hover:shadow-lg hover:shadow-accent/20 active:scale-[0.98]'
                  }`}
                >
                  {isSaving ? 'Configuring System...' : t('onboarding.finish')}
                  {!isSaving && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  )}
                </button>

                <div className="text-center">
                  <span className="text-[9px] font-black text-text-muted/20 uppercase tracking-[0.3em]">
                    MomAI Enterprise V{appVersion} • All Data Localized
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
