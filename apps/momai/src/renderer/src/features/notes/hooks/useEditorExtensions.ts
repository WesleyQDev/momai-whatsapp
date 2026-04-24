import { useMemo, useRef, useState } from 'react'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, Decoration, MatchDecorator, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export interface SlashMenuState {
  x: number
  y: number
  query: string
  pos: number
}

export function useEditorExtensions() {
  const editorViewRef = useRef<EditorView | null>(null)
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null)

  const markdownHighlighting = useMemo(() => {
    const textColor = 'rgb(var(--text-primary))'
    const accentColor = 'rgb(var(--accent))'
    return HighlightStyle.define([
      { tag: tags.heading1, class: 'cm-h1' },
      { tag: tags.heading2, class: 'cm-h2' },
      { tag: tags.heading3, class: 'cm-h3' },
      { tag: tags.heading4, class: 'cm-h4' },
      { tag: tags.strong, fontWeight: '700', color: textColor },
      { tag: tags.emphasis, fontStyle: 'italic' },
      { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.6' },
      { tag: tags.quote, color: 'rgb(var(--text-muted))', fontStyle: 'italic' },
      {
        tag: tags.monospace,
        color: accentColor,
        backgroundColor: 'rgb(var(--accent) / 0.1)',
        borderRadius: '4px',
        padding: '1px 4px'
      },
      {
        tag: [tags.processingInstruction, tags.punctuation, tags.meta, tags.modifier],
        class: 'cm-md-marker'
      },
      { tag: tags.list, class: 'cm-list-marker' },
      { tag: tags.atom, class: 'cm-checkbox' },
      { tag: tags.link, textDecoration: 'underline', color: accentColor, opacity: '0.9' },
      { tag: tags.url, textDecoration: 'underline', opacity: '0.5' }
    ])
  }, [])

  const handleSelectSlashCommand = (snippet: string) => {
    if (!slashMenu || !editorViewRef.current) return

    const view = editorViewRef.current
    const { pos, query } = slashMenu

    const transaction = view.state.update({
      changes: {
        from: pos,
        to: pos + 1 + query.length,
        insert: snippet
      },
      selection: {
        anchor: pos + snippet.length
      }
    })

    view.dispatch(transaction)
    view.focus()
    setSlashMenu(null)
  }

  const editorExtensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(markdownHighlighting),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          backgroundColor: 'transparent !important',
          height: '100%'
        },
        '&.cm-focused': {
          outline: 'none'
        },
        '.cm-scroller': {
          fontFamily: "'Inter', sans-serif",
          fontSize: '16px',
          lineHeight: '1.7',
          overflow: 'auto',
          padding: '20px 0'
        },
        '.cm-content': {
          color: 'rgb(var(--text-primary))',
          caretColor: 'rgb(var(--text-primary)) !important',
          backgroundColor: 'transparent !important',
          padding: '0 32px !important'
        },
        '.cm-line': {
          padding: '2px 0'
        },
        '.cm-line:not(.cm-activeLine) .cm-md-marker:not(.cm-list-marker):not(.cm-checkbox)': {
          display: 'none !important'
        },
        '.cm-activeLine .cm-md-marker': {
          display: 'inline !important',
          opacity: '0.4',
          marginRight: '0.1em'
        },
        '.cm-list-marker': {
          display: 'inline !important',
          color: 'rgb(var(--text-primary))',
          fontWeight: '400',
          marginRight: '-0.2em'
        },
        '.cm-bullet-conceal': {
          color: 'transparent !important',
          display: 'inline-block',
          width: '0.8em',
          textAlign: 'center',
          position: 'relative'
        },
        '.cm-bullet-conceal::after': {
          content: '"\u2022"',
          color: 'rgb(var(--text-primary))',
          position: 'absolute',
          left: '0',
          right: '0',
          textAlign: 'center',
          top: '-0.1em',
          fontSize: '1.2em'
        },
        '.cm-checkbox': {
          display: 'inline !important',
          color: 'rgb(var(--text-primary))',
          fontWeight: '400',
          fontFamily: 'monospace',
          marginRight: '-0.2em'
        },
        '.cm-h1': {
          fontSize: '1.8em !important',
          fontWeight: '700 !important',
          fontFamily: "'Outfit', sans-serif"
        },
        '.cm-h2': {
          fontSize: '1.5em !important',
          fontWeight: '600 !important',
          fontFamily: "'Outfit', sans-serif"
        },
        '.cm-h3': {
          fontSize: '1.25em !important',
          fontWeight: '600 !important',
          fontFamily: "'Outfit', sans-serif"
        },
        '.cm-h4': {
          fontSize: '1.1em !important',
          fontWeight: '500 !important',
          fontFamily: "'Outfit', sans-serif"
        },
        '.cm-line:not(.cm-activeLine) .cm-h1, .cm-line:not(.cm-activeLine) .cm-h2, .cm-line:not(.cm-activeLine) .cm-h3, .cm-line:not(.cm-activeLine) .cm-h4':
          {
            marginLeft: '-0.32em !important',
            display: 'inline-block'
          },
        '.cm-quote': {
          borderLeft: '3px solid rgb(var(--accent) / 0.3)',
          paddingLeft: '1rem',
          display: 'inline-block',
          width: '100%'
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
          backgroundColor: 'rgb(var(--accent) / 0.2) !important'
        },
        '.cm-cursor': {
          borderLeftColor: 'rgb(var(--text-primary)) !important',
          borderLeftWidth: '2px'
        },
        '.cm-activeLine': { backgroundColor: 'transparent' },
        '.cm-gutters': { display: 'none' }
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          const state = update.state
          const pos = state.selection.main.head
          const line = state.doc.lineAt(pos)
          const lineText = line.text.slice(0, pos - line.from)

          const match = lineText.match(/(?:^|\s)\/(\w*)$/)
          if (match) {
            const query = match[1]
            const slashPos = line.from + lineText.lastIndexOf('/')

            setTimeout(() => {
              const coords = update.view.coordsAtPos(pos)
              if (coords) {
                setSlashMenu({
                  x: coords.left,
                  y: coords.bottom + 8,
                  query,
                  pos: slashPos
                })
              }
            }, 0)
          } else {
            setSlashMenu(null)
          }
        }
      }),
      ViewPlugin.fromClass(
        class {
          decorations
          constructor(view: EditorView) {
            this.decorations = this.getDecorations(view)
          }
          update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet) {
              this.decorations = this.getDecorations(update.view)
            }
          }
          getDecorations(view: EditorView) {
            const decorator = new MatchDecorator({
              regexp: /(?<=^[ \t]*)[-*+]/gm,
              decoration: Decoration.mark({ class: 'cm-bullet-conceal' })
            })
            return decorator.createDeco(view)
          }
        },
        {
          decorations: (v) => v.decorations
        }
      )
    ],
    [markdownHighlighting]
  )

  return {
    editorViewRef,
    slashMenu,
    setSlashMenu,
    editorExtensions,
    handleSelectSlashCommand
  }
}
