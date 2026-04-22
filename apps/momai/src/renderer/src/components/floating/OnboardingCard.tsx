import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useI18n } from '../../i18n'

import iconGif from '../../assets/icon.gif'

interface OnboardingCardProps {
  onFinish: (savedSettings?: Record<string, any>) => void
}

const ONBOARDING_SAVE_TIMEOUT_MS = 4500

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Onboarding save timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
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
    // Prevent resizing during onboarding
    window.api?.setResizable?.(false)

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

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only trigger on Enter, if name is present, and we are in step 2 (Personality Setup)
      if (e.key === 'Enter' && step === 2 && name.trim() && !isSaving) {
        handleFinish()
      }
    }

    if (step === 2) {
      window.addEventListener('keydown', handleGlobalKeyDown)
    }

    return () => {
      // Re-enable resizing when leaving onboarding
      window.api?.setResizable?.(true)
      window.removeEventListener('ai_model_change_progress' as any, handleProgress)
      window.removeEventListener('momai_setup_progress' as any, handleProgress)
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [step, name, isSaving])

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('momai_theme', newTheme)
  }

  const handleSelectTier = async (tier: string) => {
    setSelectedTier(tier)
    localStorage.setItem('momai_ai_tier', tier)
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

    // Ensure window becomes resizable right before going into the app
    window.api?.setResizable?.(true)

    try {
      const payload = {
        user_name: name,
        tts_voice: selectedVoice,
        onboarding_completed: true,
        locale: selectedLang === 'p' ? 'pt-BR' : 'en-US',
        ai_tier: selectedTier,
        wake_word_enabled: selectedTier === 'ultra'
      }
      // Signal main process first (works offline - saves to local file)
      try {
        window.api?.markFirstLaunchFinished?.(payload)
      } catch (error) {
        console.warn('[Onboarding] Failed to mark first launch as finished:', error)
      }

      // Try to sync with backend directly
      try {
        await withTimeout(api.patch('/settings', payload), ONBOARDING_SAVE_TIMEOUT_MS)
        window.dispatchEvent(new CustomEvent('momai_settings_sync', { detail: payload }))
        onFinish()
      } catch (apiError) {
        console.warn('[Onboarding] Backend not ready, settings will be queued by App.tsx')
        onFinish(payload)
      }
    } catch (error) {
      console.error('Erro ao salvar onboarding:', error)
      onFinish({
        user_name: name,
        tts_voice: selectedVoice,
        onboarding_completed: true,
        locale: selectedLang === 'p' ? 'pt-BR' : 'en-US',
        ai_tier: selectedTier,
        wake_word_enabled: selectedTier === 'ultra'
      })
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
        className="no-drag group relative bg-white/[0.03] border border-white/5 rounded-2xl p-6 text-left flex flex-row items-center hover:border-accent/40 hover:bg-white/[0.05] transition-all duration-500 overflow-hidden active:scale-[0.97] w-full gap-6 h-[140px]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Subtle background pattern/glow */}
        <div
          className={`absolute -top-24 -right-24 w-48 h-48 ${styles.iconBg} blur-[80px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}
        />

        <div className="relative z-10 flex flex-row items-center gap-6 w-full pointer-events-none">
          <div
            className={`w-16 h-16 shrink-0 rounded-xl ${styles.iconBg} flex items-center justify-center ${styles.text} shadow-inner border border-white/5 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3`}
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

        <div className="absolute right-8 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all duration-500 text-accent/50">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[301] bg-bg flex animate-fade-in overflow-hidden select-none transition-colors duration-500"
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
            const group = VOICE_CATALOG.find((g) => g.code === nextLang)
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
                <path
                  d="M245 285a126 126 0 0 1 230-66 126 126 0 0 0-230 66z"
                  fill="#fff"
                />
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
      <div className="flex-1 bg-card p-8 flex flex-col justify-center overflow-y-auto transition-colors duration-500">
        <div className="w-full max-w-none mx-auto px-6">
          {step === 1 ? (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col items-center text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-text tracking-tight">
                  {t('onboarding.tier.title')}
                </h2>
                <p className="text-sm text-text-muted font-normal opacity-50">
                  {t('onboarding.tier.subtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 w-full max-w-[700px] px-4">
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
                    className="no-drag w-full bg-input border border-border/20 rounded-lg px-3.5 py-3 text-sm font-bold text-text focus:border-accent/40 outline-none transition-all placeholder:opacity-10 shadow-inner"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
                        className="no-drag w-full bg-input border border-border/20 rounded-lg px-3 py-2 text-[10px] font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
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
                        className="no-drag w-full bg-input border border-border/20 rounded-lg px-3 py-2 text-[10px] font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
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
                        className="no-drag w-full bg-input border border-border/20 rounded-lg px-4 py-3 text-xs font-bold text-text outline-none focus:border-accent/40 appearance-none cursor-pointer"
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
