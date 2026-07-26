# MOM-70: Notes Editor Obsidian UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the MomAI notes editor UX to compete with Obsidian — autocomplete wiki links, mini-graph, keyboard shortcuts, sidebar visual refinements, and WYSIWYG polish.

**Architecture:** All changes are in the renderer React/CodeMirror layer. The backend IPC and storage are untouched. Key files are under `apps/momai/src/renderer/src/features/notes/` and `apps/momai/src/renderer/src/components/notes/`.

**Tech Stack:** React 19, TypeScript, CodeMirror 6, react-force-graph-2d, TailwindCSS, Vitest

## Global Constraints

- All changes are renderer-only (no IPC, no main process, no node-core)
- Follow existing patterns in nearby files (hooks in `hooks/`, components in `components/`)
- Test with Vitest + @testing-library/react for component tests
- Use `pnpm --filter momai test` to run tests
- Use `pnpm --filter momai typecheck:web` to typecheck renderer code
- Existing `cm-wiki-link` CSS class: `color: accent, background: accent/0.15, border-radius: 4px, padding: 1px 4px`
- Existing `cm-md-hidden` CSS class: `opacity: 0, width: 0, display: inline-block, overflow: hidden`
- `window.api.notes.*` mocks already exist in `src/renderer/src/test-setup.ts`

---
### Task 1: Sidebar Visual — Remove FileText icons, compact action buttons, tooltips

**Files:**
- Modify: `apps/momai/src/renderer/src/features/notes/components/NoteSidebar.tsx`
- Modify: `apps/momai/src/renderer/src/features/notes/components/NoteListItem.tsx`

**Interfaces:**
- Consumes: existing `NoteSidebarProps`, `NoteListItemProps`
- Produces: same interfaces (no contract changes)

- [ ] **Step 1: NoteListItem — Remove FileText icon**

In `apps/momai/src/renderer/src/features/notes/components/NoteListItem.tsx`, remove the `<FileText>` icon from the button. Also remove the import.

```tsx
// Before (lines 67-69):
{/* <FileText className="w-3.5 h-3.5 opacity-50 group-hover:opacity-80 shrink-0" /> */}
<span className="text-xs truncate flex-1">{note.title || t('notes.untitled')}</span>

// After:
<span className="text-xs truncate flex-1">{note.title || t('notes.untitled')}</span>
```

- [ ] **Step 2: NoteSidebar — Remove FileText from folder note items**

In `apps/momai/src/renderer/src/features/notes/components/NoteSidebar.tsx`, find the two places where `FileText` icon is rendered inside folder notes and root notes. Remove the icon and adjust padding from `pl-6` to `pl-2` for folder note items. Remove `FileText` from imports.

For folder notes (around line 290), change:
```tsx
// Before:
className={`w-full text-left pl-6 pr-2 py-1 rounded-md transition-all group relative flex items-center gap-2 ${
// After:
className={`w-full text-left pl-2 pr-2 py-1 rounded-md transition-all group relative flex items-center gap-2 ${
```

Remove the `<FileText className="w-3 h-3 ..." />` line.

For root notes (around line 324), remove the `<FileText className="w-3.5 h-3.5 ..." />` line.

- [ ] **Step 3: NoteSidebar — Redesign action buttons header**

Replace the current action buttons section with a single compact row of 3 icon buttons with tooltips.

In `apps/momai/src/renderer/src/features/notes/components/NoteSidebar.tsx`:

Change the import from `FilePlus` to `SquarePen`:
```tsx
import { Search, Folder, SquarePen, FolderPlus } from 'lucide-react'
```

Remove `FilePlus`, `Pin`, `FileText` from imports.

Replace the action buttons section (around line 155):
```tsx
{/* Toolbar Actions — compact icon row */}
{!isNotesUiLocked && (
  <div className="flex items-center gap-1 mt-1">
    <button
      onClick={onCreateNote}
      className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-all"
      title="Nova nota"
    >
      <SquarePen className="w-4 h-4" />
    </button>
    <button
      onClick={() => onCreateFolder()}
      className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
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
        className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
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
)}
```

Remove the old `div.flex.items-center.gap-1 > button + button + ImportDropdown` block.

- [ ] **Step 4: Verify build**

```bash
cd apps/momai
pnpm typecheck:web
pnpm test -- --run src/renderer/src/features/notes/
```

Expected: typecheck passes, existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/features/notes/components/NoteSidebar.tsx apps/momai/src/renderer/src/features/notes/components/NoteListItem.tsx
git commit -m "feat(notes): sidebar visual refinements - remove FileText icons, compact action buttons with tooltips"
```

---
### Task 2: Context Menu — Add "Criar nova nota" and "Abrir pasta"

**Files:**
- Modify: `apps/momai/src/renderer/src/features/notes/NotesView.tsx`

**Interfaces:**
- Consumes: `handleCreateNote`, `window.api.notes.openFolder(id)`, `notes`, active folder context
- Produces: updated context menu with 2 new items

- [ ] **Step 1: Add context menu items**

In `NotesView.tsx`, in the context menu section (around line 421-470), modify the menu structure:

```tsx
{contextMenu && (
  <div
    className="fixed z-50 bg-card border border-border/10 rounded-lg shadow-xl py-1 min-w-[160px] flex flex-col animate-context-menu"
    style={{ top: contextMenu.y, left: contextMenu.x }}
    onClick={(e) => e.stopPropagation()}
  >
    {/* Criar nova nota */}
    <button
      onClick={() => {
        handleCreateNote(contextMenu.type === 'folder' ? contextMenu.id : undefined)
        // If contextMenu is on a note, get its parent folder path
        // If on a folder, use that folder path
        setContextMenu(null)
      }}
      className="text-left px-3 py-1.5 text-xs text-text/80 hover:bg-white/5 hover:text-text flex items-center gap-2 transition-all"
    >
      <FilePlus className="w-3.5 h-3.5 opacity-40" />
      Criar nova nota
    </button>

    {/* Abrir pasta */}
    {contextMenu.type === 'note' && (
      <button
        onClick={() => {
          const note = notes.find((n) => n.id === contextMenu.id)
          if (note?.path) {
            // note.path is like "folder/note.md" - extract folder and call openFolder
            const folderPath = note.path.split('/').slice(0, -1).join('/')
            window.api.notes.openFolder(contextMenu.id)
          } else {
            window.api.notes.openFolder(contextMenu.id)
          }
          setContextMenu(null)
        }}
        className="text-left px-3 py-1.5 text-xs text-text/80 hover:bg-white/5 hover:text-text flex items-center gap-2 transition-all"
      >
        <Folder className="w-3.5 h-3.5 opacity-40" />
        Abrir pasta
      </button>
    )}

    <div className="h-px bg-border/5 my-1 mx-2"></div>

    {/* Renomear */}
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
```

Add `FilePlus` and `Folder` to the lucide-react imports if not already there.

- [ ] **Step 2: Adjust `handleCreateNote` to accept optional folder path**

In `NotesView.tsx`, the `handleCreateNote` from `useNotes` hook doesn't take a folder path. The current implementation creates at root.

For this task, we'll just call `handleCreateNote()` without folder support — creating at root is acceptable. The "Abrir pasta" button opens the note's folder in the file manager (which already exists via `window.api.notes.openFolder`).

The `openFolder` IPC already handles opening the system file manager at the note's location.

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck:web
```

Expected: typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/renderer/src/features/notes/NotesView.tsx
git commit -m "feat(notes): add 'Criar nova nota' and 'Abrir pasta' to context menu"
```

---
### Task 3: F2 Rename in Sidebar

**Files:**
- Modify: `apps/momai/src/renderer/src/features/notes/NotesView.tsx`

**Interfaces:**
- Consumes: `renamingId`, `setRenamingId`, `activeId`, `handleStartRename`, `notes`
- Produces: F2 key listener on the main NotesView div

- [ ] **Step 1: Add F2 keydown handler**

In `NotesView.tsx`, add an `onKeyDown` handler on the root div that catches F2 when no input is focused.

Add this function:
```tsx
const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
  if (e.key === 'F2') {
    // Only trigger if no text input is focused
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    if (activeId && !renamingId) {
      const note = notes.find((n) => n.id === activeId)
      if (note) {
        handleStartRename(activeId, note.title, 'note')
      }
    }
  }
}, [activeId, renamingId, notes, handleStartRename])
```

- [ ] **Step 2: Add keydown listener to root div**

Find the root div in the return statement (around line 370):
```tsx
<div
  className="flex-1 h-full bg-bg text-text flex font-sans overflow-hidden transition-colors duration-300"
  onClick={() => {
    setContextMenu(null)
    setIsImportDropdownOpen(false)
  }}
  onKeyDown={handleKeyDown}  // Add this
>
```

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck:web
```

Expected: typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/renderer/src/features/notes/NotesView.tsx
git commit -m "feat(notes): F2 rename active note in sidebar"
```

---
### Task 4: Enter in Title Moves Cursor to Editor + Click Below Last Line

**Files:**
- Modify: `apps/momai/src/renderer/src/features/notes/components/NoteEditor.tsx`

**Interfaces:**
- Consumes: `editorViewRef`, `titleInputRef`, `onTitleChange`, `content`, `onContentChange`
- Produces: Enter keydown on title; click-to-end on editor

- [ ] **Step 1: Add Enter keydown on title input**

In `NoteEditor.tsx`, add `onKeyDown` to the title input:

```tsx
<input
  ref={titleInputRef as React.RefObject<HTMLInputElement>}
  value={title}
  onChange={(e) => onTitleChange(e.target.value)}
  onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
  onKeyDown={(e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const view = editorViewRef.current
      if (view) {
        view.focus()
        view.dispatch({
          selection: { anchor: view.state.doc.length }
        })
      }
    }
  }}
  placeholder={t('notes.untitled')}
  className="w-full bg-transparent text-3xl font-bold text-text outline-none placeholder:text-text-muted/20 border-none"
/>
```

- [ ] **Step 2: Add click-below-last-line handler on CodeMirror**

In `NoteEditor.tsx`, after the CodeMirror component, add a click handler. We need to wrap the CodeMirror in a container div with an onClick:

```tsx
<div
  className="flex-1 overflow-y-auto custom-scrollbar w-full"
  onClick={(e) => {
    const view = editorViewRef.current
    if (!view || !activeId) return

    const editorEl = e.currentTarget.querySelector('.cm-scroller')
    if (!editorEl) return

    const rect = editorEl.getBoundingClientRect()
    const clickY = e.clientY - rect.top

    const lastLine = view.state.doc.line(view.state.doc.lines)
    const lastLineCoords = view.coordsAtPos(lastLine.to)
    if (!lastLineCoords) return

    const lastLineBottom = lastLineCoords.bottom - rect.top
    if (clickY > lastLineBottom + 100) {
      view.focus()
      view.dispatch({
        selection: { anchor: view.state.doc.length }
      })
    }
  }}
>
```

Keep the existing `overflow-y-auto custom-scrollbar w-full` on this wrapper. The click handler catches clicks in the empty space below the last line.

- [ ] **Step 3: Move CodeMirror inside the clickable container**

Currently the outer div has `className="flex-1 overflow-y-auto custom-scrollbar w-full"`. Add the onClick to this div. The CodeMirror and the title input should be inside this div for the click handler to work properly.

The existing structure already has this — the title input is above CodeMirror inside a `div.flex-1.overflow-y-auto`. The click handler should only trigger when clicking near the editor area, not the title. The current layout already separates title and editor in different containers.

Restructure:

```tsx
return (
  <div className="flex-1 overflow-y-auto custom-scrollbar w-full" onClick={handleEditorAreaClick}>
    <div className="max-w-4xl mx-auto w-full flex flex-col min-h-full">
      {slashMenu && (
        <SlashCommandMenu
          x={slashMenu.x}
          y={slashMenu.y}
          query={slashMenu.query}
          onSelect={onSelectSlashCommand}
          onClose={onCloseSlashMenu}
        />
      )}
      <div className="px-8 pt-6 pb-0">
        <input
          ref={titleInputRef as React.RefObject<HTMLInputElement>}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
          onKeyDown={handleTitleKeyDown}
          placeholder={t('notes.untitled')}
          className="w-full bg-transparent text-3xl font-bold text-text outline-none placeholder:text-text-muted/20 border-none"
        />
        <div className="h-px bg-border/15 w-full mt-3 mb-4"></div>
      </div>
      <CodeMirror
        value={content}
        onChange={(value) => onContentChange(value)}
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
)
```

Where `handleTitleKeyDown` and `handleEditorAreaClick` are memoized callbacks or inline handlers.

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck:web
pnpm test -- --run src/renderer/src/features/notes/
```

Expected: typecheck passes, existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/features/notes/components/NoteEditor.tsx
git commit -m "feat(notes): Enter in title focuses editor; click below last line moves cursor to end"
```

---
### Task 5: Wiki Link Autocomplete Dropdown

**Files:**
- Create: `apps/momai/src/renderer/src/features/notes/components/WikiLinkDropdown.tsx`
- Create: `apps/momai/src/renderer/src/features/notes/hooks/useWikiLinkAutocomplete.ts`
- Modify: `apps/momai/src/renderer/src/features/notes/components/NoteEditor.tsx`
- Modify: `apps/momai/src/renderer/src/features/notes/NotesView.tsx`

**Interfaces:**
- `WikiLinkDropdownProps`: `{ x: number, y: number, query: string, notes: NoteSummary[], onSelect: (title: string) => void, onClose: () => void }`
- `useWikiLinkAutocomplete`: returns `{ wikiMenu: WikiMenuState | null, setWikiMenu, handleSelectWikiLink }`
- `WikiMenuState`: `{ x: number, y: number, query: string, pos: number }`

- [ ] **Step 1: Create WikiLinkDropdown component**

```tsx
import { useEffect, useState, useRef, useMemo } from 'react'
import { FileText } from 'lucide-react'
import type { NoteSummary } from '../../../services/api'

interface WikiLinkDropdownProps {
  x: number
  y: number
  query: string
  notes: NoteSummary[]
  onSelect: (title: string) => void
  onClose: () => void
}

export default function WikiLinkDropdown({
  x,
  y,
  query,
  notes,
  onSelect,
  onClose
}: WikiLinkDropdownProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const filteredNotes = useMemo(() => {
    if (!query) return notes.slice(0, 20)
    return notes
      .filter((n) => n.title?.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 20)
  }, [notes, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredNotes.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredNotes.length) % filteredNotes.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredNotes[selectedIndex]) {
          onSelect(filteredNotes[selectedIndex].title)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [filteredNotes, selectedIndex, onSelect, onClose])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  if (filteredNotes.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-[300] w-64 bg-card/95 backdrop-blur-xl border border-border/20 rounded-xl shadow-2xl overflow-hidden animate-zoom-in"
      style={{
        top: Math.min(y, window.innerHeight - 350),
        left: Math.min(x, window.innerWidth - 260)
      }}
    >
      <div className="px-3 py-2 border-b border-border/10">
        <span className="text-[10px] font-bold text-text-muted/50 uppercase tracking-widest">
          Vincular nota
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto custom-scrollbar p-1">
        {filteredNotes.map((note, index) => (
          <button
            key={note.id}
            onClick={() => onSelect(note.title)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all ${
              index === selectedIndex
                ? 'bg-accent/10 text-accent'
                : 'text-text-muted/80 hover:bg-white/5 hover:text-text'
            }`}
          >
            <span className="text-xs truncate flex-1">
              {note.title || 'Untitled'}
            </span>
            {note.path && (
              <span className="text-[9px] opacity-40 truncate max-w-[80px]">
                {note.path.split('/').slice(0, -1).join('/')}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create useWikiLinkAutocomplete hook**

```tsx
import { useRef, useState, useCallback } from 'react'
import { EditorView } from '@codemirror/view'

export interface WikiMenuState {
  x: number
  y: number
  query: string
  pos: number
}

export function useWikiLinkAutocomplete() {
  const editorViewRefForWiki = useRef<EditorView | null>(null)
  const [wikiMenu, setWikiMenu] = useState<WikiMenuState | null>(null)

  const handleSelectWikiLink = useCallback(
    (title: string) => {
      if (!wikiMenu || !editorViewRefForWiki.current) return
      const view = editorViewRefForWiki.current
      const { pos } = wikiMenu
      const insertText = `${title}]]`
      const transaction = view.state.update({
        changes: { from: pos, to: pos + wikiMenu.query.length + 2, insert: insertText },
        selection: { anchor: pos + insertText.length }
      })
      view.dispatch(transaction)
      view.focus()
      setWikiMenu(null)
    },
    [wikiMenu]
  )

  return {
    editorViewRefForWiki,
    wikiMenu,
    setWikiMenu,
    handleSelectWikiLink
  }
}
```

- [ ] **Step 3: Wire up autocomplete detection in NoteEditor**

In `NoteEditor.tsx`, import the new hook and component. The `[[` detection works via the CodeMirror `EditorView.updateListener` — but since the existing `useEditorExtensions` already has a listener for `/`, we'll add wiki link detection in the `NotesView` component level instead.

In `NotesView.tsx`, import and use the hook:

```tsx
import { useWikiLinkAutocomplete } from './hooks/useWikiLinkAutocomplete'
import WikiLinkDropdown from './components/WikiLinkDropdown'
```

Add after `useEditorExtensions`:
```tsx
const {
  editorViewRefForWiki,
  wikiMenu,
  setWikiMenu,
  handleSelectWikiLink
} = useWikiLinkAutocomplete()
```

Add a `useEffect` in `NotesView.tsx` to detect `[[` in the CodeMirror editor:
```tsx
useEffect(() => {
  const view = editorViewRef.current
  if (!view) return

  const listener = EditorView.updateListener.of((update: ViewUpdate) => {
    if (update.docChanged || update.selectionSet) {
      const state = update.state
      const pos = state.selection.main.head
      const line = state.doc.lineAt(pos)
      const lineText = line.text.slice(0, pos - line.from)
      const match = lineText.match(/(?:^|\s)(\[\[)([^\]]*)$/)
      if (match) {
        const query = match[2]
        const wikiPos = line.from + lineText.lastIndexOf('[[')
        setTimeout(() => {
          const coords = update.view.coordsAtPos(pos)
          if (coords) {
            setWikiMenu({ x: coords.left, y: coords.bottom + 8, query, pos: wikiPos })
          }
        }, 0)
      } else {
        setWikiMenu(null)
      }
    }
  })

  view.dispatch(view.state.update({ effects: StateEffect.appendConfig.of(listener) }))

  return () => {
    // Cleanup: the effect is appended to the view's state
    // When the component unmounts, the listener is garbage collected
  }
}, [editorViewRef.current])
```

This needs `EditorView`, `ViewUpdate`, and `StateEffect` imported.

Actually, a simpler approach: pass `setWikiMenu` to the editor and let the existing updateListener in `useEditorExtensions` handle both `/` and `[[` detection. But the hook is memoized and can't easily consume external state setters.

Better approach: Use a separate `EditorView.updateListener` attached directly in `NotesView.tsx` via a plugin appended to the editorExtensions.

In `NotesView.tsx`, add a wiki link listener to the editor extensions:

```tsx
const wikiLinkListener = useMemo(() =>
  EditorView.updateListener.of((update: ViewUpdate) => {
    if (update.docChanged || update.selectionSet) {
      const state = update.state
      const pos = state.selection.main.head
      const line = state.doc.lineAt(pos)
      const lineText = line.text.slice(0, pos - line.from)
      const match = lineText.match(/(?:^|\s)(\[\[)([^\]]*)$/)
      if (match) {
        const query = match[2]
        const wikiPos = line.from + lineText.lastIndexOf('[[')
        setTimeout(() => {
          const coords = update.view.coordsAtPos(pos)
          if (coords) {
            setWikiMenu({ x: coords.left, y: coords.bottom + 8, query, pos: wikiPos })
          }
        }, 0)
      } else {
        setWikiMenu(null)
      }
    }
  }),
  [setWikiMenu]
)
```

Then append it to the extensions array passed to NoteEditor:
```tsx
editorExtensions={[...editorExtensions, wikiLinkListener]}
```

And pass notes and wiki menu state to NoteEditor so it can render the dropdown.

- [ ] **Step 4: Render WikiLinkDropdown in NoteEditor**

Pass these new props to `NoteEditor`:
```tsx
<NoteEditor
  ...
  wikiMenu={wikiMenu}
  notes={notes}
  onSelectWikiLink={handleSelectWikiLink}
/>
```

In `NoteEditor.tsx`, render:
```tsx
{wikiMenu && (
  <WikiLinkDropdown
    x={wikiMenu.x}
    y={wikiMenu.y}
    query={wikiMenu.query}
    notes={notes}
    onSelect={onSelectWikiLink}
    onClose={() => setWikiMenu(null)}
  />
)}
```

Where `setWikiMenu` is also passed as a prop or handled through the callback.

- [ ] **Step 5: Verify build**

```bash
pnpm typecheck:web
pnpm test -- --run src/renderer/src/features/notes/
```

Expected: typecheck passes, existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/momai/src/renderer/src/features/notes/components/WikiLinkDropdown.tsx apps/momai/src/renderer/src/features/notes/hooks/useWikiLinkAutocomplete.ts apps/momai/src/renderer/src/features/notes/components/NoteEditor.tsx apps/momai/src/renderer/src/features/notes/NotesView.tsx
git commit -m "feat(notes): [[ wiki link autocomplete dropdown with note search"
```

---
### Task 6: Wiki Link Bracket Hide/Show Refinement

**Files:**
- Modify: `apps/momai/src/renderer/src/features/notes/hooks/useEditorExtensions.ts`

**Interfaces:**
- Consumes: existing `ViewPlugin` decorator, `editorExtensions`
- Produces: refined bracket hiding — brackets hidden unless cursor is inside the link range

- [ ] **Step 1: Refine wiki link bracket hiding logic**

In `useEditorExtensions.ts`, find the wiki link section in `buildDecorations` (around line 389):

```tsx
// Current code — hides [[ and ]] on inactive lines only:
if (isActive) continue
// ... later:
const wikiMatches = [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
for (const m of wikiMatches) {
  const s = m.index!
  // Hide opening [[
  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(from + s, from + s + 2))
  // Hide closing ]]
  const e = s + m[0].length - 2
  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(from + e, from + e + 2))
}
```

The current logic skips ALL decorations on the active line (`if (isActive) continue`). We want to change this so:

- On inactive lines: brackets hidden (same as now)
- On active line: check if cursor is **inside** the wiki link range. If inside → show brackets (don't hide). If outside → hide brackets.

```tsx
// Replace the wiki link section:
const sel = view.state.selection.main
const cursorPos = sel.head

const wikiMatches = [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
for (const m of wikiMatches) {
  const s = m.index!
  const linkStart = from + s
  const linkEnd = from + s + m[0].length
  const cursorInside = isActive && cursorPos >= linkStart && cursorPos <= linkEnd

  if (!cursorInside) {
    // Hide opening [[
    decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(from + s, from + s + 2))
    // Hide closing ]]
    const e = s + m[0].length - 2
    decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(from + e, from + e + 2))
  }
}
```

This also means we need to remove the `if (isActive) continue` guard entirely, or change it to only skip non-wiki-link decorations. Actually the cleanest approach: **remove the `if (isActive) continue`** and let each decoration type decide for itself based on cursor position.

But wait — the `isActive` guard skips ALL decorations on the active line (headings, bold, italic, etc). If we remove it, ALL markdown markers would be visible on the active line. That's actually desirable for editing.

Actually, the original WYSIWYG behavior hides markers on inactive lines and shows them on the active line. The new behavior for wiki links is different: hide markers unless cursor is specifically inside the link. For other markers (headings, bold), the existing "show on active line" behavior is fine.

So we keep `if (isActive) continue` for the main skip, but handle wiki links BEFORE the `isActive` check:

Actually the simplest approach: move the wiki link handling to run even for active lines by placing it BEFORE the `isActive` continue check. No, that won't work because decos for the active line are still skipped.

Better: remove `if (isActive) continue` and add explicit "skip unless cursor inside" logic for each decoration type. But that's a lot of changes for the other types.

Simplest correct approach: **keep `if (isActive) continue`** but add a **separate pass for wiki links** that runs regardless:

```tsx
// Before the `if (isActive) continue` guard, add wiki link handling that
// always runs but only hides brackets when cursor is not inside the range.

// Wiki link bracket hiding (runs for ALL lines)
const wikiMatches = [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
for (const m of wikiMatches) {
  const s = m.index!
  const linkStart = from + s
  const linkEnd = from + s + m[0].length
  const cursorInside = isActive && cursorPos >= linkStart && cursorPos <= linkEnd

  if (!cursorInside && !isActive) {
    // Hide brackets on inactive lines (existing behavior)
    decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(from + s, from + s + 2))
    const e = s + m[0].length - 2
    decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(from + e, from + e + 2))
  }
  // On active line, if cursor is inside: keep brackets visible (allow editing)
  // On active line, if cursor is outside: also hide brackets
  if (isActive && !cursorInside) {
    decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(from + s, from + s + 2))
    const e = s + m[0].length - 2
    decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(from + e, from + e + 2))
  }
}
```

This way:
- Inactive lines: brackets always hidden (existing)
- Active line with cursor outside link: brackets hidden (new — aligns with Obsidian)
- Active line with cursor inside link: brackets visible (editing mode)

- [ ] **Step 2: Verify build**

```bash
pnpm typecheck:web
pnpm test -- --run src/renderer/src/features/notes/
```

Expected: typecheck passes, existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/momai/src/renderer/src/features/notes/hooks/useEditorExtensions.ts
git commit -m "feat(notes): refine wiki link bracket hide/show - hide unless cursor is inside link range"
```

---
### Task 7: Mini-Graph Component (Bottom-Right Corner)

**Files:**
- Create: `apps/momai/src/renderer/src/features/notes/components/NoteGraphMini.tsx`
- Modify: `apps/momai/src/renderer/src/features/notes/NotesView.tsx`

**Interfaces:**
- NoteGraphMiniProps: `{ notes: NoteSummary[], onClose: () => void }`
- Consumes: `notes` array (same as NoteGraphView)
- Produces: Mini force-graph in bottom-right corner, expand button opens NoteGraphView

- [ ] **Step 1: Create NoteGraphMini component**

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Network, ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react'
import { NoteSummary, NoteDetail } from '../../../services/api'

interface GraphNode {
  id: string
  title: string
  val: number
  x?: number
  y?: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
}

interface NoteGraphMiniProps {
  notes: NoteSummary[]
  onClose: () => void
  onExpand: () => void
}

const COLORS = {
  bg: 'transparent',
  node: '#8b5cf6',
  nodeDimmed: '#2a2a30',
  nodeText: '#e5e5e8',
  link: '#3a3a45',
  linkHighlight: '#8b5cf6'
}

export default function NoteGraphMini({ notes, onClose, onExpand }: NoteGraphMiniProps) {
  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: []
  })
  const [dimensions, setDimensions] = useState({ width: 280, height: 220 })
  const [highlightNode, setHighlightNode] = useState<string | null>(null)

  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setDimensions({ width: rect.width, height: rect.height })
    }
  }, [])

  const parseWikiLinks = useCallback((content: string): string[] => {
    const links: string[] = []
    const regex = /\[\[(.+?)\]\]/g
    let match
    while ((match = regex.exec(content)) !== null) {
      links.push(match[1].trim())
    }
    return links
  }, [])

  useEffect(() => {
    const fetchGraph = async () => {
      const nodesMap = new Map<string, GraphNode>()
      const links: GraphLink[] = []

      notes.forEach((note) => {
        nodesMap.set(note.id, { id: note.id, title: note.title || 'Untitled', val: 1 })
      })

      for (const note of notes) {
        let content = ''
        try {
          if (window.api?.notes?.get) {
            const detail = (await window.api.notes.get(note.id)) as NoteDetail
            content = detail?.content || ''
          }
        } catch { content = '' }

        const wikiLinks = parseWikiLinks(content)
        wikiLinks.forEach((linkTitle) => {
          const target = notes.find(
            (n) => n.title?.toLowerCase() === linkTitle.toLowerCase()
          )
          if (target && target.id !== note.id) {
            links.push({ source: note.id, target: target.id })
          }
        })
      }

      setGraphData({ nodes: Array.from(nodesMap.values()), links })
    }
    fetchGraph()
  }, [notes, parseWikiLinks])

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setHighlightNode((prev) => (prev === node.id ? null : node.id))
    },
    []
  )

  const handleBackgroundClick = useCallback(() => {
    setHighlightNode(null)
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="bg-card border border-border/20 rounded-xl shadow-2xl overflow-hidden">
        {/* Mini Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/10 bg-bg/80">
          <div className="flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Grafo
            </span>
            <span className="text-[9px] text-text-muted/30">
              {graphData.nodes.length}n · {graphData.links.length}c
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onExpand}
              className="p-1 text-text-muted/50 hover:text-accent hover:bg-accent/10 rounded transition-all"
              title="Expandir grafo"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-text-muted/50 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
              title="Fechar"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Graph Canvas */}
        <div ref={containerRef} className="w-[280px] h-[220px] relative">
          {graphData.nodes.length > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              nodeLabel=""
              nodeColor={(node: GraphNode) =>
                highlightNode && highlightNode !== node.id ? COLORS.nodeDimmed : COLORS.node
              }
              nodeRelSize={2}
              linkColor={() => COLORS.link}
              linkWidth={0.5}
              linkDirectionalParticles={0}
              backgroundColor={COLORS.bg}
              onNodeClick={handleNodeClick}
              onBackgroundClick={handleBackgroundClick}
              width={280}
              height={220}
              minZoom={0.3}
              maxZoom={1.5}
              cooldownTicks={50}
              d3AlphaDecay={0.03}
              d3VelocityDecay={0.3}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted/30">
              <span className="text-[10px]">Sem conexões</span>
            </div>
          )}

          {/* Mini zoom controls */}
          <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-card/80 border border-border/20 rounded-lg p-0.5">
            <button
              onClick={() => graphRef.current?.zoom(graphRef.current.zoom() * 1.3, 200)}
              className="p-0.5 text-text-muted/50 hover:text-text hover:bg-white/5 rounded transition-all"
              title="Zoom in"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              onClick={() => graphRef.current?.zoom(graphRef.current.zoom() / 1.3, 200)}
              className="p-0.5 text-text-muted/50 hover:text-text hover:bg-white/5 rounded transition-all"
              title="Zoom out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire up in NotesView**

In `NotesView.tsx`:
1. Import `NoteGraphMini`
2. Add `setShowGraph` handler distinction — separate state for mini vs full graph:
   - `showGraph`: boolean — toggles mini-graph
   - `showFullGraph`: boolean — toggles full-screen NoteGraphView (shown when clicking expand in mini)

Or simpler: same `showGraph` boolean, but when mini-graph's expand is clicked, close mini and open full.

```tsx
// Replace current graph rendering (line 625):
{/* {showGraph && <NoteGraphView notes={notes} onClose={() => setShowGraph(false)} />} */}

{showFullGraph && (
  <NoteGraphView notes={notes} onClose={() => setShowFullGraph(false)} />
)}

{showGraph && !showFullGraph && (
  <NoteGraphMini
    notes={notes}
    onClose={() => setShowGraph(false)}
    onExpand={() => {
      setShowFullGraph(true)
    }}
  />
)}
```

And add state:
```tsx
const [showFullGraph, setShowFullGraph] = useState(false)
```

Change the toolbar's `onShowGraph` to toggle mini-graph:
```tsx
onShowGraph={() => {
  setShowGraph(true)
  setShowFullGraph(false)
}}
```

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck:web
pnpm test -- --run src/renderer/src/features/notes/
```

Expected: typecheck passes, existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/momai/src/renderer/src/features/notes/components/NoteGraphMini.tsx apps/momai/src/renderer/src/features/notes/NotesView.tsx
git commit -m "feat(notes): mini graph widget in bottom-right corner with expand option"
```

---
### Task 8: Graph Responsiveness — Zoom buttons and labels

**Files:**
- Modify: `apps/momai/src/renderer/src/features/notes/components/NoteGraphView.tsx`

**Interfaces:**
- Consumes: existing `NoteGraphViewProps`
- Produces: same interface, smaller control elements

- [ ] **Step 1: Reduce zoom button sizes**

In `NoteGraphView.tsx`, reduce zoom button padding and icon sizes:

```tsx
<div className="flex items-center gap-1.5">
  <button
    onClick={zoomIn}
    className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
    title="Zoom In"
  >
    <ZoomIn className="w-3.5 h-3.5" />
  </button>
  <button
    onClick={zoomOut}
    className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
    title="Zoom Out"
  >
    <ZoomOut className="w-3.5 h-3.5" />
  </button>
  <button
    onClick={resetZoom}
    className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
    title="Reset View"
  >
    <Maximize2 className="w-3.5 h-3.5" />
  </button>
</div>
```

- [ ] **Step 2: Reduce node label font size**

In the `nodeCanvasObject` function, change:
```tsx
const fontSize = 10 / globalScale  // was 12
```

- [ ] **Step 3: Compact legend text**

In the legend section:
```tsx
<div className="absolute bottom-4 left-4 bg-card border border-border/40 rounded-lg px-3 py-2 text-[10px] z-[20] shadow-xl">
```

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck:web
```

Expected: typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/features/notes/components/NoteGraphView.tsx
git commit -m "feat(notes): responsive graph controls, smaller zoom buttons and labels"
```
