import { useState, useEffect } from 'react'

export interface PythonStatus {
  online: boolean
  detail: string
}

export function usePythonStatus() {
  const [status, setStatus] = useState<PythonStatus>({ online: true, detail: '' })

  useEffect(() => {
    const removeListener = window.electron.ipcRenderer.on(
      'python-status',
      (_event: any, payload: PythonStatus) => {
        setStatus(payload)
      }
    )
    return () => removeListener()
  }, [])

  return status
}
