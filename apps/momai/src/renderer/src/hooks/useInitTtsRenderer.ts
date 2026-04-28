import { useEffect } from 'react'

export function useInitTtsRenderer() {
  useEffect(() => {
    import('../services/ttsService').then(({ getTTSServiceRenderer }) => {
      getTTSServiceRenderer()
    }).catch((err) => {
      console.warn('[InitTTS] Failed to init TTS renderer service:', err)
    })
  }, [])
}
