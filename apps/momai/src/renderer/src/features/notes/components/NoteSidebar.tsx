import React from 'react'
import {
  SquarePen,
  FolderPlus,
  Search,
  Folder,
  FolderOpen,
  Pin,
  ChevronDown,
  FileText,
  X,
  FolderTree
} from 'lucide-react'
import { useI18n } from '../../../i18n'
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
  memoryNotes?: NoteSummary[]
  onMemoryNoteSelect?: (id: string) => void
  onContextMenuMemoryNote?: (e: React.MouseEvent, id: string) => void
}

const SYSTEM_FOLDERS = ['Lembretes', 'Reminders', 'System', 'Memória']

function isSystemFolder(folderPath: string): boolean {
  const folderName = folderPath.split('/').pop() || ''
  return SYSTEM_FOLDERS.some((sf) => folderName.toLowerCase().includes(sf.toLowerCase()))
}

interface TreeNode {
  name: string
  fullPath: string
  notes: NoteSummary[]
  subfolders: TreeNode[]
}

function buildFolderTree(
  folders: string[],
  notesByFolder: Record<string, NoteSummary[]>
): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>()
  const rootNodes: TreeNode[] = []

  const ensureNode = (path: string): TreeNode => {
    if (nodeMap.has(path)) return nodeMap.get(path)!
    const parts = path.split('/')
    const node: TreeNode = {
      name: parts[parts.length - 1],
      fullPath: path,
      notes: notesByFolder[path] || [],
      subfolders: []
    }
    nodeMap.set(path, node)
    return node
  }

  folders.forEach((p) => ensureNode(p))
  Object.keys(notesByFolder).forEach((p) => {
    if (p !== 'root') ensureNode(p)
  })

  nodeMap.forEach((node, path) => {
    const parts = path.split('/')
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join('/')
      const parentNode = nodeMap.get(parentPath)
      if (parentNode) {
        if (!parentNode.subfolders.some((sf) => sf.fullPath === path)) {
          parentNode.subfolders.push(node)
        }
      } else {
        rootNodes.push(node)
      }
    } else {
      rootNodes.push(node)
    }
  })

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    nodes.forEach((n) => sortNodes(n.subfolders))
  }
  sortNodes(rootNodes)

  return rootNodes
}

interface FolderTreeItemProps {
  node: TreeNode
  expandedFolders: Set<string>
  dragOverFolder: string | null
  renamingFolder: string | null
  renameValue: string
  renameInputRef: React.RefObject<HTMLInputElement | null>
  activeId: string | null
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
  t: (key: string) => string
}

function FolderTreeItem({
  node,
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
  onDragStartNote,
  t
}: FolderTreeItemProps) {
  const isExpanded = expandedFolders.has(node.fullPath)
  const isSystem = isSystemFolder(node.fullPath)
  const totalNotes =
    node.notes.length + node.subfolders.reduce((sum, sf) => sum + sf.notes.length, 0)

  return (
    <div
      onDragOver={onDragOver}
      onDragEnter={() => onDragEnter(node.fullPath)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, node.fullPath)}
      className="space-y-0.5"
    >
      {renamingFolder === node.fullPath ? (
        <div className="px-1 py-0.5">
          <input
            ref={renameInputRef as React.RefObject<HTMLInputElement>}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameBlur}
            onKeyDown={onRenameKeyDown}
            className="w-full bg-input border border-accent/50 rounded-md px-2 py-1 text-xs font-medium text-text outline-none"
            autoFocus
          />
        </div>
      ) : (
        <button
          onClick={() => onToggleFolder(node.fullPath)}
          onContextMenu={(e) => {
            e.stopPropagation()
            onContextMenu(e, node.fullPath, 'folder')
          }}
          className={`w-full text-left px-1.5 py-1 rounded-md transition-all flex items-center gap-1.5 group select-none ${
            dragOverFolder === node.fullPath
              ? 'bg-accent/20 text-accent font-medium'
              : 'text-text-muted/80 hover:bg-white/5 hover:text-text'
          }`}
        >
          <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
            <ChevronDown
              className={`w-3 h-3 text-text-muted/50 group-hover:text-text-muted/90 transition-transform duration-150 ${
                isExpanded ? 'rotate-0' : '-rotate-90'
              }`}
            />
          </div>
          {isSystem ? (
            <Pin className="w-3.5 h-3.5 text-text-muted/70 shrink-0" />
          ) : isExpanded ? (
            <FolderOpen className="w-3.5 h-3.5 text-text-muted/70 group-hover:text-text-muted/90 shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-text-muted/50 group-hover:text-text-muted/80 shrink-0" />
          )}
          <span className="text-xs font-medium truncate flex-1 leading-none text-text/90 group-hover:text-text">
            {node.name}
          </span>
          <span className="text-[10px] font-mono opacity-40 group-hover:opacity-70 shrink-0 px-1 py-0.2 rounded bg-white/5">
            {totalNotes}
          </span>
        </button>
      )}

      {isExpanded && (
        <div className="ml-3 pl-2 border-l border-border/15 space-y-0.5 mt-0.5">
          {node.subfolders.map((subNode) => (
            <FolderTreeItem
              key={subNode.fullPath}
              node={subNode}
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
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onRenameChange={onRenameChange}
              onRenameBlur={onRenameBlur}
              onRenameKeyDown={onRenameKeyDown}
              onSelectNote={onSelectNote}
              onContextMenuNote={onContextMenuNote}
              onDragStartNote={onDragStartNote}
              t={t}
            />
          ))}

          {node.notes.map((note) => (
            <NoteSidebarItem
              key={note.id}
              note={note}
              activeId={activeId}
              onSelectNote={onSelectNote}
              onContextMenuNote={onContextMenuNote}
              onDragStartNote={onDragStartNote}
              t={t}
            />
          ))}

          {node.notes.length === 0 && node.subfolders.length === 0 && (
            <div className="px-2 py-0.5 text-[11px] text-text-muted/30 italic select-none">
              Vazio
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NoteSidebarItem({
  note,
  activeId,
  onSelectNote,
  onContextMenuNote,
  onDragStartNote,
  t
}: {
  note: NoteSummary
  activeId: string | null
  onSelectNote: (id: string, forceNewTab: boolean, selectTitle: boolean) => void
  onContextMenuNote: (e: React.MouseEvent, id: string) => void
  onDragStartNote: (e: React.DragEvent, id: string) => void
  t: (key: string) => string
}) {
  const isActive = note.id === activeId

  return (
    <div
      draggable
      onDragStart={(e) => onDragStartNote(e, note.id)}
      onContextMenu={(e) => {
        e.stopPropagation()
        onContextMenuNote(e, note.id)
      }}
    >
      <button
        onClick={() => onSelectNote(note.id, false, true)}
        onAuxClick={(e) => {
          if (e.button === 1) onSelectNote(note.id, true, true)
        }}
        className={`w-full text-left px-2 py-1 rounded-md transition-all group relative flex items-center gap-2 select-none ${
          isActive
            ? 'bg-white/10 text-text font-medium'
            : 'text-text-muted/80 hover:bg-white/5 hover:text-text'
        }`}
      >
        <FileText
          className={`w-3.5 h-3.5 shrink-0 ${
            isActive ? 'text-text' : 'opacity-40 group-hover:opacity-70 text-text-muted'
          }`}
        />
        <span className="text-xs truncate flex-1 leading-tight">
          {note.title || t('notes.untitled')}
        </span>
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-white/60 rounded-r-full" />
        )}
      </button>
    </div>
  )
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
  notes,
  memoryNotes,
  onMemoryNoteSelect,
  onContextMenuMemoryNote
}: NoteSidebarProps) {
  const { t } = useI18n()

  if (isCollapsed) return null

  const isMemoryExpanded = expandedFolders.has('__memory')

  const folderTree = buildFolderTree(folders, notesByFolder)

  // Filtering
  const query = filterText.trim().toLowerCase()

  const filteredMemoryNotes = memoryNotes
    ? query
      ? memoryNotes.filter((n) => (n.title || '').toLowerCase().includes(query))
      : memoryNotes
    : []

  const filterTree = (nodes: TreeNode[]): TreeNode[] => {
    if (!query) return nodes
    return nodes
      .map((node) => {
        const matchesFolder = node.name.toLowerCase().includes(query)
        const matchingNotes = node.notes.filter((n) =>
          (n.title || '').toLowerCase().includes(query)
        )
        const matchingSubfolders = filterTree(node.subfolders)

        if (matchesFolder || matchingNotes.length > 0 || matchingSubfolders.length > 0) {
          return {
            ...node,
            notes: matchesFolder ? node.notes : matchingNotes,
            subfolders: matchingSubfolders
          }
        }
        return null
      })
      .filter((n): n is TreeNode => n !== null)
  }

  const filteredTree = filterTree(folderTree)

  const filteredRootNotes = query
    ? rootNotes.filter((n) => (n.title || '').toLowerCase().includes(query))
    : rootNotes

  return (
    <aside className="w-64 border-r border-border/10 bg-sidebar flex flex-col shrink-0 transition-all duration-300 select-none">
      {/* Sidebar Header */}
      <div className="px-3 py-2.5 space-y-2 border-b border-border/10">
        {/* Toolbar Actions */}
        {!isNotesUiLocked && (
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => onCreateNote()}
                className="p-1.5 text-text-muted/70 hover:text-text hover:bg-white/5 rounded-md transition-all"
                title="Nova nota"
              >
                <SquarePen className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCreateFolder()}
                className="p-1.5 text-text-muted/70 hover:text-text hover:bg-white/5 rounded-md transition-all"
                title="Nova pasta"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onImportDropdownToggle()
                  }}
                  className="p-1.5 text-text-muted/70 hover:text-text hover:bg-white/5 rounded-md transition-all"
                  title="Importar"
                >
                  <Folder className="w-4 h-4" />
                </button>
                <ImportDropdown
                  isOpen={isImportDropdownOpen}
                  onClose={onCloseImportDropdown}
                  onImportFiles={onImportFiles}
                  onImportFolder={onImportFolder}
                />
              </div>
            </div>
          </div>
        )}

        {/* Search Input & Reorganize Button */}
        <div className="relative flex items-center gap-1">
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/40 pointer-events-none" />
            <input
              value={filterText}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder={t('notes.searchPlaceholder')}
              className="w-full bg-input/40 border border-border/15 focus:border-white/20 rounded-md pl-8 pr-7 py-1.5 text-xs text-text focus:outline-none placeholder:text-text-muted/40 transition-all"
            />
            {filterText && (
              <button
                onClick={() => onFilterChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-muted/50 hover:text-text rounded-full transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={() => {
              if (filterText) onFilterChange('')
              folders.forEach((f) => {
                if (expandedFolders.has(f)) onToggleFolder(f)
              })
              if (expandedFolders.has('__memory')) onToggleFolder('__memory')
            }}
            className="p-1.5 text-text-muted/60 hover:text-text hover:bg-white/5 rounded-md transition-all shrink-0"
            title="Recolher e reorganizar estrutura de pastas"
          >
            <FolderTree className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sidebar Content */}
      <div
        className={`flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-1 transition-colors ${
          dragOverFolder === 'root' ? 'bg-white/5' : ''
        }`}
        onContextMenu={(e) => onContextMenu(e, 'root', 'folder')}
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
            <div className="flex items-center gap-1.5 px-2 py-1 bg-input border border-white/20 rounded-md">
              <FolderPlus className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <input
                ref={folderInputRefSimple as React.RefObject<HTMLInputElement>}
                value={newFolderName}
                onChange={(e) => onFolderNameChange(e.target.value)}
                onBlur={onCreateFolder}
                onKeyDown={(e) => e.key === 'Enter' && onCreateFolder()}
                placeholder={t('notes.untitledFolder')}
                className="w-full bg-transparent text-xs font-medium text-text outline-none"
                autoFocus
              />
            </div>
          </div>
        )}

        {isLoading && notes.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text-muted/40 italic">
            {t('notes.loading')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Memory Folder — always first if memory notes exist */}
            {filteredMemoryNotes.length > 0 && (
              <div className="space-y-0.5">
                <button
                  onClick={() => onToggleFolder('__memory')}
                  className="w-full text-left px-1.5 py-1 rounded-md transition-all flex items-center gap-1.5 group select-none text-text-muted/80 hover:bg-white/5 hover:text-text"
                >
                  <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                    <ChevronDown
                      className={`w-3 h-3 text-text-muted/50 group-hover:text-text-muted/90 transition-transform duration-150 ${
                        isMemoryExpanded ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                  </div>
                  <Pin className="w-3.5 h-3.5 text-text-muted/70 group-hover:text-text-muted/90 shrink-0" />
                  <span className="text-xs font-medium truncate flex-1 leading-none text-text/90 group-hover:text-text">
                    Memória
                  </span>
                  <span className="text-[10px] font-mono opacity-40 group-hover:opacity-70 shrink-0 px-1 py-0.2 rounded bg-white/5">
                    {filteredMemoryNotes.length}
                  </span>
                </button>

                {isMemoryExpanded && (
                  <div className="ml-3 pl-2 border-l border-border/15 space-y-0.5 mt-0.5">
                    {filteredMemoryNotes.map((note) => {
                      const isActive = note.id === activeId
                      return (
                        <div key={note.id}>
                          <button
                            onClick={() => onMemoryNoteSelect?.(note.id)}
                            onContextMenu={(e) => {
                              e.stopPropagation()
                              onContextMenuMemoryNote?.(e, note.id)
                            }}
                            className={`w-full text-left px-2 py-1 rounded-md transition-all group relative flex items-center gap-2 select-none ${
                              isActive
                                ? 'bg-white/10 text-text font-medium'
                                : 'text-text-muted/80 hover:bg-white/5 hover:text-text'
                            }`}
                          >
                            <FileText
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isActive
                                  ? 'text-text'
                                  : 'opacity-40 group-hover:opacity-70 text-text-muted'
                              }`}
                            />
                            <span className="text-xs truncate flex-1 leading-tight">
                              {note.title || t('notes.untitled')}
                            </span>
                            {isActive && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-white/60 rounded-r-full" />
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Folder Tree Nodes */}
            {filteredTree.map((node) => (
              <FolderTreeItem
                key={node.fullPath}
                node={node}
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
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onRenameChange={onRenameChange}
                onRenameBlur={onRenameBlur}
                onRenameKeyDown={onRenameKeyDown}
                onSelectNote={onSelectNote}
                onContextMenuNote={onContextMenuNote}
                onDragStartNote={onDragStartNote}
                t={t}
              />
            ))}

            {/* Root Level Notes */}
            {filteredRootNotes.map((note) => (
              <NoteSidebarItem
                key={note.id}
                note={note}
                activeId={activeId}
                onSelectNote={onSelectNote}
                onContextMenuNote={onContextMenuNote}
                onDragStartNote={onDragStartNote}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
