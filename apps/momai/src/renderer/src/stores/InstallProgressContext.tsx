import React, { createContext, useContext, useState, useCallback } from 'react'
import type { InstallProgress, InstallError } from '../services/api'

interface InstallState {
  id: string | null
  name: string
  icon?: string
  progress: InstallProgress | null
  error: InstallError | null
}

interface InstallProgressContextType {
  state: InstallState
  setInstall: (id: string, name: string, icon?: string) => void
  setProgress: (p: InstallProgress) => void
  setError: (e: InstallError) => void
  clearInstall: () => void
}

const InstallProgressContext = createContext<InstallProgressContextType | null>(null)

export function InstallProgressProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InstallState>({
    id: null,
    name: '',
    progress: null,
    error: null
  })

  const setInstall = useCallback((id: string, name: string, icon?: string) => {
    setState({ id, name, icon, progress: null, error: null })
  }, [])

  const setProgress = useCallback((p: InstallProgress) => {
    setState((prev) => ({ ...prev, progress: p, error: null }))
  }, [])

  const setError = useCallback((e: InstallError) => {
    setState((prev) => ({ ...prev, error: e, progress: null }))
  }, [])

  const clearInstall = useCallback(() => {
    setState({ id: null, name: '', progress: null, error: null })
  }, [])

  return (
    <InstallProgressContext.Provider value={{ state, setInstall, setProgress, setError, clearInstall }}>
      {children}
    </InstallProgressContext.Provider>
  )
}

export function useInstallProgressContext() {
  const ctx = useContext(InstallProgressContext)
  if (!ctx) throw new Error('useInstallProgressContext must be used within InstallProgressProvider')
  return ctx
}
