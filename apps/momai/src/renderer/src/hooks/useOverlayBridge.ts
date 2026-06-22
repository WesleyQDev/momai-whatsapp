import { useEffect } from 'react'

export function useOverlayBridge(graphState: any) {
  useEffect(() => {
    const checkAndTriggerOverlay = async () => {
      if (graphState.view) {
        const state = await window.momaiAPI.getWindowState()
        if (state.minimized || !state.visible) {
          window.momaiAPI.openOverlay(graphState)
        } else {
          window.momaiAPI.closeOverlay()
        }
      } else {
        window.momaiAPI.closeOverlay()
      }
    }
    checkAndTriggerOverlay()
  }, [graphState])
}
