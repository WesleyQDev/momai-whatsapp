import React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, Decoration, MatchDecorator, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { useI18n } from '../../../i18n'
import SlashCommandMenu from '../../../components/notes/SlashCommandMenu'

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
  editorViewRef: React.MutableRefObject<EditorView | null>
  titleInputRef: React.RefObject<HTMLInputElement | null>
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onSelectSlashCommand: (snippet: string) => void
  onCloseSlashMenu: () => void
  editorExtensions: any[]
}

export default function NoteEditor({
  title,
  content,
  isLoading,
  isSaving,
  activeId,
  slashMenu,
  editorViewRef,
  titleInputRef,
  onTitleChange,
  onContentChange,
  onSelectSlashCommand,
  onCloseSlashMenu,
  editorExtensions
}: NoteEditorProps) {
  const { t } = useI18n()

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
    <div className="flex-1 overflow-y-auto custom-scrollbar w-full">
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
}
