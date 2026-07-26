import React from 'react'
import { useI18n } from '../../../i18n'
import { NoteSummary } from '../../../services/api'

interface NoteListItemProps {
  note: NoteSummary
  isActive: boolean
  onSelect: (id: string, forceNewTab: boolean, selectTitle: boolean) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  renamingId: string | null
  renameValue: string
  onRenameChange: (value: string) => void
  onRenameBlur: () => void
  onRenameKeyDown: (e: React.KeyboardEvent) => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
}

export default function NoteListItem({
  note,
  isActive,
  onSelect,
  onContextMenu,
  onDragStart,
  renamingId,
  renameValue,
  onRenameChange,
  onRenameBlur,
  onRenameKeyDown,
  renameInputRef
}: NoteListItemProps) {
  const { t } = useI18n()

  if (renamingId === note.id) {
    return (
      <div className="px-2 py-0.5">
        <input
          ref={renameInputRef as React.RefObject<HTMLInputElement>}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameBlur}
          onKeyDown={onRenameKeyDown}
          className="w-full bg-input border border-accent/50 rounded-lg px-3 py-2 text-[13px] font-medium text-text outline-none mb-0.5"
          autoFocus
        />
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, note.id)}
      onContextMenu={(e) => onContextMenu(e, note.id)}
    >
      <button
        onClick={() => onSelect(note.id, false, true)}
        onAuxClick={(e) => {
          if (e.button === 1) onSelect(note.id, true, true)
        }}
        className={`w-full text-left px-2 py-1.5 rounded-md transition-all group relative flex items-center gap-2 ${
          isActive
            ? 'bg-accent/10 text-accent'
            : 'text-text-muted/80 hover:bg-white/5 hover:text-text'
        }`}
      >
        <span className="text-xs truncate flex-1">{note.title || t('notes.untitled')}</span>
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4/5 bg-accent rounded-r-full"></div>
        )}
      </button>
    </div>
  )
}
