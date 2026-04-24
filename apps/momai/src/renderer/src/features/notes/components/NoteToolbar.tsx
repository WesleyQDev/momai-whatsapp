import React from 'react'
import {
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  TrashIcon,
  PlusIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../../../i18n'

interface Tab {
  id: string
  title: string
}

interface NoteToolbarProps {
  isSidebarCollapsed: boolean
  isNotesUiLocked: boolean
  activeId: string | null
  title: string
  isSaving: boolean
  openTabIds: string[]
  notes: any[]
  onToggleSidebar: () => void
  onCreateNote: () => void
  onCloseTab: (e: React.MouseEvent, tabId: string) => void
  onSelectNote: (noteId: string, forceNewTab: boolean, selectTitle: boolean) => void
  onDeleteNote: (id?: string) => void
  onFocusTitle: () => void
  t: (key: string) => string
}

export default function NoteToolbar({
  isSidebarCollapsed,
  isNotesUiLocked,
  activeId,
  title,
  isSaving,
  openTabIds,
  notes,
  onToggleSidebar,
  onCreateNote,
  onCloseTab,
  onSelectNote,
  onDeleteNote,
  onFocusTitle,
  t
}: NoteToolbarProps) {
  return (
    <div className="flex items-center gap-1 flex-1 overflow-hidden h-full pt-1.5">
      <button
        onClick={onToggleSidebar}
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
              onClick={() => onSelectNote(tabId, false, true)}
              className={`group flex items-center gap-2 px-3 h-full min-w-[100px] max-w-[180px] cursor-pointer transition-all border-x border-t border-transparent text-[11px] font-medium tracking-tight relative rounded-t-lg ${
                isActive
                  ? 'bg-card/60 text-accent border-border/10'
                  : 'text-text-muted/60 hover:text-text hover:bg-white/5'
              }`}
            >
              <span className="truncate flex-1">{note.title || t('notes.untitled')}</span>
              <button
                onClick={(e) => onCloseTab(e, tabId)}
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
          onClick={onCreateNote}
          className="p-1 text-text-muted/40 hover:text-text hover:bg-white/10 rounded-md transition-all ml-1 mb-1"
          title={t('notes.newNote')}
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
