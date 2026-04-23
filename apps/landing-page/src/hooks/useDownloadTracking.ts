import { useCallback } from 'react'
import { useOSDetection } from './useOSDetection'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

export function useDownloadTracking() {
  const { detectPlatform } = useOSDetection()

  const trackDownload = useCallback(
    (linkText: string, fileName?: string, fileExtension?: string) => {
      const os = detectPlatform()
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'file_download', {
          file_extension: fileExtension || '',
          file_name: fileName || '',
          link_text: linkText,
          platform: os,
        })
      }
    },
    [detectPlatform],
  )

  return { trackDownload }
}
