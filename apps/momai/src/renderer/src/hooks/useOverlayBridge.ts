import { useEffect } from 'react'

export function useOverlayBridge(graphState: any) {
  useEffect(() => {
    const checkAndTriggerOverlay = async () => {
      if (graphState.view) {
        const state = await window.electron.ipcRenderer.invoke('get-window-state')
        if (state.minimized || !state.visible) {
          window.electron.ipcRenderer.send('open-overlay', graphState)
        } else {
          window.electron.ipcRenderer.send('close-overlay')
        }
      } else {
        window.electron.ipcRenderer.send('close-overlay')
      }
    }
    checkAndTriggerOverlay()
  }, [graphState])
}
