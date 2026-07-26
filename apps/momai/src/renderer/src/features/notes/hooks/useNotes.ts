import { useState, useRef, useCallback, useEffect } from 'react'
import {
  listMemoryNotes,
  getMemoryNote,
  createMemoryNote,
  updateMemoryNote,
  deleteMemoryNote,
  importMemoryNotes,
  NoteSummary
} from '../../../services/api'
import { isRetryableNotesLoadError, wait } from '../utils/note-helpers'
import { useI18n } from '../../../i18n'

export interface UseNotesReturn {
  notes: NoteSummary[]
  setNotes: React.Dispatch<React.SetStateAction<NoteSummary[]>>
  activeId: string | null
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>
  title: string
  setTitle: React.Dispatch<React.SetStateAction<string>>
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  isLoading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  isBootstrappingNotes: boolean
  setIsBootstrappingNotes: React.Dispatch<React.SetStateAction<boolean>>
  notesInitProgress: number
  setNotesInitProgress: React.Dispatch<React.SetStateAction<number>>
  isCreatingWelcomeNote: boolean
  setIsCreatingWelcomeNote: React.Dispatch<React.SetStateAction<boolean>>
  isSaving: boolean
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>
  lastSaved: React.MutableRefObject<{ title: string; content: string }>
  saveTimer: React.MutableRefObject<number | null>
  notesLoadRetryTimer: React.MutableRefObject<number | null>
  isNotesUiLocked: boolean
  isCreatingDefaultNote: React.MutableRefObject<boolean>
  loadNotes: () => Promise<void>
  selectNote: (noteId: string, forceNewTab?: boolean, selectTitleOnOpen?: boolean) => Promise<void>
  handleCreateNote: (folderPath?: string) => Promise<void>
  handleDeleteNote: (id?: string) => void
  confirmDeleteNote: (targetId: string) => Promise<void>
  handleImport: (files: FileList | null) => Promise<void>
  silentDeleteIfEmpty: (noteId: string, noteTitle: string, noteContent: string) => Promise<void>
}

export function useNotes(): UseNotesReturn {
  const { t } = useI18n()
  const welcomeNoteTitle = t('notes.welcome.title')
  const welcomeNoteContent = t('notes.welcome.content')

  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isBootstrappingNotes, setIsBootstrappingNotes] = useState(true)
  const [notesInitProgress, setNotesInitProgress] = useState(0)
  const [isCreatingWelcomeNote, setIsCreatingWelcomeNote] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lastSaved = useRef({ title: '', content: '' })
  const saveTimer = useRef<number | null>(null)
  const notesLoadRetryTimer = useRef<number | null>(null)
  const isCreatingDefaultNote = useRef(false)
  const loadNotesRef = useRef<(() => Promise<void>) | null>(null)

  const isNotesUiLocked = isBootstrappingNotes || isCreatingWelcomeNote

  const listMemoryNotesWithRetry = useCallback(
    async (maxWaitMs = 90000): Promise<NoteSummary[]> => {
      const start = Date.now()
      let attempt = 0
      let lastError: unknown = null

      while (Date.now() - start < maxWaitMs) {
        attempt += 1
        try {
          return await listMemoryNotes()
        } catch (err) {
          lastError = err
          if (!isRetryableNotesLoadError(err)) {
            throw err
          }

          const retryDelayMs = Math.min(2500, 400 + attempt * 180)
          const retryProgress = 12 + (attempt % 8) * 2
          setNotesInitProgress(retryProgress)
          await wait(retryDelayMs)
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Failed to list memory notes')
    },
    []
  )

  const selectNote = useCallback(
    async (noteId: string, forceNewTab = false, selectTitleOnOpen = false) => {
      if (selectTitleOnOpen) {
        // This will be handled by the component using a ref
      }
      if (activeId === noteId && title !== '') return

      setActiveId(noteId)
      setIsLoading(true)
      setError(null)
      try {
        const note = await getMemoryNote(noteId)
        setTitle(note.title)
        setContent(note.content.replace(/\\n/g, '\n'))
        lastSaved.current = { title: note.title, content: note.content.replace(/\\n/g, '\n') }
      } catch (err) {
        setError(t('notes.errors.open'))
      } finally {
        setIsLoading(false)
      }
    },
    [activeId, title, t]
  )

  const loadNotes = useCallback(async () => {
    if (notesLoadRetryTimer.current) {
      window.clearTimeout(notesLoadRetryTimer.current)
      notesLoadRetryTimer.current = null
    }

    let shouldKeepLoading = false
    setIsBootstrappingNotes(true)
    setNotesInitProgress(10)
    setIsLoading(true)
    setError(null)
    try {
      const data = await listMemoryNotesWithRetry()
      setNotesInitProgress(35)

      const hasWelcomeNote = data.some(
        (n) => n.title === welcomeNoteTitle || n.title === 'Bem-vindo ao Sistema de Notas'
      )

      if (
        data.length === 0 &&
        !hasWelcomeNote &&
        !localStorage.getItem('momai_default_note_created') &&
        !isCreatingDefaultNote.current
      ) {
        isCreatingDefaultNote.current = true
        setIsCreatingWelcomeNote(true)
        setNotesInitProgress(55)
        const defaultTitle = welcomeNoteTitle
        const defaultContent = welcomeNoteContent

        try {
          const newNote = await createMemoryNote(defaultTitle, defaultContent)
          setNotesInitProgress(80)
          localStorage.setItem('momai_default_note_created', 'true')
          setNotes([newNote])
          await selectNote(newNote.id)
          setNotesInitProgress(100)
        } catch (e) {
          console.error('Failed to create default note', e)
          setNotes([])
        } finally {
          isCreatingDefaultNote.current = false
          setIsCreatingWelcomeNote(false)
        }
      } else {
        setNotesInitProgress(65)
        setNotes(data)
        if (!activeId && data.length > 0) {
          const firstId = data[0].id
          await selectNote(firstId)
        }
        setNotesInitProgress(100)
      }
    } catch (err) {
      console.error('Failed to load notes after retries', err)
      shouldKeepLoading = true

      const nextProgress = notesInitProgress >= 30 ? 14 : Math.min(30, notesInitProgress + 3)
      setNotesInitProgress(nextProgress)

      notesLoadRetryTimer.current = window.setTimeout(() => {
        void loadNotesRef.current?.()
      }, 1800)
    } finally {
      if (shouldKeepLoading) {
        setIsLoading(true)
        setIsBootstrappingNotes(true)
      } else {
        setIsLoading(false)
        setIsBootstrappingNotes(false)
      }
    }
  }, [
    activeId,
    notesInitProgress,
    listMemoryNotesWithRetry,
    selectNote,
    welcomeNoteTitle,
    welcomeNoteContent
  ])

  useEffect(() => {
    loadNotesRef.current = loadNotes
  }, [loadNotes])

  const silentDeleteIfEmpty = useCallback(
    async (noteId: string, noteTitle: string, noteContent: string) => {
      const isDefaultTitle = noteTitle === t('notes.newNoteTitleDefault') || !noteTitle.trim()
      const isEmptyContent = !noteContent.trim()

      if (isDefaultTitle && isEmptyContent) {
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        try {
          await deleteMemoryNote(noteId)
          setNotes((prev) => prev.filter((n) => n.id !== noteId))
        } catch (e) {
          // Silently ignore errors for auto-cleanup
        }
      }
    },
    [t, saveTimer]
  )

  const handleCreateNote = useCallback(
    async (folderPath?: string) => {
      if (isNotesUiLocked) return
      setError(null)
      setNotesInitProgress(0)
      try {
        const note = await createMemoryNote(t('notes.newNoteTitleDefault'), '', folderPath)
        setNotes((prev) => [note, ...prev])
        await selectNote(note.id, true, true)
      } catch (err) {
        setError(t('notes.errors.create'))
      }
    },
    [isNotesUiLocked, t, selectNote]
  )

  const handleDeleteNote = useCallback((id?: string) => {
    // This just sets up the confirmation - handled by parent
  }, [])

  const confirmDeleteNote = useCallback(
    async (targetId: string) => {
      try {
        await deleteMemoryNote(targetId)
        const updated = notes.filter((n) => n.id !== targetId)
        setNotes(updated)
        if (activeId === targetId) {
          setActiveId(null)
          setTitle('')
          setContent('')
        }
      } catch (err) {
        setError(t('notes.errors.delete'))
      }
    },
    [activeId, notes, t]
  )

  const handleImport = useCallback(
    async (files: FileList | null) => {
      if (isNotesUiLocked) return
      if (!files || files.length === 0) return
      setError(null)
      try {
        const payload = await Promise.all(
          Array.from(files)
            .filter((file) => file.name.toLowerCase().endsWith('.md'))
            .map(async (file) => ({
              name: file.webkitRelativePath || file.name,
              content: await file.text()
            }))
        )
        if (payload.length === 0) return
        await importMemoryNotes(payload)
        await loadNotes()
      } catch (err) {
        setError(t('notes.errors.import'))
      }
    },
    [isNotesUiLocked, t, loadNotes]
  )

  useEffect(() => {
    void loadNotes()

    return () => {
      if (notesLoadRetryTimer.current) {
        window.clearTimeout(notesLoadRetryTimer.current)
      }
    }
  }, [])

  return {
    notes,
    setNotes,
    activeId,
    setActiveId,
    title,
    setTitle,
    content,
    setContent,
    isLoading,
    setIsLoading,
    isBootstrappingNotes,
    setIsBootstrappingNotes,
    notesInitProgress,
    setNotesInitProgress,
    isCreatingWelcomeNote,
    setIsCreatingWelcomeNote,
    isSaving,
    setIsSaving,
    error,
    setError,
    lastSaved,
    saveTimer,
    notesLoadRetryTimer,
    isNotesUiLocked,
    isCreatingDefaultNote,
    loadNotes,
    selectNote,
    handleCreateNote,
    handleDeleteNote,
    confirmDeleteNote,
    handleImport,
    silentDeleteIfEmpty
  }
}
