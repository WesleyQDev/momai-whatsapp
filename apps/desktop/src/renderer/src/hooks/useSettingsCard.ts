import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { useI18n } from '../i18n'

export type Tab = 'general' | 'brain' | 'updates' | 'economy' | 'voice'
export type Theme = 'dark' | 'light'

export interface Settings {
  user_name: string
  assistant_persona: string
  ai_provider: string
  ai_model: string
  local_backend: string
  api_keys: { groq: string; gemini: string }
  tts_voice: string
  tts_enabled: boolean
  wake_word_enabled: boolean
  wake_word_sensitivity: number
  locale: string
  daily_briefing_enabled: boolean
  ai_tier: 'lite' | 'pro' | 'ultra'
  auto_start_llm: boolean
}

export interface LocalDetails {
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
}

export const useSettingsCard = (initialTab: Tab = 'general', onClose: () => void) => {
  const { t, setLocale } = useI18n()
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [isLoading, setIsLoading] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [theme, setTheme] = useState<Theme>(
    (document.documentElement.getAttribute('data-theme') as Theme) || 'dark'
  )

  const [settings, setSettings] = useState<Settings>({
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
    ai_tier: 'pro',
    auto_start_llm: true
  })

  const [installStatus, setInstallStatus] = useState<
    'checking' | 'installed' | 'missing' | 'installing' | 'error'
  >('checking')
  const [installProgress, setInstallProgress] = useState(0)
  const [localDetails, setLocalDetails] = useState<LocalDetails>({})
  const [gamingApps, setGamingApps] = useState<any[]>([])
  const [newApp, setNewApp] = useState({ name: '', executable: '' })
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [isAdvancedHardwareOpen, setIsAdvancedHardwareOpen] = useState(false)
  const [tiersConfig, setTiersConfig] = useState<any>(null)
  const [expandedLang, setExpandedLang] = useState<string | null>('p')

  useEffect(() => {
    // @ts-ignore
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
      console.error('Error checking local status:', error)
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
      console.error('Error loading gaming apps:', error)
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
    // @ts-ignore
    window.api.resetWindowSize?.()
    onClose()
    localStorage.setItem('momai_mode_changing', 'true')
    window.dispatchEvent(new CustomEvent('momai_tier_change_start'))
    
    try {
      window.dispatchEvent(new CustomEvent('momai_new_session'))
      localStorage.setItem('momai_ai_tier', tier)
      await api.post('/setup/apply-tier', null, { params: { tier } })
      
      // @ts-ignore
      await window.api.restartBackend()
      
      // @ts-ignore
      window.api.resetWindowSize?.()
      
      window.location.href = window.location.pathname + '#/'
    } catch (error) {
      console.error('Error changing tier:', error)
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
      console.error('Error loading settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveSettings = async (newSettings: Settings) => {
    try {
      const res = await api.patch('/settings', newSettings)
      window.dispatchEvent(new CustomEvent('momai_settings_sync', { detail: newSettings }))
      if (newSettings.ai_tier) localStorage.setItem('momai_ai_tier', newSettings.ai_tier)
      if (newSettings.user_name) localStorage.setItem('momai_user_name', newSettings.user_name)
      return res
    } catch (error) {
      console.error('Error saving settings:', error)
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

  const handleDevMode = () => {
    const current = localStorage.getItem('momai_dev_mode') === 'true'
    localStorage.setItem('momai_dev_mode', String(!current))
    window.dispatchEvent(new CustomEvent('momai_dev_mode_sync', { detail: !current }))
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 10)
  }

  const resetOnboarding = () => {
    // @ts-ignore
    window.api.resetWindowSize?.()
    onClose()
    updateField('onboarding_completed', false, true)
    // @ts-ignore
    window.electron.ipcRenderer.send('reset-onboarding')
  }

  return {
    t,
    activeTab,
    setActiveTab,
    isLoading,
    setIsLoading,
    showHelp,
    setShowHelp,
    theme,
    settings,
    setSettings,
    installStatus,
    installProgress,
    localDetails,
    gamingApps,
    newApp,
    setNewApp,
    appVersion,
    isAdvancedHardwareOpen,
    setIsAdvancedHardwareOpen,
    tiersConfig,
    expandedLang,
    setExpandedLang,
    changeTheme,
    checkLocalStatus,
    handleInstallEngine,
    handleAddGamingApp,
    handleDeleteGamingApp,
    handleTierChange,
    saveSettings,
    updateField,
    handleDevMode,
    resetOnboarding
  }
}
