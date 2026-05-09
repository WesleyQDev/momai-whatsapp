import { useState, useEffect } from 'react'

export function useWindowMaximized(): boolean {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Check initial state
    // @ts-ignore
    const api = window.api
    // @ts-ignore
    api
      ?.isWindowMaximized?.()
      .then((maximized: boolean) => setIsMaximized(maximized))
      .catch(() => {})

    // Listen for changes
    // @ts-ignore
    const unsubscribe = api?.onWindowStateChanged?.((state: { maximized: boolean }) => {
      setIsMaximized(state.maximized)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  return isMaximized
}
