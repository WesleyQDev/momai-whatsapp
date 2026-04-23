import { useCallback } from 'react'
import type { Platform } from '@/types'

export function useOSDetection() {
  const detectPlatform = useCallback((): Platform => {
    const ua = navigator.userAgent.toLowerCase()
    const platform = (navigator.platform || '').toLowerCase()
    if (platform.includes('linux') || ua.includes('linux')) return 'linux'
    if (platform.includes('mac') || ua.includes('mac')) return 'mac'
    return 'win'
  }, [])

  return { detectPlatform }
}
