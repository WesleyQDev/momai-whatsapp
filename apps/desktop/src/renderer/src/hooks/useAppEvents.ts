import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface AppEventsProps {
  openSettings: (tab?: any) => void
  handleGraphOption: (option: any) => void
}

export function useAppEvents({ openSettings, handleGraphOption }: AppEventsProps) {
  const navigate = useNavigate()

  useEffect(() => {
    const handleOpenExtensions = () => {
      navigate('/extensions', { state: { tab: 'store' } })
    }
    window.addEventListener('momai_open_extensions', handleOpenExtensions)

    const handleNavigate = (e: any) => {
      const detail = e.detail || {}
      if (detail.path) {
        navigate(detail.path, detail.state ? { state: detail.state } : undefined)
      }
    }
    window.addEventListener('momai_navigate', handleNavigate)

    const handleOpenSettings = (e: any) => {
      const tab = e.detail?.tab || 'general'
      openSettings(tab)
    }
    window.addEventListener('momai_open_settings', handleOpenSettings)

    const handleOpenUltra = () => {
      openSettings('brain')
    }
    window.addEventListener('momai_open_settings_ultra', handleOpenUltra)

    const removeTrigger = window.electron.ipcRenderer.on('trigger-action', (_, action) => {
      handleGraphOption(action)
    })

    return () => {
      window.removeEventListener('momai_open_extensions', handleOpenExtensions)
      window.removeEventListener('momai_navigate', handleNavigate)
      window.removeEventListener('momai_open_settings', handleOpenSettings)
      window.removeEventListener('momai_open_settings_ultra', handleOpenUltra)
      removeTrigger()
    }
  }, [navigate, openSettings, handleGraphOption])
}
