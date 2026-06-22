import { useEffect, useRef } from 'react'
import { updateMemoryNote, NoteSummary } from '../../../services/api'

export interface UseAutoSaveParams {
  activeId: string | null
  title: string
  content: string
  isLoading: boolean
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  t: (key: string) => string
  setNotes: React.Dispatch<React.SetStateAction<NoteSummary[]>>
}

export function useAutoSave({
  activeId,
  title,
  content,
  isLoading,
  setIsSaving,
  setError,
  t,
  setNotes
}: UseAutoSaveParams) {
  const saveTimer = useRef<number | null>(null)
  const lastSaved = useRef({ title: '', content: '' })

  useEffect(() => {
    if (!activeId || isLoading) return
    if (title === lastSaved.current.title && content === lastSaved.current.content) return

    if (saveTimer.current) window.clearTimeout(saveTimer.current)

    const currentId = activeId
    saveTimer.current = window.setTimeout(async () => {
      try {
        setIsSaving(true)
        const updated = await updateMemoryNote(currentId, { title, content })
        if (activeId === currentId) {
          lastSaved.current = { title: updated.title, content: updated.content }
        }
        setNotes((prev) =>
          prev.map((n) =>
            n.id === updated.id
              ? { ...n, title: updated.title, updated_at: new Date().toISOString() }
              : n
          )
        )
      } catch (err) {
        setError(t('notes.errors.save'))
      } finally {
        setIsSaving(false)
      }
    }, 1000)

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [activeId, title, content, isLoading, setIsSaving, setError, t, setNotes])
}
