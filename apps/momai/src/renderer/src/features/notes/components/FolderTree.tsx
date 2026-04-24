import React from 'react'
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FolderIcon,
  InboxIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../../../i18n'
import { NoteSummary } from '../../../services/api'
import NoteListItem from './NoteListItem'

interface FolderTreeProps {
  folders: string[]
  notesByFolder: Record<string, NoteSummary[]>
  expandedFolders: Set<string>
  dragOverFolder: string | null
  renamingFolder: string | null
  renameValue: string
  renameInputRef: React.RefObject<HTMLInputElement | null>
  activeId: string | null
  onToggleFolder: (folderPath: string) => void
  onContextMenu: (e: React.MouseEvent, id: string, type: 'folder') => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (folderPath: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, folderPath: string) => void
  onRenameChange: (value: string) => void
  onRenameBlur: () => void
  onRenameKeyDown: (e: React.KeyboardEvent) => void
  onSelectNote: (id: string, forceNewTab: boolean, selectTitle: boolean) => void
  onContextMenuNote: (e: React.MouseEvent, id: string) => void
  onDragStartNote: (e: React.DragEvent, id: string) => void
}

export default function FolderTree({
  folders,
  notesByFolder,
  expandedFolders,
  dragOverFolder,
  renamingFolder,
  renameValue,
  renameInputRef,
  activeId,
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
  onDragStartNote
}: FolderTreeProps) {
  const { t } = useI18n()

  return (
    <>
      {folders.map((folderPath) => {
        const isExpanded = expandedFolders.has(folderPath)
        const folderNotes = notesByFolder[folderPath] || []
        const folderName = folderPath.split('/').pop() || folderPath

        return (
          <div
            key={folderPath}
            onDragOver={onDragOver}
            onDragEnter={() => onDragEnter(folderPath)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, folderPath)}
            className="space-y-0.5"
          >
            {renamingFolder === folderPath ? (
              <div className="px-2 py-0.5">
                <input
                  ref={renameInputRef as React.RefObject<HTMLInputElement>}
                  value={renameValue}
                  onChange={(e) => onRenameChange(e.target.value)}
                  onBlur={onRenameBlur}
                  onKeyDown={onRenameKeyDown}
                  className="w-full bg-input border border-accent/50 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-text outline-none mb-0.5"
                  autoFocus
                />
              </div>
            ) : (
              <button
                onClick={() => onToggleFolder(folderPath)}
                onContextMenu={(e) => onContextMenu(e, folderPath, 'folder')}
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
                  <NoteListItem
                    key={note.id}
                    note={note}
                    isActive={note.id === activeId}
                    onSelect={onSelectNote}
                    onContextMenu={onContextMenuNote}
                    onDragStart={onDragStartNote}
                    renamingId={renamingFolder ? null : renamingFolder ? '' : null}
                    renameValue={renameValue}
                    onRenameChange={onRenameChange}
                    onRenameBlur={onRenameBlur}
                    onRenameKeyDown={onRenameKeyDown}
                    renameInputRef={renameInputRef}
                  />
                ))}
                {folderNotes.length === 0 && (
                  <div className="px-3 py-2 text-[10px] text-text-muted/40 italic">Vazio</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
