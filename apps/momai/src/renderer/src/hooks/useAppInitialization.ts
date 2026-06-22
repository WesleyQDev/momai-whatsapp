import { useState, useEffect, useCallback } from 'react'
import { fetchExtensions, fetchSettings, SettingsData } from '../services/api'
import { useI18n } from '../i18n'

export function useAppInitialization(isOnline: boolean, isReady: boolean) {
  const { setLocale } = useI18n()
  const [showWelcome, setShowWelcome] = useState(
    () => localStorage.getItem('momai_skip_intro') !== 'true'
  )
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
  const [pendingOnboardingSettings, setPendingOnboardingSettings] = useState<Record<
    string,
    any
  > | null>(null)

  useEffect(() => {
    if (!settingsLoaded) return
    if (settings?.skip_intro) {
      setShowWelcome(false)
    }
  }, [settingsLoaded, settings?.skip_intro])

  useEffect(() => {
    window.api
      .getAppVersion?.()
      .then(setAppVersion)
      .catch(() => {})

    const removeBootError = window.momaiAPI.onBootstrapError((error) => {
      setBootstrapError(error)
    })

    const handleBootstrapError = (e: any) => {
      if (e.detail) {
        setBootstrapError(e.detail)
      }
    }
    window.addEventListener('momai_bootstrap_error', handleBootstrapError)

    return () => {
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
        if (typeof data.skip_intro === 'boolean') {
          localStorage.setItem('momai_skip_intro', String(data.skip_intro))
        }
        if (data.locale) {
          setLocale(data.locale as any)
        }
        if (data.ai_tier) {
          localStorage.setItem('momai_ai_tier', data.ai_tier)
        }

        if (data && data.onboarding_completed === false && !onboardingAttempted) {
          setShowOnboarding(true)
        } else if (data && data.onboarding_completed === true) {
          setShowOnboarding(false)
          setOnboardingAttempted(true)
          setIsFirstLaunch(false)
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
        if (typeof e.detail.skip_intro === 'boolean') {
          localStorage.setItem('momai_skip_intro', String(e.detail.skip_intro))
          if (e.detail.skip_intro) {
            setShowWelcome(false)
          }
        }
        if (e.detail.onboarding_completed === false) {
          setIsFirstLaunch(true)
          setShowWelcome(localStorage.getItem('momai_skip_intro') !== 'true')
          setShowOnboarding(true)
          setOnboardingAttempted(false)
        } else if (e.detail.onboarding_completed === true) {
          setShowOnboarding(false)
          setOnboardingAttempted(true)
          setIsFirstLaunch(false)
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
      window.momaiAPI.markAppReady()

      // Briefing automático ao iniciar
      if (settings?.daily_briefing_enabled) {
        const now = new Date()
        const hour = now.getHours()
        const saudacao = hour < 12 ? 'bom dia' : hour < 18 ? 'boa tarde' : 'boa noite'
        const dias = [
          'domingo',
          'segunda-feira',
          'terça-feira',
          'quarta-feira',
          'quinta-feira',
          'sexta-feira',
          'sábado'
        ]
        const mes = (now.getMonth() + 1).toString().padStart(2, '0')
        const dia = `${dias[now.getDay()]}`
        const data = `${now.getDate().toString().padStart(2, '0')}/${mes}/${now.getFullYear()}`

        const fixa = (settings as any).greeting_fixa?.trim()
        if (fixa) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('momai_trigger_briefing', { detail: fixa }))
          }, 800)
        } else {
          const parts: string[] = []
          if ((settings as any).greeting_auto_saudacao !== false) {
            parts.push(saudacao)
          }
          if ((settings as any).greeting_resumo !== false) {
            parts.push(`faça um resumo do dia de hoje, ${dia}, ${data}`)
          }
          const acao = (settings as any).greeting_acao?.trim()
          if (acao) {
            parts.push(acao)
          }
          if (parts.length === 0) {
            parts.push(`${saudacao!}`)
          }
          const prompt = parts.join('. ') + '.'
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('momai_trigger_briefing', { detail: prompt }))
          }, 800)
        }
      }
    }
  }, [isReady, settingsLoaded, showOnboarding, bootstrapError, settings?.daily_briefing_enabled])

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
