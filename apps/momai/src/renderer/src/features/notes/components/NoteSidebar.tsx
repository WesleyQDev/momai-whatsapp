import React from 'react'
import {
  FilePlus,
  FolderPlus,
  Search,
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  MoreHorizontal
} from 'lucide-react'
import { useI18n } from '../../../i18n'
import FolderTree from './FolderTree'
import ImportDropdown from './ImportDropdown'
import { NoteSummary } from '../../../services/api'

interface NoteSidebarProps {
  isCollapsed: boolean
  isNotesUiLocked: boolean
  filterText: string
  onFilterChange: (value: string) => void
  folders: string[]
  notesByFolder: Record<string, NoteSummary[]>
  expandedFolders: Set<string>
  dragOverFolder: string | null
  renamingFolder: string | null
  renameValue: string
  renameInputRef: React.RefObject<HTMLInputElement | null>
  activeId: string | null
  isCreatingFolder: boolean
  newFolderName: string
  folderInputRefSimple: React.RefObject<HTMLInputElement | null>
  isImportDropdownOpen: boolean
  onToggleFolder: (folderPath: string) => void
  onContextMenu: (e: React.MouseEvent, id: string, type: 'note' | 'folder') => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (folderPath: string) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, folderPath: string) => void
  onRenameChange: (value: string) => void
  onRenameBlur: () => void
  onRenameKeyDown: (e: React.KeyboardEvent) => void
  onSelectNote: (id: string, forceNewTab: boolean, selectTitle: boolean) => void
  onContextMenuNote: (e: React.MouseEvent, id: string) => void
  onDragStartNote: (e: React.DragEvent, id: string) => void
  onCreateNote: () => void
  onCreateFolder: () => void
  onFolderNameChange: (value: string) => void
  onImportDropdownToggle: () => void
  onImportFiles: () => void
  onImportFolder: () => void
  onCloseImportDropdown: () => void
  rootNotes: NoteSummary[]
  isLoading: boolean
  notes: NoteSummary[]
}

export default function NoteSidebar({
  isCollapsed,
  isNotesUiLocked,
  filterText,
  onFilterChange,
  folders,
  notesByFolder,
  expandedFolders,
  dragOverFolder,
  renamingFolder,
  renameValue,
  renameInputRef,
  activeId,
  isCreatingFolder,
  newFolderName,
  folderInputRefSimple,
  isImportDropdownOpen,
  onToggleFolder,
  onContextMenu,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onRenameChange,
  onRenameBlur,
  onRenameKeyDown,
  onSelectNote,
  onContextMenuNote,
  onDragStartNote,
  onCreateNote,
  onCreateFolder,
  onFolderNameChange,
  onImportDropdownToggle,
  onImportFiles,
  onImportFolder,
  onCloseImportDropdown,
  rootNotes,
  isLoading,
  notes
}: NoteSidebarProps) {
  const { t } = useI18n()

  if (isCollapsed) return null

  return (
    <aside className="w-64 border-r border-border/10 bg-sidebar flex flex-col shrink-0 transition-all duration-300">
      {/* Sidebar Header */}
      <div className="px-3 py-3 space-y-2 border-b border-border/10">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xs font-semibold text-text/80 uppercase tracking-wider">Notas</h2>
          <div className="flex-1" />
          <button
            onClick={onCreateNote}
            className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-all"
            title={t('notes.newNote')}
          >
            <FilePlus className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/50" />
          <input
            value={filterText}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder={t('notes.searchPlaceholder')}
            className="w-full bg-input/50 border border-border/20 focus:border-accent/40 rounded-md pl-8 pr-3 py-1.5 text-xs font-medium focus:outline-none transition-all placeholder:text-text-muted/40"
          />
        </div>

        {/* Toolbar Actions */}
        {!isNotesUiLocked && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onCreateFolder()}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
              title={t('notes.newFolder')}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Nova pasta</span>
            </button>

            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onImportDropdownToggle()
                }}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
                title={t('notes.importFiles')}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Importar</span>
              </button>

              <ImportDropdown
                isOpen={isImportDropdownOpen}
                onClose={onCloseImportDropdown}
                onImportFiles={onImportFiles}
                onImportFolder={onImportFolder}
              />
            </div>
          </div>
        )}
      </div>

      <div
        className={`flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-0.5 transition-colors ${
          dragOverFolder === 'root' ? 'bg-accent/5' : ''
        }`}
        onClick={() => onContextMenu(new MouseEvent('click') as any, '', 'note' as any)}
        onDragOver={onDragOver}
        onDragEnter={() => onDragEnter('root')}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onDragLeave(e)
          }
        }}
        onDrop={(e) => onDrop(e, 'root')}
      >
        {isCreatingFolder && (
          <div className="px-1 py-1">
            <input
              ref={folderInputRefSimple as React.RefObject<HTMLInputElement>}
              value={newFolderName}
              onChange={(e) => onFolderNameChange(e.target.value)}
              onBlur={onCreateFolder}
              onKeyDown={(e) => e.key === 'Enter' && onCreateFolder()}
              placeholder={t('notes.untitledFolder')}
              className="w-full bg-input border border-accent/50 rounded-md px-2 py-1.5 text-xs font-medium text-text outline-none mb-1"
              autoFocus
            />
          </div>
        )}

        {isLoading && notes.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs opacity-30 italic">{t('notes.loading')}</div>
        ) : (
          <div className="space-y-0.5">
            <FolderTree
              folders={folders}
              notesByFolder={notesByFolder}
              expandedFolders={expandedFolders}
              dragOverFolder={dragOverFolder}
              renamingFolder={renamingFolder}
              renameValue={renameValue}
              renameInputRef={renameInputRef}
              activeId={activeId}
              onToggleFolder={onToggleFolder}
              onContextMenu={onContextMenu}
              onDragOver={onDragOver}
              onDragEnter={onDragEnter}
              onDragLeave={() => onDragLeave(new MouseEvent('dragleave') as any)}
              onDrop={onDrop}
              onRenameChange={onRenameChange}
              onRenameBlur={onRenameBlur}
              onRenameKeyDown={onRenameKeyDown}
              onSelectNote={onSelectNote}
              onContextMenuNote={onContextMenuNote}
              onDragStartNote={onDragStartNote}
            />

            {/* Root Notes Section */}
            {rootNotes.length > 0 && (
              <div className="pt-2">
                <div className="px-2 py-1 text-[10px] font-semibold text-text-muted/40 uppercase tracking-wider">
                  Notas
                </div>
                {rootNotes.map((note) => (
                  <div
                    key={note.id}
                    draggable
                    onDragStart={(e) => onDragStartNote(e, note.id)}
                    onContextMenu={(e) => onContextMenuNote(e, note.id)}
                  >
                    {false ? (
                      <input
                        ref={renameInputRef as React.RefObject<HTMLInputElement>}
                        value={renameValue}
                        onChange={(e) => onRenameChange(e.target.value)}
                        onBlur={onRenameBlur}
                        onKeyDown={onRenameKeyDown}
                        className="w-full bg-input border border-accent/50 rounded-md px-2 py-1.5 text-xs font-medium text-text outline-none mb-0.5"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => onSelectNote(note.id, false, true)}
                        onAuxClick={(e) => {
                          if (e.button === 1) onSelectNote(note.id, true, true)
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-md transition-all group relative flex items-center gap-2 ${
                          note.id === activeId
                            ? 'bg-accent/10 text-accent'
                            : 'text-text-muted/80 hover:bg-white/5 hover:text-text'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5 opacity-50 group-hover:opacity-80" />
                        <span className="text-xs truncate flex-1">{note.title || t('notes.untitled')}</span>
                        {note.id === activeId && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4/5 bg-accent rounded-r-full"></div>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
