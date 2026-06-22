import { useState, useEffect } from 'react'

export interface PythonStatus {
  online: boolean
  detail: string
}

export function usePythonStatus() {
  const [status, setStatus] = useState<PythonStatus>({ online: true, detail: '' })

  useEffect(() => {
    const removeListener = window.momaiAPI.onPythonStatus((payload) => {
      setStatus(payload)
    })
    return () => removeListener()
  }, [])

  return status
}
