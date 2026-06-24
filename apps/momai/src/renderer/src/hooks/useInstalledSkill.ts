import { useEffect, useState } from 'react'
import { fetchExtensions } from '../services/api'
import type { Extension } from '../services/api'

export function useInstalledSkill(id: string | undefined): Extension | null {
  const [skill, setSkill] = useState<Extension | null>(null)

  useEffect(() => {
    if (!id) {
      setSkill(null)
      return
    }
    let cancelled = false
    fetchExtensions()
      .then((all) => {
        if (cancelled) return
        const found = all.find((s) => s.id === id)
        if (!found) {
          setSkill(null)
          return
        }
        // Ensure manifest is always an object so consumers (e.g. ExtensionPageRoute)
        // can safely access skill.manifest.ui without null checks.
        setSkill({ manifest: {}, ...found })
      })
      .catch(() => {
        if (!cancelled) setSkill(null)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return skill
}
