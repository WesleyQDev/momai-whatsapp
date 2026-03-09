import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, Decoration, MatchDecorator, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import {
  listMemoryNotes,
  getMemoryNote,
  createMemoryNote,
  updateMemoryNote,
  deleteMemoryNote,
  importMemoryNotes,
  listMemoryFolders,
  createMemoryFolder,
  renameMemoryFolder,
  deleteMemoryFolder,
  openNoteFolder,
  NoteSummary
} from '../services/api'
import {
  PencilSquareIcon,
  FolderPlusIcon,
  DocumentPlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  InboxIcon,
  PencilIcon,
  PlusIcon,
  FolderIcon,
  ArrowUpTrayIcon,
  DocumentArrowUpIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../i18n'
import ConfirmationCard from '../components/floating/ConfirmationCard'
import SlashCommandMenu from '../components/notes/SlashCommandMenu'

// --- Main Component ---

export default function NotesView() {
  const { t } = useI18n()
  const welcomeNoteTitle = t('notes.welcome.title')
  const welcomeNoteContent = t('notes.welcome.content')

  // State
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
  const [filterText, setFilterText] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [openTabIds, setOpenTabIds] = useState<string[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']))
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const isNotesUiLocked = isBootstrappingNotes || isCreatingWelcomeNote
  const folderInputRefSimple = useRef<HTMLInputElement>(null)

  // Context Menu & Renaming State
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    id: string
    type: 'note' | 'folder'
  } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Delete Confirmation State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'note' | 'folder'
    id: string
  } | null>(null)

  // Slash Command State
  const [slashMenu, setSlashMenu] = useState<{
    x: number
    y: number
    query: string
    pos: number
  } | null>(null)

  // Refs
  const lastSaved = useRef({ title: '', content: '' })
  const saveTimer = useRef<number | null>(null)
  const notesLoadRetryTimer = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const isCreatingDefaultNote = useRef(false)

  // Memoized Filtered List
  const filteredNotes = useMemo(() => {
    const query = filterText.trim().toLowerCase()
    if (!query) return notes
    return notes.filter((note) =>
      [note.title || '', note.preview || ''].some((value) => value.toLowerCase().includes(query))
    )
  }, [filterText, notes])

  // Memoized Folder Structure
  const notesByFolder = useMemo(() => {
    const map: Record<string, NoteSummary[]> = { root: [] }
    filteredNotes.forEach((note) => {
      // note.path is something like "notes/filename.md" or "notes/Folder/abc.md"
      const parts = note.path.split(/[/\\]/)
      if (parts.length <= 2) {
        map.root.push(note)
      } else {
        // Skip the first "notes" part if it exists
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

  const loadFolders = async () => {
    try {
      const data = await listMemoryFolders()
      setFolders(data)
    } catch (e) {
      console.error('Failed to load folders', e)
    }
  }

  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

  const isRetryableNotesLoadError = (err: unknown): boolean => {
    if (err instanceof TypeError) return true
    const message = err instanceof Error ? err.message : String(err)
    return /failed to fetch|networkerror|load failed|fetch/i.test(message)
  }

  const listMemoryNotesWithRetry = async (maxWaitMs = 90000): Promise<NoteSummary[]> => {
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

        // Backend can still be booting right after onboarding, so retry before surfacing an error.
        const retryDelayMs = Math.min(2500, 400 + attempt * 180)
        const retryProgress = 12 + (attempt % 8) * 2
        setNotesInitProgress(retryProgress)
        await wait(retryDelayMs)
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to list memory notes')
  }

  const loadNotes = async () => {
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
          setOpenTabIds([firstId])
          await selectNote(firstId)
        }
        setNotesInitProgress(100)
      }
      loadFolders()
    } catch (err) {
      console.error('Failed to load notes after retries', err)
      shouldKeepLoading = true

      const nextProgress = notesInitProgress >= 30 ? 14 : Math.min(30, notesInitProgress + 3)
      setNotesInitProgress(nextProgress)

      notesLoadRetryTimer.current = window.setTimeout(() => {
        void loadNotes()
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
  }

  const silentDeleteIfEmpty = async (noteId: string, noteTitle: string, noteContent: string) => {
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
  }

  const selectNote = async (noteId: string, forceNewTab = false) => {
    if (activeId === noteId && title !== '') return // Already selected

    // If we are replacing the current tab or switching away, check if the old one was empty
    if (activeId && !openTabIds.includes(noteId) && !forceNewTab) {
      silentDeleteIfEmpty(activeId, title, content)
    }

    setOpenTabIds((prev) => {
      // If it's already open, just switch to it without creating/replacing anything
      if (prev.includes(noteId)) return prev

      // If middle-click (forceNewTab) or no tabs are open, add it as a new tab
      if (forceNewTab || prev.length === 0) {
        return [...prev, noteId]
      }

      // If left-click, replace the current active tab with the new note
      return prev.map((id) => (id === activeId ? noteId : id))
    })

    setActiveId(noteId)
    setIsLoading(true)
    setError(null)
    try {
      const note = await getMemoryNote(noteId)
      setTitle(note.title)
      setContent(note.content)
      lastSaved.current = { title: note.title, content: note.content }
    } catch (err) {
      setError(t('notes.errors.open'))
    } finally {
      setIsLoading(false)
    }
  }

  const closeTab = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation()

    if (activeId === noteId) {
      silentDeleteIfEmpty(noteId, title, content)
    }

    const newTabs = openTabIds.filter((id) => id !== noteId)
    setOpenTabIds(newTabs)

    if (activeId === noteId) {
      if (newTabs.length > 0) {
        selectNote(newTabs[newTabs.length - 1])
      } else {
        setActiveId(null)
        setTitle('')
        setContent('')
      }
    }
  }

  useEffect(() => {
    void loadNotes()

    return () => {
      if (notesLoadRetryTimer.current) {
        window.clearTimeout(notesLoadRetryTimer.current)
      }
    }
  }, [])

  // Auto-Save Logic
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
  }, [activeId, title, content, isLoading])

  const handleCreateNote = async () => {
    if (isNotesUiLocked) return
    setError(null)
    setFilterText('')
    try {
      const note = await createMemoryNote(t('notes.newNoteTitleDefault'), '')
      setNotes((prev) => [note, ...prev])
      await selectNote(note.id, true)
    } catch (err) {
      setError(t('notes.errors.create'))
    }
  }

  const handleDeleteNote = (id?: string) => {
    const targetId = id || activeId
    if (!targetId) return
    setDeleteConfirmTarget({ type: 'note', id: targetId })
  }

  const handleDeleteFolder = (folderPath: string) => {
    if (!folderPath) return
    setDeleteConfirmTarget({ type: 'folder', id: folderPath })
  }

  const confirmDeleteNote = async () => {
    if (!deleteConfirmTarget) return
    const target = deleteConfirmTarget
    setDeleteConfirmTarget(null)
    setError(null)

    try {
      if (target.type === 'note') {
        await deleteMemoryNote(target.id)
        const updated = notes.filter((n) => n.id !== target.id)
        setNotes(updated)
        if (activeId === target.id) {
          const newTabs = openTabIds.filter((id) => id !== target.id)
          setOpenTabIds(newTabs)
          if (newTabs.length > 0) await selectNote(newTabs[newTabs.length - 1])
          else {
            setActiveId(null)
            setTitle('')
            setContent('')
          }
        }
      } else {
        await deleteMemoryFolder(target.id)

        // Close tabs that belong to deleted folder.
        const deletedPrefix = `notes/${target.id}/`
        const deletedNoteIds = new Set(
          notes.filter((n) => n.path.replace(/\\/g, '/').startsWith(deletedPrefix)).map((n) => n.id)
        )

        setOpenTabIds((prev) => prev.filter((id) => !deletedNoteIds.has(id)))
        if (activeId && deletedNoteIds.has(activeId)) {
          setActiveId(null)
          setTitle('')
          setContent('')
        }

        await loadNotes()
        await loadFolders()
      }
    } catch (err) {
      setError(target.type === 'folder' ? t('notes.errors.deleteFolder') : t('notes.errors.delete'))
    }
  }

  // --- Context Menu Handlers ---

  const handleContextMenu = (e: React.MouseEvent, id: string, type: 'note' | 'folder' = 'note') => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, id, type })
  }

  const handleStartRename = (
    id: string,
    currentTitle: string,
    type: 'note' | 'folder' = 'note'
  ) => {
    if (type === 'note') {
      setRenamingId(id)
    } else {
      setRenamingFolder(id)
    }
    setRenameValue(currentTitle)
    setContextMenu(null)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const handleFinishRename = async () => {
    if (renamingId) {
      if (!renameValue.trim() || renameValue === notes.find((n) => n.id === renamingId)?.title) {
        setRenamingId(null)
        return
      }

      try {
        // Optimistic update
        setNotes((prev) =>
          prev.map((n) => (n.id === renamingId ? { ...n, title: renameValue } : n))
        )
        if (activeId === renamingId) {
          setTitle(renameValue)
          lastSaved.current.title = renameValue
        }

        await updateMemoryNote(renamingId, { title: renameValue })
      } catch (err) {
        setError(t('notes.errors.save'))
      } finally {
        setRenamingId(null)
      }
    } else if (renamingFolder) {
      const oldPath = renamingFolder
      const newName = renameValue.trim()
      if (!newName || newName === oldPath.split(/[/\\]/).pop()) {
        setRenamingFolder(null)
        return
      }

      const parts = oldPath.split(/[/\\]/)
      parts[parts.length - 1] = newName
      const newPath = parts.join('/')

      try {
        await renameMemoryFolder(oldPath, newPath)
        await loadNotes()
        await loadFolders()
      } catch (err) {
        setError(t('notes.errors.renameFolder'))
      } finally {
        setRenamingFolder(null)
      }
    }
  }

  const handleKeyDownRename = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFinishRename()
    if (e.key === 'Escape') {
      setRenamingId(null)
      setRenamingFolder(null)
    }
  }

  const handleImport = async (files: FileList | null) => {
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
  }

  // --- Folder Management ---

  const handleCreateFolder = async () => {
    if (isNotesUiLocked) return
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false)
      return
    }

    try {
      await createMemoryFolder(newFolderName.trim())
      setFolders((prev) => [...prev, newFolderName.trim()])
      setExpandedFolders((prev) => new Set([...prev, newFolderName.trim()]))
    } catch (e) {
      setError(t('notes.errors.createFolder'))
    } finally {
      setIsCreatingFolder(false)
      setNewFolderName('')
    }
  }

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }

  // --- Drag and Drop ---

  const handleDragStart = (e: React.DragEvent, id: string, type: 'note' | 'folder') => {
    e.dataTransfer.setData('type', type)
    e.dataTransfer.setData('id', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetFolderPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)

    const type = e.dataTransfer.getData('type')
    const id = e.dataTransfer.getData('id')

    if (type === 'note') {
      try {
        await updateMemoryNote(id, { path: targetFolderPath === 'root' ? '' : targetFolderPath })
        await loadNotes()
      } catch (err) {
        setError(t('notes.errors.moveNote'))
      }
    }
  }

  // --- Editor Extensions & Theme ---

  const markdownHighlighting = useMemo(() => {
    const textColor = 'rgb(var(--text-primary))'
    const accentColor = 'rgb(var(--accent))'
    return HighlightStyle.define([
      { tag: tags.heading1, class: 'cm-h1' },
      { tag: tags.heading2, class: 'cm-h2' },
      { tag: tags.heading3, class: 'cm-h3' },
      { tag: tags.heading4, class: 'cm-h4' },
      { tag: tags.strong, fontWeight: '700', color: textColor },
      { tag: tags.emphasis, fontStyle: 'italic' },
      { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.6' },
      { tag: tags.quote, color: 'rgb(var(--text-muted))', fontStyle: 'italic' },
      {
        tag: tags.monospace,
        color: accentColor,
        backgroundColor: 'rgb(var(--accent) / 0.1)',
        borderRadius: '4px',
        padding: '1px 4px'
      },
      {
        tag: [tags.processingInstruction, tags.punctuation, tags.meta, tags.modifier],
        class: 'cm-md-marker'
      },
      { tag: tags.list, class: 'cm-list-marker' },
      { tag: tags.atom, class: 'cm-checkbox' },
      { tag: tags.link, textDecoration: 'underline', color: accentColor, opacity: '0.9' },
      { tag: tags.url, textDecoration: 'underline', opacity: '0.5' }
    ])
  }, [])

  const handleSelectSlashCommand = (snippet: string) => {
    if (!slashMenu || !editorViewRef.current) return

    const view = editorViewRef.current
    const { pos, query } = slashMenu

    // Remove the "/" and the query
    const transaction = view.state.update({
      changes: {
        from: pos,
        to: pos + 1 + query.length,
        insert: snippet
      },
      selection: {
        anchor: pos + snippet.length
      }
    })

    view.dispatch(transaction)
    view.focus()
    setSlashMenu(null)
  }

  const editorExtensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(markdownHighlighting),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          backgroundColor: 'transparent !important',
          height: '100%'
        },
        '&.cm-focused': {
          outline: 'none'
        },
        '.cm-scroller': {
          fontFamily: "'Inter', sans-serif",
          fontSize: '16px',
          lineHeight: '1.7',
          overflow: 'auto',
          padding: '20px 0'
        },
        '.cm-content': {
          color: 'rgb(var(--text-primary))',
          caretColor: 'rgb(var(--text-primary)) !important',
          backgroundColor: 'transparent !important',
          padding: '0 32px !important'
        },
        '.cm-line': {
          padding: '2px 0'
        },
        // MARKER HIDING: Completely hide markers on inactive lines (except lists/checkboxes)
        '.cm-line:not(.cm-activeLine) .cm-md-marker:not(.cm-list-marker):not(.cm-checkbox)': {
          display: 'none !important'
        },
        // MARKER REVEALING: Show only on active line with soft opacity
        '.cm-activeLine .cm-md-marker': {
          display: 'inline !important',
          opacity: '0.4',
          marginRight: '0.1em'
        },
        '.cm-list-marker': {
          display: 'inline !important',
          color: 'rgb(var(--text-primary))',
          fontWeight: '400',
          marginRight: '-0.2em'
        },
        '.cm-bullet-conceal': {
          color: 'transparent !important',
          display: 'inline-block',
          width: '0.8em',
          textAlign: 'center',
          position: 'relative'
        },
        '.cm-bullet-conceal::after': {
          content: '"•"',
          color: 'rgb(var(--text-primary))',
          position: 'absolute',
          left: '0',
          right: '0',
          textAlign: 'center',
          top: '-0.1em',
          fontSize: '1.2em'
        },
        '.cm-checkbox': {
          display: 'inline !important',
          color: 'rgb(var(--text-primary))',
          fontWeight: '400',
          fontFamily: 'monospace',
          marginRight: '-0.2em'
        },
        // HEADER SIZES: Force sizes with high specificity
        '.cm-h1': {
          fontSize: '1.8em !important',
          fontWeight: '800 !important',
          fontFamily: "'Outfit', sans-serif"
        },
        '.cm-h2': {
          fontSize: '1.5em !important',
          fontWeight: '700 !important',
          fontFamily: "'Outfit', sans-serif"
        },
        '.cm-h3': {
          fontSize: '1.25em !important',
          fontWeight: '700 !important',
          fontFamily: "'Outfit', sans-serif"
        },
        '.cm-h4': {
          fontSize: '1.1em !important',
          fontWeight: '600 !important',
          fontFamily: "'Outfit', sans-serif"
        },

        // ALIGNMENT FIX: Pull text back exactly one space width to align perfectly
        '.cm-line:not(.cm-activeLine) .cm-h1, .cm-line:not(.cm-activeLine) .cm-h2, .cm-line:not(.cm-activeLine) .cm-h3, .cm-line:not(.cm-activeLine) .cm-h4':
          {
            marginLeft: '-0.32em !important',
            display: 'inline-block'
          },

        // Blockquote visual cue
        '.cm-quote': {
          borderLeft: '3px solid rgb(var(--accent) / 0.3)',
          paddingLeft: '1rem',
          display: 'inline-block',
          width: '100%'
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
          backgroundColor: 'rgb(var(--accent) / 0.2) !important'
        },
        '.cm-cursor': {
          borderLeftColor: 'rgb(var(--text-primary)) !important',
          borderLeftWidth: '2px'
        },
        '.cm-activeLine': { backgroundColor: 'transparent' },
        '.cm-gutters': { display: 'none' }
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          const state = update.state
          const pos = state.selection.main.head
          const line = state.doc.lineAt(pos)
          const lineText = line.text.slice(0, pos - line.from)

          const match = lineText.match(/(?:^|\s)\/(\w*)$/)
          if (match) {
            const query = match[1]
            const slashPos = line.from + lineText.lastIndexOf('/')

            // Wait for next tick to ensure view is updated and coords are accurate
            setTimeout(() => {
              const coords = update.view.coordsAtPos(pos)
              if (coords) {
                setSlashMenu({
                  x: coords.left,
                  y: coords.bottom + 8,
                  query,
                  pos: slashPos
                })
              }
            }, 0)
          } else {
            setSlashMenu(null)
          }
        }
      }),
      ViewPlugin.fromClass(
        class {
          decorations
          constructor(view: EditorView) {
            this.decorations = this.getDecorations(view)
          }
          update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet) {
              this.decorations = this.getDecorations(update.view)
            }
          }
          getDecorations(view: EditorView) {
            const decorator = new MatchDecorator({
              regexp: /(?<=^[ \t]*)[-*+]/gm,
              decoration: Decoration.mark({ class: 'cm-bullet-conceal' })
            })
            return decorator.createDeco(view)
          }
        },
        {
          decorations: (v) => v.decorations
        }
      )
    ],
    [markdownHighlighting]
  )

  return (
    <div
      className="flex-1 h-full bg-bg text-text flex font-sans overflow-hidden transition-colors duration-300"
      onClick={() => {
        setContextMenu(null)
        setIsImportDropdownOpen(false)
      }}
    >
      {/* 1. Sidebar - Minimalist & Functional */}
      {!isSidebarCollapsed && (
        <aside className="w-60 border-r border-border/5 bg-sidebar flex flex-col shrink-0 transition-all duration-300">
          {/* Sidebar Header: Search & Toolbar */}
          <div className="p-3 space-y-2">
            <div className="relative group">
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder={t('notes.searchPlaceholder')}
                className="w-full bg-input/50 hover:bg-input border border-transparent focus:border-border/20 rounded-lg pl-9 pr-3 py-2 text-xs font-medium focus:outline-none transition-all placeholder:text-text-muted/40"
              />
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/40 group-focus-within:text-accent transition-colors" />
            </div>

            {/* Toolbar Actions */}
            {!isNotesUiLocked && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleCreateNote}
                  className="p-1.5 text-text-muted hover:text-accent hover:bg-white/5 rounded-lg transition-all"
                  title={t('notes.newNote')}
                >
                  <PencilSquareIcon className="w-5 h-5 stroke-[1.5]" />
                </button>

                <button
                  onClick={() => setIsCreatingFolder(true)}
                  className="p-1.5 text-text-muted hover:text-accent hover:bg-white/5 rounded-lg transition-all"
                  title={t('notes.newFolder')}
                >
                  <FolderPlusIcon className="w-5 h-5 stroke-[1.5]" />
                </button>

                <div className="w-px h-3.5 bg-border/10 mx-1"></div>

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsImportDropdownOpen(!isImportDropdownOpen)
                    }}
                    className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-lg transition-all"
                    title={t('notes.importFiles')}
                  >
                    <DocumentArrowUpIcon className="w-5 h-5 stroke-[1.5]" />
                  </button>

                  {isImportDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 z-30 bg-card border border-border/10 rounded-lg shadow-xl py-1 min-w-[120px] flex flex-col animate-context-menu">
                      <button
                        onClick={() => {
                          fileInputRef.current?.click()
                          setIsImportDropdownOpen(false)
                        }}
                        className="text-left px-3 py-2 text-xs text-text hover:bg-white/5 flex items-center gap-2"
                      >
                        <DocumentPlusIcon className="w-3.5 h-3.5 opacity-70" />
                        {t('notes.importFiles')}
                      </button>
                      <button
                        onClick={() => {
                          folderInputRef.current?.click()
                          setIsImportDropdownOpen(false)
                        }}
                        className="text-left px-3 py-2 text-xs text-text hover:bg-white/5 flex items-center gap-2"
                      >
                        <ArrowUpTrayIcon className="w-3.5 h-3.5 opacity-70" />
                        {t('notes.importFolder')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div
            className={`flex-1 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-0.5 transition-colors ${
              dragOverFolder === 'root' ? 'bg-accent/5' : ''
            }`}
            onClick={() => setContextMenu(null)}
            onDragOver={handleDragOver}
            onDragEnter={() => setDragOverFolder('root')}
            onDragLeave={(e) => {
              // Only clear if we are leaving to somewhere outside the sidebar
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverFolder(null)
              }
            }}
            onDrop={(e) => handleDrop(e, 'root')}
          >
            {isCreatingFolder && (
              <div className="p-1">
                <input
                  ref={folderInputRefSimple}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onBlur={handleCreateFolder}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  placeholder={t('notes.untitledFolder')}
                  className="w-full bg-input border border-accent/50 rounded-lg px-3 py-2 text-[13px] font-medium text-text outline-none mb-2"
                  autoFocus
                />
              </div>
            )}

            {isLoading && notes.length === 0 ? (
              <div className="p-4 text-center text-xs opacity-30 italic">{t('notes.loading')}</div>
            ) : (
              <div className="space-y-1">
                {/* Folders */}
                {allFoldersSorted.map((folderPath) => {
                  const isExpanded = expandedFolders.has(folderPath)
                  const folderNotes = notesByFolder[folderPath] || []
                  const folderName = folderPath.split('/').pop() || folderPath

                  return (
                    <div
                      key={folderPath}
                      onDragOver={handleDragOver}
                      onDragEnter={() => setDragOverFolder(folderPath)}
                      onDragLeave={() => setDragOverFolder(null)}
                      onDrop={(e) => handleDrop(e, folderPath)}
                      className="space-y-0.5"
                    >
                      {renamingFolder === folderPath ? (
                        <div className="px-2 py-0.5">
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={handleFinishRename}
                            onKeyDown={handleKeyDownRename}
                            className="w-full bg-input border border-accent/50 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-text outline-none mb-0.5"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleFolder(folderPath)}
                          onContextMenu={(e) => handleContextMenu(e, folderPath, 'folder')}
                          className={`w-full text-left px-2 py-1.5 rounded-lg transition-all flex items-center gap-2 group ${
                            dragOverFolder === folderPath
                              ? 'bg-accent/20 text-accent scale-[1.02]'
                              : 'text-text-muted hover:bg-white/5 hover:text-text'
                          }`}
                        >
                          <div className="w-4 flex justify-center">
                            {isExpanded ? (
                              <ChevronDownIcon className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                            ) : (
                              <ChevronRightIcon className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                            )}
                          </div>
                          <FolderIcon className="w-4 h-4 text-accent/60" />
                          <span className="text-[12.5px] font-medium truncate flex-1 leading-none">
                            {folderName}
                          </span>
                          <span className="text-[10px] opacity-30 group-hover:opacity-60">
                            {folderNotes.length}
                          </span>
                        </button>
                      )}

                      {isExpanded && (
                        <div className="ml-4 border-l border-border/10 pl-1 space-y-0.5 animate-in fade-in slide-in-from-left-1 duration-200">
                          {folderNotes.map((note) => (
                            <div
                              key={note.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, note.id, 'note')}
                              onContextMenu={(e) => handleContextMenu(e, note.id)}
                            >
                              {renamingId === note.id ? (
                                <input
                                  ref={renameInputRef}
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onBlur={handleFinishRename}
                                  onKeyDown={handleKeyDownRename}
                                  className="w-full bg-input border border-accent/50 rounded-lg px-3 py-2 text-[13px] font-medium text-text outline-none mb-0.5"
                                  autoFocus
                                />
                              ) : (
                                <button
                                  onClick={() => selectNote(note.id, false)}
                                  onAuxClick={(e) => {
                                    if (e.button === 1) selectNote(note.id, true)
                                  }}
                                  className={`w-full text-left px-3 py-2 rounded-lg transition-all group relative border border-transparent ${
                                    note.id === activeId
                                      ? 'bg-accent/10 text-accent font-semibold'
                                      : 'text-text-muted hover:bg-white/5 hover:text-text'
                                  }`}
                                >
                                  <div className="text-[13px] truncate flex items-center gap-2">
                                    <InboxIcon className="w-4 h-4 opacity-30 group-hover:opacity-60" />
                                    {note.title || t('notes.untitled')}
                                  </div>
                                  {note.id === activeId && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3/5 bg-accent rounded-r-full"></div>
                                  )}
                                </button>
                              )}
                            </div>
                          ))}
                          {folderNotes.length === 0 && (
                            <div className="px-3 py-2 text-[10px] text-text-muted/40 italic">
                              Vazio
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Root Notes */}
                {(notesByFolder.root || []).map((note) => (
                  <div
                    key={note.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, note.id, 'note')}
                    onContextMenu={(e) => handleContextMenu(e, note.id)}
                  >
                    {renamingId === note.id ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={handleKeyDownRename}
                        className="w-full bg-input border border-accent/50 rounded-lg px-2 py-2 text-[13px] font-medium text-text outline-none mb-0.5"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => selectNote(note.id, false)}
                        onAuxClick={(e) => {
                          if (e.button === 1) selectNote(note.id, true)
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-all group relative border border-transparent ${
                          note.id === activeId
                            ? 'bg-accent/10 text-accent font-semibold'
                            : 'text-text-muted hover:bg-white/5 hover:text-text'
                        }`}
                      >
                        <div className="text-[13px] truncate flex items-center gap-2">
                          <InboxIcon className="w-4 h-4 opacity-30 group-hover:opacity-60" />
                          {note.title || t('notes.untitled')}
                        </div>
                        {note.id === activeId && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3/5 bg-accent rounded-r-full"></div>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Context Menu Component */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border/10 rounded-lg shadow-xl py-1 min-w-[140px] flex flex-col animate-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() =>
              handleStartRename(
                contextMenu.id,
                contextMenu.type === 'note'
                  ? notes.find((n) => n.id === contextMenu.id)?.title || ''
                  : contextMenu.id.split(/[/\\]/).pop() || '',
                contextMenu.type
              )
            }
            className="text-left px-3 py-1.5 text-xs text-text/80 hover:bg-white/5 hover:text-text flex items-center gap-2 transition-all"
          >
            <PencilIcon className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
            Renomear
          </button>

          {contextMenu.type === 'note' && (
            <button
              onClick={() => {
                openNoteFolder(contextMenu.id)
                setContextMenu(null)
              }}
              className="text-left px-3 py-1.5 text-xs text-text/80 hover:bg-white/5 hover:text-text flex items-center gap-2 transition-all"
            >
              <FolderIcon className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
              Abrir local do arquivo
            </button>
          )}

          <div className="h-px bg-border/5 my-1 mx-2"></div>

          <button
            onClick={() => {
              if (contextMenu.type === 'note') handleDeleteNote(contextMenu.id)
              else handleDeleteFolder(contextMenu.id)
              setContextMenu(null)
            }}
            className="text-left px-3 py-1.5 text-xs text-red-500/70 hover:bg-red-500/10 hover:text-red-500 flex items-center gap-2 transition-all"
          >
            <TrashIcon className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
            Excluir
          </button>
        </div>
      )}

      {/* 2. Main Editor Content */}
      <main
        className="flex-1 flex flex-col bg-card/40 relative transition-colors duration-300"
        onClick={() => setContextMenu(null)}
      >
        <header className="h-11 border-b border-border/10 flex items-center px-2 justify-between gap-4 bg-bg/80 backdrop-blur-md z-20">
          <div className="flex items-center gap-1 flex-1 overflow-hidden h-full pt-1.5">
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className={`p-1.5 transition-all rounded-md ${isSidebarCollapsed ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-text hover:bg-white/5'}`}
              title="Toggle Sidebar"
            >
              <ArrowsPointingOutIcon className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-border/20 mx-1"></div>

            {/* Tabs List */}
            <div className="flex items-end gap-1 h-full overflow-x-auto no-scrollbar scroll-smooth">
              {openTabIds.map((tabId) => {
                const note = notes.find((n) => n.id === tabId)
                if (!note) return null
                const isActive = activeId === tabId

                return (
                  <div
                    key={tabId}
                    onClick={() => selectNote(tabId)}
                    className={`group flex items-center gap-2 px-3 h-full min-w-[100px] max-w-[180px] cursor-pointer transition-all border-x border-t border-transparent text-[11px] font-medium tracking-tight relative rounded-t-lg ${
                      isActive
                        ? 'bg-card/60 text-accent border-border/10'
                        : 'text-text-muted/60 hover:text-text hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate flex-1">{note.title || t('notes.untitled')}</span>
                    <button
                      onClick={(e) => closeTab(e, tabId)}
                      className={`p-0.5 rounded-md hover:bg-white/10 transition-all ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <PlusIcon className="w-3 h-3 rotate-45" />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Add Tab Button */}
            {!isNotesUiLocked && (
              <button
                onClick={handleCreateNote}
                className="p-1 text-text-muted/40 hover:text-text hover:bg-white/10 rounded-md transition-all ml-1 mb-1"
                title={t('notes.newNote')}
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 pr-4">
            {/* Breadcrumb style route on the right */}
            {activeId && (
              <div className="hidden lg:flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-text-muted/30">
                <span>Notes</span>
                <ChevronRightIcon className="w-2.5 h-2.5" />
                <span className="text-text-muted/50">{title || 'Untitled'}</span>
              </div>
            )}

            {/* Saving Indicator */}
            {activeId && (
              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all duration-500 ${isSaving ? 'bg-accent/10 text-accent' : 'bg-transparent text-text-muted/10'}`}
              >
                <div
                  className={`w-1 h-1 rounded-full ${isSaving ? 'bg-accent animate-pulse' : 'bg-current'}`}
                ></div>
                <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">
                  {isSaving ? t('notes.syncing') : 'Saved'}
                </span>
              </div>
            )}

            {activeId && (
              <button
                onClick={() => handleDeleteNote(activeId)}
                className="p-1.5 text-text-muted/30 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                title={t('notes.deleteTooltip')}
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>

        {/* Error Notification */}
        {error && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2 rounded-lg text-xs font-medium backdrop-blur-md shadow-xl">
            {error}
          </div>
        )}

        {isNotesUiLocked && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 w-[min(520px,92%)] bg-card/95 border border-border/20 rounded-xl px-4 py-3 backdrop-blur-md shadow-xl">
            <div className="text-[11px] font-semibold tracking-wide text-text-muted uppercase">
              <span>Carregando notas</span>
            </div>
            <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent/90"
                style={{ animation: 'notes-indeterminate 1.25s ease-in-out infinite' }}
              />
            </div>
            <p className="mt-2 text-[12px] text-text-muted/70">
              Aguarde um instante enquanto sincronizamos suas notas e preparamos a nota de
              boas-vindas.
            </p>
          </div>
        )}

        <style>
          {`@keyframes notes-indeterminate {
              0% { transform: translateX(-130%); }
              100% { transform: translateX(330%); }
            }`}
        </style>

        <div className="flex-1 relative overflow-hidden flex mt-4 h-full">
          {activeId ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar w-full">
              <div className="max-w-5xl py-4 px-8 flex flex-col min-h-full">
                {slashMenu && (
                  <SlashCommandMenu
                    x={slashMenu.x}
                    y={slashMenu.y}
                    query={slashMenu.query}
                    onSelect={handleSelectSlashCommand}
                    onClose={() => setSlashMenu(null)}
                  />
                )}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('notes.untitled')}
                  className="w-full bg-transparent text-4xl font-bold text-text mb-4 outline-none placeholder:text-text-muted/20 border-none px-8"
                />
                <div className="px-8 mb-4 shrink-0">
                  <div className="h-px bg-border/20 w-full"></div>
                </div>
                <CodeMirror
                  value={content}
                  onChange={(value) => setContent(value)}
                  extensions={editorExtensions}
                  basicSetup={{
                    lineNumbers: false,
                    foldGutter: false,
                    highlightActiveLine: true,
                    highlightSelectionMatches: false,
                    bracketMatching: false,
                    closeBrackets: false
                  }}
                  onCreateEditor={(view) => {
                    editorViewRef.current = view
                  }}
                  className="w-full bg-transparent"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-10">
              <InboxIcon className="w-20 h-20 mb-4" />
              <span className="text-[10px] font-black uppercase tracking-[0.5em]">
                {t('notes.emptySelect')}
              </span>
            </div>
          )}
        </div>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleImport(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleImport(e.target.files)}
        {...({ webkitdirectory: '' } as any)}
      />

      {deleteConfirmTarget && (
        <ConfirmationCard
          title={deleteConfirmTarget.type === 'folder' ? 'Excluir pasta' : t('notes.confirmDelete')}
          message={
            deleteConfirmTarget.type === 'folder'
              ? 'Tem certeza que deseja excluir esta pasta e todas as notas dentro dela? Esta ação não pode ser desfeita.'
              : t('notes.confirmDeleteMessage') ||
                'Tem certeza que deseja excluir esta nota? Esta ação não pode ser desfeita.'
          }
          options={['Confirmar', 'Cancelar']}
          onSelect={(opt) =>
            opt === 'Confirmar' ? confirmDeleteNote() : setDeleteConfirmTarget(null)
          }
          onCancel={() => setDeleteConfirmTarget(null)}
        />
      )}
    </div>
  )
}
