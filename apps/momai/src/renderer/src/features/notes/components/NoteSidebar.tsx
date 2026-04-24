import React from 'react'
import {
  PencilSquareIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  InboxIcon
} from '@heroicons/react/24/outline'
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
    <aside className="w-60 border-r border-border/5 bg-sidebar flex flex-col shrink-0 transition-all duration-300">
      {/* Sidebar Header: Search & Toolbar */}
      <div className="p-3 space-y-2">
        <div className="relative group">
          <input
            value={filterText}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder={t('notes.searchPlaceholder')}
            className="w-full bg-input/50 hover:bg-input border border-transparent focus:border-border/20 rounded-lg pl-9 pr-3 py-2 text-xs font-medium focus:outline-none transition-all placeholder:text-text-muted/40"
          />
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/40 group-focus-within:text-accent transition-colors" />
        </div>

        {/* Toolbar Actions */}
        {!isNotesUiLocked && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={onCreateNote}
              className="p-1.5 text-text-muted hover:text-accent hover:bg-white/5 rounded-lg transition-all"
              title={t('notes.newNote')}
            >
              <PencilSquareIcon className="w-5 h-5 stroke-[1.5]" />
            </button>

            <button
              onClick={() => onCreateFolder()}
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
                  onImportDropdownToggle()
                }}
                className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-lg transition-all"
                title={t('notes.importFiles')}
              >
                <FolderIcon className="w-5 h-5 stroke-[1.5]" />
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
        className={`flex-1 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-0.5 transition-colors ${
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
          <div className="p-1">
            <input
              ref={folderInputRefSimple as React.RefObject<HTMLInputElement>}
              value={newFolderName}
              onChange={(e) => onFolderNameChange(e.target.value)}
              onBlur={onCreateFolder}
              onKeyDown={(e) => e.key === 'Enter' && onCreateFolder()}
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

            {/* Root Notes */}
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
                    className="w-full bg-input border border-accent/50 rounded-lg px-2 py-2 text-[13px] font-medium text-text outline-none mb-0.5"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => onSelectNote(note.id, false, true)}
                    onAuxClick={(e) => {
                      if (e.button === 1) onSelectNote(note.id, true, true)
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
  )
}
