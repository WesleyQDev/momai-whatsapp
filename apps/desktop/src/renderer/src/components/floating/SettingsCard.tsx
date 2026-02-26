import { useState, useEffect } from 'react'
import FloatingCard from './FloatingCard'
import HelpCard from './HelpCard'
import { api } from '../../services/api'
import { useI18n } from '../../i18n'

interface SettingsCardProps {
  onClose: () => void
  initialTab?: Tab
}

type Tab = 'general' | 'brain' | 'updates' | 'economy' | 'voice'
type Theme = 'dark' | 'light'

export default function SettingsCard({ onClose, initialTab = 'general' }: SettingsCardProps) {
  const { t, setLocale } = useI18n()
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [isLoading, setIsLoading] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [theme, setTheme] = useState<Theme>(
    (document.documentElement.getAttribute('data-theme') as Theme) || 'dark'
  )

  // State for form fields
  const [settings, setSettings] = useState({
    user_name: '',
    assistant_persona: '',
    ai_provider: 'local',
    ai_model: '',
    local_backend: 'auto',
    api_keys: { groq: '', gemini: '' },
    tts_voice: '',
    tts_enabled: true,
    wake_word_enabled: false,
    wake_word_sensitivity: 5,
    locale: 'pt-BR',
    daily_briefing_enabled: false,
    ai_tier: 'pro' as 'lite' | 'pro' | 'ultra'
  })

  const [installStatus, setInstallStatus] = useState<
    'checking' | 'installed' | 'missing' | 'installing' | 'error'
  >('checking')
  const [installProgress, setInstallProgress] = useState(0)
  const [localDetails, setLocalDetails] = useState<{
    cpu_name?: string
    detected_hardware?: string
    recommended_build?: string
    available_builds?: Record<
      string,
      { label: string; version: string; size_mb: number; description: string }
    >
    latest_version?: string
    installed_version?: string
    installed_build?: string
    installed_backends?: string[]
    current_local_backend?: string
    os_name?: string
  }>({})
  const [isBackendOpen, setIsBackendOpen] = useState(false)
  const [gamingApps, setGamingApps] = useState<any[]>([])
  const [newApp, setNewApp] = useState({ name: '', executable: '' })
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [isAdvancedHardwareOpen, setIsAdvancedHardwareOpen] = useState(false)
  const [tiersConfig, setTiersConfig] = useState<any>(null)

  useEffect(() => {
    window.api
      .getAppVersion?.()
      .then(setAppVersion)
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadSettings()
    checkLocalStatus()
    loadGamingApps()

    const handleModelChange = (e: any) => {
      const detail = e.detail
      if (detail) {
        setSettings((prev) => ({ ...prev, ai_provider: detail }))
      }
    }

    const handleSetupProgress = (e: any) => {
      setInstallProgress(e.detail.percent)
    }

    const handleSetupComplete = () => {
      setInstallStatus('installed')
      setInstallProgress(100)
      checkLocalStatus()
    }

    window.addEventListener('ai_model_changed', handleModelChange)
    window.addEventListener('momai_setup_progress', handleSetupProgress)
    window.addEventListener('momai_setup_complete', handleSetupComplete)
    return () => {
      window.removeEventListener('ai_model_changed', handleModelChange)
      window.removeEventListener('momai_setup_progress', handleSetupProgress)
      window.removeEventListener('momai_setup_complete', handleSetupComplete)
    }
  }, [])

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('momai_theme', newTheme)
  }

  const checkLocalStatus = async () => {
    try {
      const res = await api.get('/setup/status')
      setLocalDetails(res.data)
      if (res.data.engine_installed) {
        setInstallStatus('installed')
      } else {
        setInstallStatus('missing')
      }
    } catch (error) {
      console.error('Erro ao verificar status local:', error)
      setInstallStatus('error')
    }
  }

  const handleInstallEngine = async (backend?: string) => {
    setInstallStatus('installing')
    setInstallProgress(0)
    try {
      const res = await api.post('/setup/install-engine', { backend })
      if (res.data.status === 'error') {
        setInstallStatus('error')
        alert(res.data.message)
      }
    } catch (error) {
      setInstallStatus('error')
    }
  }

  const loadGamingApps = async () => {
    try {
      const res = await api.get('/system/gaming-apps')
      setGamingApps(res.data)
    } catch (error) {
      console.error('Erro ao carregar apps de jogo:', error)
    }
  }

  const handleAddGamingApp = async () => {
    if (!newApp.name || !newApp.executable) return
    try {
      await api.post('/system/gaming-apps', newApp)
      setNewApp({ name: '', executable: '' })
      loadGamingApps()
    } catch (error) {
      alert(t('settings.economy.addAppError'))
    }
  }

  const handleDeleteGamingApp = async (id: number) => {
    try {
      await api.delete(`/system/gaming-apps/${id}`)
      loadGamingApps()
    } catch (error) {
      alert(t('settings.economy.removeAppError'))
    }
  }

  const handleTierChange = async (tier: 'lite' | 'pro' | 'ultra') => {
    try {
      localStorage.setItem('momai_ai_tier', tier) // Cache instantâneo antes do reload
      await api.post('/setup/apply-tier', null, { params: { tier } })
      window.location.href = '/'
    } catch (error) {
      console.error('Erro ao mudar de nível:', error)
    }
  }

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings')
      setSettings(res.data)
      if (res.data.locale) {
        setLocale(res.data.locale)
      }
      
      const statusRes = await api.get('/status')
      setTiersConfig(statusRes.data.tiers_config)
    } catch (error) {
      console.error('Erro ao carregar configs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveSettings = async (newSettings: typeof settings) => {
    try {
      const res = await api.patch('/settings', newSettings)
      window.dispatchEvent(new CustomEvent('momai_settings_sync', { detail: newSettings }))
      if (newSettings.ai_tier) localStorage.setItem('momai_ai_tier', newSettings.ai_tier)
      if (newSettings.user_name) localStorage.setItem('momai_user_name', newSettings.user_name)
      return res
    } catch (error) {
      console.error('Erro ao salvar:', error)
      throw error
    }
  }

  const updateField = (field: string, value: any, saveNow = false) => {
    setSettings((prev) => {
      const newState = { ...prev, [field]: value }
      if (field === 'locale') {
        setLocale(value)
      }
      if (saveNow) saveSettings(newState)
      return newState
    })
    return Promise.resolve()
  }

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

  const [expandedLang, setExpandedLang] = useState<string | null>('p')

  if (isLoading)
    return (
      <FloatingCard title={t('settings.loadingTitle')} onClose={onClose} width="max-w-2xl">
        <div className="p-10 text-center text-text-muted text-sm font-medium">
          {t('settings.loadingBody')}
        </div>
      </FloatingCard>
    )

  const icons = {
    general: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    ),
    brain: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
    ),
    updates: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    economy: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    voice: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    )
  }

  return (
    <FloatingCard title={t('settings.title')} onClose={onClose} width="max-w-4xl">
      <div className="flex h-[520px] -mx-6 -my-6 bg-card">
        {/* SIDEBAR */}
        <div className="w-44 border-r border-border bg-sidebar p-4 flex flex-col gap-1">
          {[
            { id: 'general', label: t('settings.tabs.general'), icon: icons.general },
            { id: 'brain', label: t('settings.tabs.brain'), icon: icons.brain },
            { 
              id: 'voice', 
              label: t('settings.tabs.voice'), 
              icon: settings.ai_tier === 'lite' ? (
                <div className="relative">
                  {icons.voice}
                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-text-muted/40 border border-black" />
                </div>
              ) : icons.voice 
            },
            { id: 'economy', label: t('settings.tabs.economy'), icon: icons.economy },
            { id: 'updates', label: t('settings.tabs.updates'), icon: icons.updates }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === tab.id ? 'bg-accent/10 text-accent shadow-sm' : 'text-text-muted hover:bg-text/5 hover:text-text'}`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'updates' &&
                localDetails.installed_version !== localDetails.latest_version &&
                localDetails.latest_version && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                )}
            </button>
          ))}

          <div className="flex-1" />

          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 text-text-muted hover:bg-text/5 hover:text-text"
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
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Ajuda
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {activeTab === 'general' && (
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
                    onClick={() => {
                      const current = localStorage.getItem('momai_dev_mode') === 'true'
                      localStorage.setItem('momai_dev_mode', String(!current))
                      window.dispatchEvent(new CustomEvent('momai_dev_mode_sync', { detail: !current }))
                      // Force local update if needed, but the event will handle it in other components
                      setIsLoading(true)
                      setTimeout(() => setIsLoading(false), 10)
                    }}
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
                    onClick={() => {
                      if (confirm(t('onboarding.resetConfirm') || 'Deseja realmente reiniciar o tutorial de boas-vindas?')) {
                        updateField('onboarding_completed', false, true)
                        window.electron.ipcRenderer.send('reset-onboarding')
                      }
                    }}
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
          )}

          {activeTab === 'brain' && (
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
          )}

          {activeTab === 'voice' && (
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
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
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
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                >
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
          )}

          {activeTab === 'updates' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-lg font-black text-text tracking-tight uppercase">
                  {t('settings.updates.title')}
                </h2>
                <p className="text-[11px] text-text-muted font-medium">
                  {t('settings.updates.subtitle')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-xl border bg-input border-border flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[13px] font-black text-text uppercase tracking-tight">
                        {t('settings.updates.coreTitle')}
                      </span>
                      <span className="text-[10px] text-text-muted font-medium">
                        {t('settings.updates.coreVersion', { version: appVersion })}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-text-muted uppercase border border-border px-3 py-1 rounded-full bg-black/20">
                    {t('settings.updates.systemUpToDate')}
                  </span>
                </div>

                {localDetails.installed_version !== localDetails.latest_version && localDetails.latest_version && (
                  <div className="p-5 rounded-xl border bg-accent/5 border-accent/20 space-y-4 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[13px] font-black text-text uppercase tracking-tight">
                            {t('settings.updates.engineTitle')}
                          </span>
                          <span className="text-[10px] text-accent font-bold uppercase">
                            Nova versão v{localDetails.latest_version} disponível
                          </span>
                        </div>
                      </div>
                      {installStatus === 'installing' ? (
                        <span className="text-[10px] font-black text-accent uppercase tracking-widest">
                          {t('settings.updates.updating', { percent: installProgress })}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleInstallEngine(settings.local_backend === 'auto' ? undefined : settings.local_backend)}
                          className="px-4 py-2 bg-accent text-white text-[10px] font-black uppercase rounded-lg hover:opacity-90 transition-all shadow-lg shadow-accent/20"
                        >
                          {t('settings.updates.updateTo', { version: localDetails.latest_version })}
                        </button>
                      )}
                    </div>
                    {installStatus === 'installing' && (
                      <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                        <div className="h-full bg-accent transition-all duration-300 ease-out" style={{ width: `${installProgress}%` }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'economy' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-text tracking-tight uppercase">
                    {t('settings.economy.title')}
                  </h2>
                  <span className="text-[10px] font-black bg-accent text-white px-2 py-0.5 rounded-md tracking-tighter">
                    {t('settings.economy.badge')}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted font-medium">
                  {t('settings.economy.subtitle')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-accent/5 border border-border/20 flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M6 12h4M14 8h-4v8h4M15 12h3" />
                      <rect x="2" y="6" width="20" height="12" rx="2" />
                    </svg>
                  </div>
                  <div className="flex flex-col justify-center">
                    <span className="text-[12px] font-black text-text uppercase">
                      {t('settings.economy.monitoringTitle')}
                    </span>
                    <p className="text-[10px] text-text-muted leading-relaxed">
                      {t('settings.economy.monitoringBody')}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                    {t('settings.economy.addTrigger')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t('settings.economy.appNamePlaceholder')}
                      value={newApp.name}
                      onChange={(e) => setNewApp((prev) => ({ ...prev, name: e.target.value }))}
                      className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none focus:border-accent/40"
                    />
                    <input
                      type="text"
                      placeholder={t('settings.economy.appExePlaceholder')}
                      value={newApp.executable}
                      onChange={(e) =>
                        setNewApp((prev) => ({ ...prev, executable: e.target.value }))
                      }
                      className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none focus:border-accent/40"
                    />
                    <button
                      onClick={handleAddGamingApp}
                      className="px-4 bg-accent text-white rounded-lg text-xs font-black uppercase hover:opacity-90 transition-all"
                    >
                      {t('settings.economy.addButton')}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                    {t('settings.economy.monitoredApps')}
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {gamingApps.length === 0 ? (
                      <div className="py-8 text-center border border-dashed border-border rounded-xl">
                        <span className="text-[11px] text-text-muted font-medium italic">
                          {t('settings.economy.emptyApps')}
                        </span>
                      </div>
                    ) : (
                      gamingApps.map((app) => (
                        <div
                          key={app.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-border"
                        >
                          <div className="flex flex-col">
                            <span className="text-[12px] font-bold text-text">{app.name}</span>
                            <span className="text-[10px] text-accent font-mono">
                              {app.executable}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteGamingApp(app.id)}
                            className="p-2 text-text-muted hover:text-red-500 transition-colors"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showHelp && <HelpCard onClose={() => setShowHelp(false)} />}
    </FloatingCard>
  )
}
