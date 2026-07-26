import { useState, useMemo, useCallback } from 'react'
import {
  listMemoryFolders,
  createMemoryFolder,
  renameMemoryFolder,
  deleteMemoryFolder
} from '../../../services/api'
import { NoteSummary } from '../../../services/api'

export interface UseFoldersReturn {
  folders: string[]
  setFolders: React.Dispatch<React.SetStateAction<string[]>>
  expandedFolders: Set<string>
  setExpandedFolders: React.Dispatch<React.SetStateAction<Set<string>>>
  isCreatingFolder: boolean
  setIsCreatingFolder: React.Dispatch<React.SetStateAction<boolean>>
  newFolderName: string
  setNewFolderName: React.Dispatch<React.SetStateAction<string>>
  dragOverFolder: string | null
  setDragOverFolder: React.Dispatch<React.SetStateAction<string | null>>
  renamingFolder: string | null
  setRenamingFolder: React.Dispatch<React.SetStateAction<string | null>>
  notesByFolder: Record<string, NoteSummary[]>
  allFoldersSorted: string[]
  filteredNotes: NoteSummary[]
  loadFolders: () => Promise<void>
  handleCreateFolder: () => Promise<void>
  toggleFolder: (folderPath: string) => void
  handleDeleteFolder: (
    folderPath: string,
    notes: NoteSummary[],
    setNotes: React.Dispatch<React.SetStateAction<NoteSummary[]>>,
    activeId: string | null,
    setActiveId: React.Dispatch<React.SetStateAction<string | null>>,
    openTabIds: string[],
    setOpenTabIds: React.Dispatch<React.SetStateAction<string[]>>,
    loadNotes: () => Promise<void>
  ) => Promise<void>
  handleRenameFolder: (
    oldPath: string,
    newPath: string,
    setNotes: React.Dispatch<React.SetStateAction<NoteSummary[]>>,
    loadNotes: () => Promise<void>,
    loadFolders: () => Promise<void>
  ) => Promise<void>
}

export function useFolders(filteredNotes: NoteSummary[]): Omit<
  UseFoldersReturn,
  'handleDeleteFolder' | 'handleRenameFolder'
> & {
  handleDeleteFolder: (
    folderPath: string,
    notes: NoteSummary[],
    setNotes: React.Dispatch<React.SetStateAction<NoteSummary[]>>,
    activeId: string | null,
    setActiveId: React.Dispatch<React.SetStateAction<string | null>>,
    openTabIds: string[],
    setOpenTabIds: React.Dispatch<React.SetStateAction<string[]>>,
    loadNotes: () => Promise<void>
  ) => Promise<void>
  handleRenameFolder: (
    oldPath: string,
    newPath: string,
    setNotes: React.Dispatch<React.SetStateAction<NoteSummary[]>>,
    loadNotes: () => Promise<void>,
    loadFolders: () => Promise<void>
  ) => Promise<void>
} {
  const [folders, setFolders] = useState<string[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root', '__memory']))
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)

  const notesByFolder = useMemo(() => {
    const map: Record<string, NoteSummary[]> = { root: [] }
    filteredNotes.forEach((note) => {
      const parts = note.path.split(/[/\\]/)
      if (parts.length <= 2) {
        map.root.push(note)
      } else {
        const startIdx = parts[0] === 'notes' ? 1 : 0
        const folderPath = parts.slice(startIdx, -1).join('/')
        if (!folderPath) {
          map.root.push(note)
        } else {
          if (!map[folderPath]) map[folderPath] = []
          map[folderPath].push(note)
        }
      }
    })
    return map
  }, [filteredNotes])

  const allFoldersSorted = useMemo(() => {
    const set = new Set(folders)
    Object.keys(notesByFolder).forEach((f) => {
      if (f !== 'root') set.add(f)
    })
    return Array.from(set).sort()
  }, [folders, notesByFolder])

  const loadFolders = useCallback(async () => {
    try {
      const data = await listMemoryFolders()
      setFolders(data)
    } catch (e) {
      console.error('Failed to load folders', e)
    }
  }, [])

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false)
      return
    }

    try {
      await createMemoryFolder(newFolderName.trim())
      setFolders((prev) => [...prev, newFolderName.trim()])
      setExpandedFolders((prev) => new Set([...prev, newFolderName.trim()]))
    } catch (e) {
      console.error('Failed to create folder', e)
    } finally {
      setIsCreatingFolder(false)
      setNewFolderName('')
    }
  }, [newFolderName])

  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }, [])

  const handleDeleteFolder = useCallback(
    async (
      folderPath: string,
      notes: NoteSummary[],
      setNotes: React.Dispatch<React.SetStateAction<NoteSummary[]>>,
      activeId: string | null,
      setActiveId: React.Dispatch<React.SetStateAction<string | null>>,
      openTabIds: string[],
      setOpenTabIds: React.Dispatch<React.SetStateAction<string[]>>,
      loadNotes: () => Promise<void>
    ) => {
      try {
        await deleteMemoryFolder(folderPath)

        const deletedPrefix = `notes/${folderPath}/`
        const deletedNoteIds = new Set(
          notes.filter((n) => n.path.replace(/\\/g, '/').startsWith(deletedPrefix)).map((n) => n.id)
        )

        setOpenTabIds((prev) => prev.filter((id) => !deletedNoteIds.has(id)))
        if (activeId && deletedNoteIds.has(activeId)) {
          setActiveId(null)
        }

        await loadNotes()
        await loadFolders()
      } catch (err) {
        console.error('Failed to delete folder', err)
      }
    },
    [loadFolders]
  )

  const handleRenameFolder = useCallback(
    async (
      oldPath: string,
      newPath: string,
      setNotes: React.Dispatch<React.SetStateAction<NoteSummary[]>>,
      loadNotes: () => Promise<void>,
      loadFolders: () => Promise<void>
    ) => {
      try {
        await renameMemoryFolder(oldPath, newPath)
        await loadNotes()
        await loadFolders()
      } catch (err) {
        console.error('Failed to rename folder', err)
      }
    },
    [loadFolders]
  )

  return {
    folders,
    setFolders,
    expandedFolders,
    setExpandedFolders,
    isCreatingFolder,
    setIsCreatingFolder,
    newFolderName,
    setNewFolderName,
    dragOverFolder,
    setDragOverFolder,
    renamingFolder,
    setRenamingFolder,
    notesByFolder,
    allFoldersSorted,
    filteredNotes,
    loadFolders,
    handleCreateFolder,
    toggleFolder,
    handleDeleteFolder,
    handleRenameFolder
  }
}
