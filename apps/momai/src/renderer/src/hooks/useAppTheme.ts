import { useState, useEffect } from 'react'

export function useAppTheme() {
  const [isCompact, setIsCompact] = useState(window.innerWidth < 850)

  useEffect(() => {
    const savedTheme = localStorage.getItem('momai_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)

    const handleResize = () => setIsCompact(window.innerWidth < 850)
    window.addEventListener('resize', handleResize)

    const handleSetTheme = (e: any) => {
      const theme = e.detail?.theme
      if (theme === 'dark' || theme === 'light') {
        localStorage.setItem('momai_theme', theme)
        document.documentElement.setAttribute('data-theme', theme)
      }
    }
    window.addEventListener('momai_set_theme', handleSetTheme)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('momai_set_theme', handleSetTheme)
    }
  }, [])

  return { isCompact }
}
