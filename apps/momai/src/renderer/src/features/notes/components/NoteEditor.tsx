import React, { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import {
  EditorView,
  Decoration,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  keymap
} from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { useI18n } from '../../../i18n'
import SlashCommandMenu from '../../../components/notes/SlashCommandMenu'
import WikiLinkDropdown from './WikiLinkDropdown'
import type { WikiMenuState } from '../hooks/useWikiLinkAutocomplete'
import type { NoteSummary } from '../../../services/api'

interface SlashMenuState {
  x: number
  y: number
  query: string
  pos: number
}

interface NoteEditorProps {
  title: string
  content: string
  isLoading: boolean
  isSaving: boolean
  activeId: string | null
  slashMenu: SlashMenuState | null
  wikiMenu: WikiMenuState | null
  notes: NoteSummary[]
  editorViewRef: React.MutableRefObject<EditorView | null>
  titleInputRef: React.RefObject<HTMLInputElement | null>
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onSelectSlashCommand: (snippet: string) => void
  onCloseSlashMenu: () => void
  onSelectWikiLink: (title: string) => string | undefined
  onCloseWikiMenu: () => void
  editorExtensions: any[]
  maxChars?: number
}

export default function NoteEditor({
  title,
  content,
  isLoading,
  isSaving,
  activeId,
  slashMenu,
  wikiMenu,
  notes,
  editorViewRef,
  titleInputRef,
  onTitleChange,
  onContentChange,
  onSelectSlashCommand,
  onCloseSlashMenu,
  onSelectWikiLink,
  onCloseWikiMenu,
  editorExtensions,
  maxChars
}: NoteEditorProps) {
  const { t } = useI18n()

  /* eslint-disable react-hooks/refs */
  const arrowUpKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: 'ArrowUp',
          run: (view) => {
            const { head } = view.state.selection.main
            const line = view.state.doc.lineAt(head)
            if (line.number === 1) {
              const input = titleInputRef.current
              if (input) {
                input.focus()
                const len = input.value.length
                input.setSelectionRange(len, len)
              }
              return true
            }
            return false
          }
        }
      ]),
    []
  )
  /* eslint-enable react-hooks/refs */

  const allExtensions = useMemo(
    () => [...editorExtensions, arrowUpKeymap],
    [editorExtensions, arrowUpKeymap]
  )

  if (!activeId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center opacity-10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-20 h-20 mb-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <span className="text-[10px] font-black uppercase tracking-[0.5em]">
          {t('notes.emptySelect')}
        </span>
      </div>
    )
  }

  return (
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
        {wikiMenu && (
          <WikiLinkDropdown
            x={wikiMenu.x}
            y={wikiMenu.y}
            query={wikiMenu.query}
            notes={notes}
            onSelect={(title) => {
              const insertText = onSelectWikiLink(title)
              if (insertText && editorViewRef.current) {
                const view = editorViewRef.current
                const transaction = view.state.update({
                  changes: {
                    from: wikiMenu.pos + 2,
                    to: wikiMenu.pos + 2 + wikiMenu.query.length,
                    insert: insertText
                  },
                  selection: { anchor: wikiMenu.pos + 2 + insertText.length }
                })
                view.dispatch(transaction)
                view.focus()
              }
            }}
            onClose={onCloseWikiMenu}
          />
        )}
        <div className="px-8 pt-6 pb-0">
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
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                const view = editorViewRef.current
                if (view) {
                  view.focus()
                  view.dispatch({
                    selection: { anchor: 0 }
                  })
                }
              }
            }}
            placeholder={t('notes.untitled')}
            className="w-full bg-transparent text-3xl font-bold text-text outline-none placeholder:text-text-muted/20 border-none"
          />
          <div className="h-px bg-border/15 w-full mt-3 mb-4"></div>
        </div>
        <CodeMirror
          value={content}
          onChange={(value) => onContentChange(value)}
          extensions={allExtensions}
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
        {maxChars && (
          <div className="px-8 pb-3">
            <div className="flex items-center justify-end gap-2">
              <div className="h-1 w-24 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (content.length / maxChars) * 100)}%`,
                    backgroundColor:
                      content.length > maxChars * 0.9
                        ? 'rgb(var(--warning) / 0.7)'
                        : 'rgb(var(--accent) / 0.5)'
                  }}
                />
              </div>
              <span
                className={`text-[10px] font-mono ${content.length > maxChars ? 'text-red-400' : 'text-text-muted/40'}`}
              >
                {content.length}/{maxChars}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
