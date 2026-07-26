import { useState, useCallback } from 'react'
import { NoteSummary } from '../../../services/api'

export interface WikiMenuState {
  x: number
  y: number
  query: string
  pos: number
}

export function useWikiLinkAutocomplete(notes: NoteSummary[]) {
  const [wikiMenu, setWikiMenu] = useState<WikiMenuState | null>(null)

  const handleSelectWikiLink = useCallback(
    (title: string) => {
      if (!wikiMenu) return
      const note = notes.find((n) => n.title === title)
      let displayTitle = title
      if (note?.path) {
        const parts = note.path.split('/')
        const folderParts = parts[0] === 'notes' ? parts.slice(1, -1) : parts.slice(0, -1)
        if (folderParts.length > 0) {
          displayTitle = `${folderParts.join('/')}/${title}`
        }
      }
      const insertText = `${displayTitle}]]`
      setWikiMenu(null)
      return insertText
    },
    [wikiMenu, notes]
  )

  return { wikiMenu, setWikiMenu, handleSelectWikiLink }
}
