import { useState, useMemo } from 'react'
import { NoteSummary } from '../../../services/api'

export interface UseNoteSearchReturn {
  filterText: string
  setFilterText: React.Dispatch<React.SetStateAction<string>>
  filteredNotes: NoteSummary[]
}

export function useNoteSearch(notes: NoteSummary[]): UseNoteSearchReturn {
  const [filterText, setFilterText] = useState('')

  const filteredNotes = useMemo(() => {
    const query = filterText.trim().toLowerCase()
    if (!query) return notes
    return notes.filter((note) =>
      [note.title || '', note.preview || ''].some((value) => value.toLowerCase().includes(query))
    )
  }, [filterText, notes])

  return {
    filterText,
    setFilterText,
    filteredNotes
  }
}
