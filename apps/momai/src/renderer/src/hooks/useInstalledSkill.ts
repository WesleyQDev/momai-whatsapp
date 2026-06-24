import { useEffect, useState } from 'react'
import { fetchExtensions } from '../services/api'
import type { Extension } from '../services/api'

// Module-level cache: persists across mount/unmount cycles so navigating
// away from a skill page and back does not re-fetch or re-import the bundle.
const skillCache = new Map<string, Extension>()

export function useInstalledSkill(id: string | undefined): Extension | null {
  const [skill, setSkill] = useState<Extension | null>(() => {
    return id ? skillCache.get(id) ?? null : null
  })

  useEffect(() => {
    if (!id) {
      setSkill(null)
      return
    }
    const cached = skillCache.get(id)
    if (cached) {
      setSkill(cached)
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
        const full = { manifest: {}, ...found }
        skillCache.set(id, full)
        setSkill(full)
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
