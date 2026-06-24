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
        setSkill(found ? { manifest: {}, ...found } : null)
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
