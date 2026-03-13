import { useState, useEffect, useCallback } from 'react'
import { fetchExtensions, fetchSettings, SettingsData } from '../services/api'
import { useI18n } from '../i18n'

export function useAppInitialization(isOnline: boolean, isReady: boolean) {
  const { setLocale } = useI18n()
  const [showWelcome, setShowWelcome] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingAttempted, setOnboardingAttempted] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [extensions, setExtensions] = useState<any[]>([])
  const [bootstrapError, setBootstrapError] = useState<{
    type: string
    message: string
    details?: string
  } | null>(null)
  const [firstLaunchChecked, setFirstLaunchChecked] = useState(false)
  const [isFirstLaunch, setIsFirstLaunch] = useState(
    () => localStorage.getItem('momai_mode_changing') === 'true'
  )
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [pendingOnboardingSettings, setPendingOnboardingSettings] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    if (localStorage.getItem('momai_mode_changing') === 'true') {
      localStorage.removeItem('momai_mode_changing')
    }

    const handleModeChangeStart = () => {
      setIsFirstLaunch(true)
      setShowWelcome(true)
      // @ts-ignore
      window.api.resetWindowSize?.()
    }
    window.addEventListener('momai_tier_change_start', handleModeChangeStart)

    window.api.getAppVersion?.().then(setAppVersion).catch(() => {})

    const removeBootError = window.electron.ipcRenderer.on(
      'bootstrap-error',
      (_event: any, error: { type: string; message: string; details?: string }) => {
        setBootstrapError(error)
      }
    )

    const handleBootstrapError = (e: any) => {
      if (e.detail) {
        setBootstrapError(e.detail)
      }
    }
    window.addEventListener('momai_bootstrap_error', handleBootstrapError)

    return () => {
      window.removeEventListener('momai_tier_change_start', handleModeChangeStart)
      window.removeEventListener('momai_bootstrap_error', handleBootstrapError)
      removeBootError()
    }
  }, [])

  // Check if this is a first launch
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const firstLaunch = await window.api?.isFirstLaunch?.()
        if (firstLaunch) {
          setShowOnboarding(true)
          setOnboardingAttempted(true)
          setIsFirstLaunch(true)
        }
      } catch (err) {
        console.error('[App] Failed to check first launch:', err)
      } finally {
        setFirstLaunchChecked(true)
      }
    }
    checkFirstLaunch()
  }, [])

  // Sync settings
  useEffect(() => {
    if (!isOnline || settingsLoaded) return

    const syncSettings = async () => {
      try {
        const data = await fetchSettings()
        setSettings(data)
        if (data.locale) {
          setLocale(data.locale as any)
        }
        if (data.ai_tier) {
          localStorage.setItem('momai_ai_tier', data.ai_tier)
        }

        if (data && data.onboarding_completed === false && !onboardingAttempted) {
          setShowOnboarding(true)
        }
        setSettingsLoaded(true)

        const exts = await fetchExtensions()
        setExtensions(exts)
      } catch (err) {
        console.error('Retrying settings sync...', err)
      }
    }

    syncSettings()
  }, [isOnline, settingsLoaded, setLocale, onboardingAttempted])

  // Sync settings via global event
  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail) {
        setSettings(e.detail)
        if (e.detail.onboarding_completed === false) {
          setIsFirstLaunch(true)
          setShowWelcome(true)
          setTimeout(() => {
            setShowOnboarding(true)
            setOnboardingAttempted(false)
          }, 100)
        }
      }
    }
    window.addEventListener('momai_settings_sync', handleSync)
    
    const handleExtSync = (e: any) => setExtensions(e.detail)
    window.addEventListener('momai_extensions_sync', handleExtSync)

    return () => {
      window.removeEventListener('momai_settings_sync', handleSync)
      window.removeEventListener('momai_extensions_sync', handleExtSync)
    }
  }, [])

  // Flush pending onboarding settings
  useEffect(() => {
    if (isOnline && pendingOnboardingSettings) {
      const flush = async () => {
        try {
          const { api: apiService } = await import('../services/api')
          await apiService.patch('/settings', pendingOnboardingSettings)
          window.dispatchEvent(
            new CustomEvent('momai_settings_sync', { detail: pendingOnboardingSettings })
          )
        } catch (err) {
          console.error('[App] Failed to save pending onboarding settings', err)
          return
        }
        setPendingOnboardingSettings(null)
      }
      flush()
    }
  }, [isOnline, pendingOnboardingSettings])

  // App ready trigger
  useEffect(() => {
    if (isReady && settingsLoaded && !showOnboarding && !bootstrapError) {
      window.electron.ipcRenderer.send('app-ready')
    }
  }, [isReady, settingsLoaded, showOnboarding, bootstrapError])

  const handleWelcomeComplete = useCallback(() => {
    setShowWelcome(false)
  }, [])

  return {
    showWelcome,
    setShowWelcome,
    showOnboarding,
    setShowOnboarding,
    isFirstLaunch,
    setIsFirstLaunch,
    appVersion,
    bootstrapError,
    firstLaunchChecked,
    settingsLoaded,
    settings,
    extensions,
    onboardingAttempted,
    setOnboardingAttempted,
    setPendingOnboardingSettings,
    handleWelcomeComplete
  }
}
