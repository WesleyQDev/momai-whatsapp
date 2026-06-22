import { useEffect } from 'react'

export function useOverlayBridge(graphState: any) {
  useEffect(() => {
    const checkAndTriggerOverlay = async () => {
      if (graphState.view) {
        const state = await window.momaiAPI.invoke('get-window-state')
        if (state.minimized || !state.visible) {
          window.momaiAPI.send('open-overlay', graphState)
        } else {
          window.momaiAPI.send('close-overlay')
        }
      } else {
        window.momaiAPI.send('close-overlay')
      }
    }
    checkAndTriggerOverlay()
  }, [graphState])
}
