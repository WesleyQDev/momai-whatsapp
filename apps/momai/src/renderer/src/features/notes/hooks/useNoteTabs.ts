import { useState, useCallback } from 'react'
import { NoteSummary } from '../../../services/api'

export interface UseNoteTabsReturn {
  openTabIds: string[]
  setOpenTabIds: React.Dispatch<React.SetStateAction<string[]>>
  activeId: string | null
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>
  openNote: (
    noteId: string,
    forceNewTab: boolean,
    notes: NoteSummary[],
    activeId: string | null,
    openTabIds: string[]
  ) => string[]
  closeTab: (
    noteId: string,
    activeId: string | null,
    openTabIds: string[],
    setOpenTabIds: React.Dispatch<React.SetStateAction<string[]>>,
    setActiveId: React.Dispatch<React.SetStateAction<string | null>>,
    selectNote: (noteId: string) => Promise<void>
  ) => void
}

export function useNoteTabs(): UseNoteTabsReturn {
  const [openTabIds, setOpenTabIds] = useState<string[]>([])

  const openNote = useCallback(
    (
      noteId: string,
      forceNewTab: boolean,
      notes: NoteSummary[],
      activeId: string | null,
      currentOpenTabIds: string[]
    ): string[] => {
      if (activeId === noteId && !forceNewTab) return currentOpenTabIds

      if (currentOpenTabIds.includes(noteId)) return currentOpenTabIds

      if (forceNewTab || currentOpenTabIds.length === 0) {
        return [...currentOpenTabIds, noteId]
      }

      return currentOpenTabIds.map((id) => (id === activeId ? noteId : id))
    },
    []
  )

  const closeTab = useCallback(
    (
      noteId: string,
      activeId: string | null,
      openTabIds: string[],
      setOpenTabIds: React.Dispatch<React.SetStateAction<string[]>>,
      setActiveId: React.Dispatch<React.SetStateAction<string | null>>,
      selectNote: (noteId: string) => Promise<void>
    ) => {
      const newTabs = openTabIds.filter((id) => id !== noteId)
      setOpenTabIds(newTabs)

      if (activeId === noteId) {
        if (newTabs.length > 0) {
          selectNote(newTabs[newTabs.length - 1])
        } else {
          setActiveId(null)
        }
      }
    },
    []
  )

  return {
    openTabIds,
    setOpenTabIds,
    activeId: null, // This will be managed by useNotes
    setActiveId: () => {}, // This will be managed by useNotes
    openNote,
    closeTab
  }
}
