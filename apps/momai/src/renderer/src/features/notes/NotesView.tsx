import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Pencil,
  Folder
} from 'lucide-react'
import { useI18n } from '../../i18n'
import ConfirmationCard from '../../components/floating/ConfirmationCard'
import SlashCommandMenu from '../../components/notes/SlashCommandMenu'
import { useNotes } from './hooks/useNotes'
import { useFolders } from './hooks/useFolders'
import { useNoteSearch } from './hooks/useNoteSearch'
import { useAutoSave } from './hooks/useAutoSave'
import { useEditorExtensions, SlashMenuState } from './hooks/useEditorExtensions'
import NoteSidebar from './components/NoteSidebar'
import NoteEditor from './components/NoteEditor'
import NoteToolbar from './components/NoteToolbar'
import NoteGraphView from './components/NoteGraphView'
import { NoteSummary } from '../../services/api'

export default function NotesView() {
  const { t } = useI18n()

  // Core notes hook
  const {
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
    isCreatingWelcomeNote,
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
    confirmDeleteNote: confirmDeleteNoteNote,
    handleImport,
    silentDeleteIfEmpty
  } = useNotes()

  // Search hook
  const { filterText, setFilterText, filteredNotes } = useNoteSearch(notes)

  // Folders hook
  const {
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
    handleCreateFolder: createFolder,
    toggleFolder,
    handleDeleteFolder,
    handleRenameFolder
  } = useFolders(filteredNotes)

  // Auto-save hook
  const { setupAutoSave } = useAutoSave()

  // Editor extensions hook
  const { editorViewRef, slashMenu, setSlashMenu, editorExtensions, handleSelectSlashCommand } =
    useEditorExtensions()

  // Local state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false)
  const [openTabIds, setOpenTabIds] = useState<string[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'note' | 'folder'
    id: string
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    id: string
    type: 'note' | 'folder'
  } | null>(null)
  const [showGraph, setShowGraph] = useState(false)

  // Refs
  const renameInputRef = useRef<HTMLInputElement>(null)
  const folderInputRefSimple = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const shouldSelectTitleRef = useRef(false)

  // Setup auto-save
  setupAutoSave(activeId, title, content, isLoading, setIsSaving, setError, t, notes, setNotes)

  // Focus and select title
  const focusAndSelectTitle = () => {
    const input = titleInputRef.current
    if (!input) return
    input.focus()
    input.select()
  }

  useEffect(() => {
    if (!shouldSelectTitleRef.current || !activeId) return

    const raf = window.requestAnimationFrame(() => {
      focusAndSelectTitle()
      shouldSelectTitleRef.current = false
    })

    return () => window.cancelAnimationFrame(raf)
  }, [activeId, title])

  // Select note wrapper
  const handleSelectNote = useCallback(
    async (noteId: string, forceNewTab = false, selectTitleOnOpen = false) => {
      if (selectTitleOnOpen) shouldSelectTitleRef.current = true
      if (activeId === noteId && title !== '') return

      if (activeId && !openTabIds.includes(noteId) && !forceNewTab) {
        silentDeleteIfEmpty(activeId, title, content)
      }

      setOpenTabIds((prev) => {
        if (prev.includes(noteId)) return prev
        if (forceNewTab || prev.length === 0) {
          return [...prev, noteId]
        }
        return prev.map((id) => (id === activeId ? noteId : id))
      })

      await selectNote(noteId, forceNewTab, selectTitleOnOpen)
    },
    [activeId, title, content, openTabIds, selectNote, silentDeleteIfEmpty]
  )

  // Close tab
  const handleCloseTab = useCallback(
    (e: React.MouseEvent, noteId: string) => {
      e.stopPropagation()

      if (activeId === noteId) {
        silentDeleteIfEmpty(noteId, title, content)
      }

      const newTabs = openTabIds.filter((id) => id !== noteId)
      setOpenTabIds(newTabs)

      if (activeId === noteId) {
        if (newTabs.length > 0) {
          handleSelectNote(newTabs[newTabs.length - 1], false, false)
        } else {
          setActiveId(null)
          setTitle('')
          setContent('')
        }
      }
    },
    [
      activeId,
      title,
      content,
      openTabIds,
      handleSelectNote,
      silentDeleteIfEmpty,
      setActiveId,
      setTitle,
      setContent
    ]
  )

  // Context menu handlers
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
        setNotes((prev) =>
          prev.map((n) => (n.id === renamingId ? { ...n, title: renameValue } : n))
        )
        if (activeId === renamingId) {
          setTitle(renameValue)
          lastSaved.current.title = renameValue
        }

        await window.api.notes.update(renamingId, { title: renameValue })
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

      await handleRenameFolder(oldPath, newPath, setNotes, loadNotes, () => {
        const loadFolders = async () => {
          try {
            const data = await window.api.notes.listFolders()
            setFolders(data)
          } catch (e) {
            console.error('Failed to load folders', e)
          }
        }
        return loadFolders()
      })
      setRenamingFolder(null)
    }
  }

  const handleKeyDownRename = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFinishRename()
    if (e.key === 'Escape') {
      setRenamingId(null)
      setRenamingFolder(null)
    }
  }

  // Delete handlers
  const handleDeleteNoteWrapper = (id?: string) => {
    const targetId = id || activeId
    if (!targetId) return
    setDeleteConfirmTarget({ type: 'note', id: targetId })
  }

  const handleDeleteFolderWrapper = (folderPath: string) => {
    if (!folderPath) return
    setDeleteConfirmTarget({ type: 'folder', id: folderPath })
  }

  const confirmDelete = async () => {
    if (!deleteConfirmTarget) return
    const target = deleteConfirmTarget
    setDeleteConfirmTarget(null)
    setError(null)

    try {
      if (target.type === 'note') {
        await confirmDeleteNoteNote(target.id)
        if (activeId === target.id) {
          const newTabs = openTabIds.filter((id) => id !== target.id)
          setOpenTabIds(newTabs)
          if (newTabs.length > 0) await handleSelectNote(newTabs[newTabs.length - 1], false, false)
          else {
            setActiveId(null)
            setTitle('')
            setContent('')
          }
        }
      } else {
        await handleDeleteFolder(
          target.id,
          notes,
          setNotes,
          activeId,
          setActiveId,
          openTabIds,
          setOpenTabIds,
          loadNotes
        )
      }
    } catch (err) {
      setError(target.type === 'folder' ? t('notes.errors.deleteFolder') : t('notes.errors.delete'))
    }
  }

  // Drag and drop handlers
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
        await window.api.notes.update(id, {
          path: targetFolderPath === 'root' ? '' : targetFolderPath
        })
        await loadNotes()
      } catch (err) {
        setError(t('notes.errors.moveNote'))
      }
    }
  }

  // Import handlers
  const handleImportFiles = () => {
    fileInputRef.current?.click()
  }

  const handleImportFolder = () => {
    folderInputRef.current?.click()
  }

  // Root notes (notes not in any folder)
  const rootNotes = notesByFolder.root || []

  return (
    <div
      className="flex-1 h-full bg-bg text-text flex font-sans overflow-hidden transition-colors duration-300"
      onClick={() => {
        setContextMenu(null)
        setIsImportDropdownOpen(false)
      }}
    >
      {/* Sidebar */}
      <NoteSidebar
        isCollapsed={isSidebarCollapsed}
        isNotesUiLocked={isNotesUiLocked}
        filterText={filterText}
        onFilterChange={setFilterText}
        folders={allFoldersSorted}
        notesByFolder={notesByFolder}
        expandedFolders={expandedFolders}
        dragOverFolder={dragOverFolder}
        renamingFolder={renamingFolder}
        renameValue={renameValue}
        renameInputRef={renameInputRef}
        activeId={activeId}
        isCreatingFolder={isCreatingFolder}
        newFolderName={newFolderName}
        folderInputRefSimple={folderInputRefSimple}
        isImportDropdownOpen={isImportDropdownOpen}
        onToggleFolder={toggleFolder}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDragEnter={(folderPath) => setDragOverFolder(folderPath)}
        onDragLeave={() => setDragOverFolder(null)}
        onDrop={handleDrop}
        onRenameChange={setRenameValue}
        onRenameBlur={handleFinishRename}
        onRenameKeyDown={handleKeyDownRename}
        onSelectNote={handleSelectNote}
        onContextMenuNote={(e, id) => handleContextMenu(e, id, 'note')}
        onDragStartNote={(e, id) => handleDragStart(e, id, 'note')}
        onCreateNote={handleCreateNote}
        onCreateFolder={() => setIsCreatingFolder(true)}
        onFolderNameChange={setNewFolderName}
        onImportDropdownToggle={() => setIsImportDropdownOpen(!isImportDropdownOpen)}
        onImportFiles={handleImportFiles}
        onImportFolder={handleImportFolder}
        onCloseImportDropdown={() => setIsImportDropdownOpen(false)}
        rootNotes={rootNotes}
        isLoading={isLoading}
        notes={notes}
      />

      {/* Context Menu */}
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
            <Pencil className="w-3.5 h-3.5 opacity-40" />
            Renomear
          </button>

          {contextMenu.type === 'note' && (
            <button
              onClick={() => {
                window.api.notes.openFolder(contextMenu.id)
                setContextMenu(null)
              }}
              className="text-left px-3 py-1.5 text-xs text-text/80 hover:bg-white/5 hover:text-text flex items-center gap-2 transition-all"
            >
              <Folder className="w-3.5 h-3.5 opacity-40" />
              Abrir local do arquivo
            </button>
          )}

          <div className="h-px bg-border/5 my-1 mx-2"></div>

          <button
            onClick={() => {
              if (contextMenu.type === 'note') handleDeleteNoteWrapper(contextMenu.id)
              else handleDeleteFolderWrapper(contextMenu.id)
              setContextMenu(null)
            }}
            className="text-left px-3 py-1.5 text-xs text-red-500/70 hover:bg-red-500/10 hover:text-red-500 flex items-center gap-2 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5 opacity-40" />
            Excluir
          </button>
        </div>
      )}

      {/* Main Editor Content */}
      <main
        className="flex-1 flex flex-col bg-card/40 relative transition-colors duration-300"
        onClick={() => setContextMenu(null)}
      >
        {/* Toolbar with tabs */}
        <header className="h-11 border-b border-border/10 flex items-center px-2 justify-between gap-4 bg-bg/80 backdrop-blur-md z-20">
          <NoteToolbar
            isSidebarCollapsed={isSidebarCollapsed}
            isNotesUiLocked={isNotesUiLocked}
            activeId={activeId}
            title={title}
            isSaving={isSaving}
            openTabIds={openTabIds}
            notes={notes}
            onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            onCreateNote={handleCreateNote}
            onCloseTab={handleCloseTab}
            onSelectNote={handleSelectNote}
            onDeleteNote={handleDeleteNoteWrapper}
            onFocusTitle={focusAndSelectTitle}
            onShowGraph={() => setShowGraph(true)}
            t={t}
          />

          <div className="flex items-center gap-4 pr-4">
            {/* Breadcrumb */}
            {activeId && (
              <div className="hidden lg:flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-text-muted/30">
                <span>Notes</span>
                <ChevronRight className="w-2.5 h-2.5" />
                <span
                  onClick={focusAndSelectTitle}
                  className="text-text-muted/50 cursor-text hover:text-text-muted/70 transition-colors"
                >
                  {title || 'Untitled'}
                </span>
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
                onClick={() => handleDeleteNoteWrapper(activeId)}
                className="p-1.5 text-text-muted/30 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                title={t('notes.deleteTooltip')}
              >
                <Trash2 className="w-3.5 h-3.5" />
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

        {/* Loading State */}
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

        {/* Editor */}
        <div className="flex-1 relative overflow-hidden flex mt-4 h-full">
          <NoteEditor
            title={title}
            content={content}
            isLoading={isLoading}
            isSaving={isSaving}
            activeId={activeId}
            slashMenu={slashMenu}
            editorViewRef={editorViewRef}
            titleInputRef={titleInputRef}
            onTitleChange={setTitle}
            onContentChange={setContent}
            onSelectSlashCommand={handleSelectSlashCommand}
            onCloseSlashMenu={() => setSlashMenu(null)}
            editorExtensions={editorExtensions}
          />
        </div>
      </main>

      {/* Hidden file inputs for import */}
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

      {/* Delete Confirmation */}
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
          onSelect={(opt) => (opt === 'Confirmar' ? confirmDelete() : setDeleteConfirmTarget(null))}
          onCancel={() => setDeleteConfirmTarget(null)}
        />
      )}

      {/* Graph View */}
      {showGraph && (
        <NoteGraphView
          notes={notes}
          onClose={() => setShowGraph(false)}
        />
      )}
    </div>
  )
}
