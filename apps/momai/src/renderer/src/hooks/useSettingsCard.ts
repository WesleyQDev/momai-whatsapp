import { useState, useEffect, useCallback, useRef } from 'react'
import { api, stopVoice, stopGeneration, fetchEconomyConfig, updateEconomyConfig } from '../services/api'
import { useI18n } from '../i18n'

export type Tab = 'general' | 'brain' | 'updates' | 'economy' | 'voice' | 'logs' | 'developer'
export type Theme = 'dark' | 'light'

export interface Settings {
  user_name: string
  assistant_persona: string
  ai_provider: string
  ai_model: string
  local_backend: string
  api_keys: { groq: string; gemini: string }
  tts_engine: string
  tts_voice: string
  tts_enabled: boolean
  wake_word_enabled: boolean
  wake_word_sensitivity: number
  locale: string
  daily_briefing_enabled: boolean
  greeting_auto_saudacao: boolean
  greeting_resumo: boolean
  greeting_acao: string
  greeting_fixa: string
  ai_tier: 'lite' | 'pro' | 'ultra'
  auto_start_llm: boolean
  context_window_mode?: 'min' | 'medium' | 'max' | 'custom'
  context_window_tokens?: number
  skip_intro?: boolean
  onboarding_completed?: boolean
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
  total_ram_gb?: number
  total_vram_gb?: number
}

const TIER_DEFAULTS: Record<string, { tts_enabled: boolean; wake_word_enabled: boolean }> = {
  lite: { tts_enabled: true, wake_word_enabled: false },
  pro: { tts_enabled: true, wake_word_enabled: false },
  ultra: { tts_enabled: true, wake_word_enabled: true }
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
    tts_engine: 'kokoro',
    tts_voice: '',
    tts_enabled: true,
    wake_word_enabled: false,
    wake_word_sensitivity: 5,
    locale: 'pt-BR',
    daily_briefing_enabled: false,
    greeting_auto_saudacao: true,
    greeting_resumo: true,
    greeting_acao: '',
    greeting_fixa: '',
    ai_tier: 'pro',
    auto_start_llm: true,
    context_window_mode: 'min',
    context_window_tokens: 2048,
    skip_intro: false
  })

  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const [installStatus, setInstallStatus] = useState<
    'checking' | 'installed' | 'missing' | 'installing' | 'error'
  >('checking')
  const [installProgress, setInstallProgress] = useState(0)
  const [localDetails, setLocalDetails] = useState<LocalDetails>({})
  const [gamingApps, setGamingApps] = useState<any[]>([])
  const [newApp, setNewApp] = useState({ name: '', executable: '' })
  const [economyConfig, setEconomyConfig] = useState<any>(null)
  const [economyState, setEconomyState] = useState<{ active: boolean; reason: string | null; detectedGames: { name: string; processName: string }[] }>({
    active: false,
    reason: null,
    detectedGames: [],
  })
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [isAdvancedHardwareOpen, setIsAdvancedHardwareOpen] = useState(false)
  const [tiersConfig, setTiersConfig] = useState<any>(null)
  const [expandedLang, setExpandedLang] = useState<string | null>('p')
  const [isDevMode, setIsDevMode] = useState(
    () => localStorage.getItem('momai_dev_mode') === 'true'
  )

  useEffect(() => {
    const syncDevMode = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') {
        setIsDevMode(detail)
        return
      }
      setIsDevMode(localStorage.getItem('momai_dev_mode') === 'true')
    }

    window.addEventListener('momai_dev_mode_sync', syncDevMode as EventListener)
    return () => window.removeEventListener('momai_dev_mode_sync', syncDevMode as EventListener)
  }, [])

  useEffect(() => {
    // @ts-ignore
    window.api
      .getAppVersion?.()
      .then(setAppVersion)
      .catch(() => {})
  }, [])

  const changeTheme = useCallback((newTheme: Theme) => {
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('momai_theme', newTheme)
  }, [])

  const checkLocalStatus = useCallback(async () => {
    try {
      const res = await api.get('/setup/status')
      if (res.data) {
        setLocalDetails(res.data)
        if (res.data.engine_installed) {
          setInstallStatus('installed')
        } else {
          setInstallStatus('missing')
        }
      }
    } catch (error) {
      console.error('Error checking local status:', error)
      setInstallStatus('error')
    }
  }, [])

  const handleInstallEngine = useCallback(async (backend?: string) => {
    setInstallStatus('installing')
    setInstallProgress(0)
    try {
      const res = await api.post('/setup/install-engine', { backend })
      if (res.data?.status === 'error') {
        setInstallStatus('error')
        alert(res.data.message)
      }
    } catch (error) {
      setInstallStatus('error')
    }
  }, [])

  const loadGamingApps = useCallback(async () => {
    try {
      const res = await api.get('/system/gaming-apps')
      if (res.data) setGamingApps(res.data)
    } catch (error) {
      console.error('Error loading gaming apps:', error)
    }
  }, [])

  const loadEconomyConfig = useCallback(async () => {
    try {
      const config = await fetchEconomyConfig()
      setEconomyConfig(config)
    } catch {
      console.error('Error loading economy config')
    }
  }, [])

  const handleUpdateEconomyConfig = useCallback(async (patch: Record<string, any>) => {
    try {
      await updateEconomyConfig(patch)
      await loadEconomyConfig()
    } catch {
      console.error('Error updating economy config')
    }
  }, [loadEconomyConfig])

  const handleAddGamingApp = useCallback(async () => {
    if (!newApp.name || !newApp.executable) return
    try {
      const gamePath = (newApp as any).path || newApp.executable
      const folderName = gamePath.split(/[\\/]/).pop() || newApp.name
      await api.post('/system/gaming-apps', { name: folderName, executable: folderName })
      setNewApp({ name: '', executable: '' })
      loadGamingApps()
    } catch (error) {
      alert(t('settings.economy.addAppError'))
    }
  }, [newApp, loadGamingApps, t])

  const handleDeleteGamingApp = useCallback(
    async (id: number) => {
      try {
        await api.delete(`/system/gaming-apps/${id}`)
        loadGamingApps()
      } catch (error) {
        alert(t('settings.economy.removeAppError'))
      }
    },
    [loadGamingApps, t]
  )

  const handleTierChange = useCallback(
    async (_tier: 'lite' | 'pro' | 'ultra') => {
      window.api.resetWindowSize?.()

      stopVoice().catch(() => {})
      stopGeneration().catch(() => {})

      onClose()
      localStorage.setItem('momai_ai_tier', _tier)
      window.dispatchEvent(new CustomEvent('momai_new_session'))
      window.dispatchEvent(new CustomEvent('momai_tier_change_start', { detail: _tier }))

      try {
        await api.post(`/setup/apply-tier?tier=${_tier}`)
      } catch (err) {
        console.error('Error applying tier:', err)
        window.dispatchEvent(new CustomEvent('momai_tier_change_end'))
        return
      }

      const tierDefaults = TIER_DEFAULTS[_tier]
      const payload: Record<string, any> = {
        ai_tier: _tier,
        tts_enabled: tierDefaults.tts_enabled,
        wake_word_enabled: tierDefaults.wake_word_enabled
      }
      if (_tier === 'lite') {
        payload.tts_engine = 'edge-tts'
      }

      api
        .patch('/settings', payload)
        .then(() => {
          const merged = { ...settingsRef.current, ...payload }
          window.dispatchEvent(new CustomEvent('momai_settings_sync', { detail: merged }))
        })
        .catch((err) => console.error('Error saving tier settings:', err))

      window.dispatchEvent(new CustomEvent('momai_tier_change_end'))
    },
    [onClose]
  )

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get('/settings')
      if (res.data) {
        setSettings(res.data)
        if (res.data.locale) {
          setLocale(res.data.locale)
        }
      }

      const statusRes = await api.get('/status')
      if (statusRes.data) {
        setTiersConfig(statusRes.data.tiers_config)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setIsLoading(false)
    }
  }, [setLocale])

  const saveSettings = useCallback(async (newSettings: Settings) => {
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
  }, [])

  const updateField = useCallback(
    async (field: string, value: any, saveNow = false): Promise<void> => {
      const prev = settingsRef.current
      const newState = { ...prev, [field]: value }
      setSettings(newState)

      if (field === 'locale') {
        setLocale(value)
      }

      if (saveNow) {
        await api.patch('/settings', newState)
        window.dispatchEvent(new CustomEvent('momai_settings_sync', { detail: newState }))
        if (newState.ai_tier) localStorage.setItem('momai_ai_tier', newState.ai_tier)
        if (newState.user_name) localStorage.setItem('momai_user_name', newState.user_name)
      }
    },
    [setLocale]
  )

  const handleDevMode = useCallback(() => {
    const current = localStorage.getItem('momai_dev_mode') === 'true'
    const next = !current
    localStorage.setItem('momai_dev_mode', String(next))
    window.dispatchEvent(new CustomEvent('momai_dev_mode_sync', { detail: next }))
    setIsDevMode(next)
  }, [])

  const resetOnboarding = useCallback(async () => {
    // @ts-ignore
    window.api.resetWindowSize?.()

    const newSettings = { ...settingsRef.current, onboarding_completed: false }
    setSettings(newSettings)
    try {
      await api.patch('/settings', newSettings)
      window.dispatchEvent(new CustomEvent('momai_settings_sync', { detail: newSettings }))
    } catch (e) {
      console.error(e)
    }

    // Clear chat session
    window.dispatchEvent(new CustomEvent('momai_new_session'))

    // @ts-ignore
    window.electron.ipcRenderer.send('reset-onboarding')

    onClose()
  }, [onClose])

  useEffect(() => {
    loadSettings()
    checkLocalStatus()
    loadGamingApps()
    loadEconomyConfig()

    // Fetch current economy state on mount (covers race condition with IPC)
    ;(window as any).api?.getEconomyState?.().then((state: any) => {
      if (state) setEconomyState(state)
    }).catch(() => {})

    const cleanup = (window as any).api?.onEconomyStateChange?.((
      state: { active: boolean; reason: string | null; detectedGames: { name: string; processName: string }[] }
    ) => {
      setEconomyState(state)
    })

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
      cleanup?.()
      window.removeEventListener('ai_model_changed', handleModelChange)
      window.removeEventListener('momai_setup_progress', handleSetupProgress)
      window.removeEventListener('momai_setup_complete', handleSetupComplete)
    }
  }, [loadSettings, checkLocalStatus, loadGamingApps, loadEconomyConfig])

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
    isDevMode,
    changeTheme,
    checkLocalStatus,
    handleInstallEngine,
    handleAddGamingApp,
    handleDeleteGamingApp,
    handleTierChange,
    saveSettings,
    updateField,
    handleDevMode,
    resetOnboarding,
    economyConfig,
    handleUpdateEconomyConfig,
    economyState,
  }
}
