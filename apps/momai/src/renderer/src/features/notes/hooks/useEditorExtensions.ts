import { useMemo, useRef, useState } from 'react'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorView, Decoration, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { languages } from '@codemirror/language-data'
import type { Range } from '@codemirror/state'

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
    const mutedColor = 'rgb(var(--text-muted))'
    return HighlightStyle.define([
      { tag: tags.heading1, class: 'cm-h1' },
      { tag: tags.heading2, class: 'cm-h2' },
      { tag: tags.heading3, class: 'cm-h3' },
      { tag: tags.heading4, class: 'cm-h4' },
      { tag: tags.heading5, class: 'cm-h5' },
      { tag: tags.heading6, class: 'cm-h6' },
      { tag: tags.strong, fontWeight: '700', color: textColor },
      { tag: tags.emphasis, fontStyle: 'italic', color: textColor },
      {
        tag: tags.strikethrough,
        textDecoration: 'line-through',
        color: mutedColor,
        opacity: '0.7'
      },
      { tag: tags.quote, color: mutedColor, fontStyle: 'italic' },
      {
        tag: tags.monospace,
        color: accentColor,
        backgroundColor: 'rgb(var(--accent) / 0.1)',
        borderRadius: '4px',
        padding: '1px 4px'
      },
      { tag: tags.list, class: 'cm-list-marker' },
      { tag: tags.atom, class: 'cm-checkbox' },
      { tag: tags.link, textDecoration: 'underline', color: accentColor, opacity: '0.9' },
      { tag: tags.url, textDecoration: 'underline', opacity: '0.5' },
      { tag: tags.tagName, class: 'cm-wiki-link' },
      { tag: tags.keyword, color: accentColor, fontWeight: '600' },
      { tag: tags.variableName, color: textColor },
      { tag: tags.definition(tags.variableName), color: accentColor, fontWeight: '600' },
      { tag: tags.definition(tags.propertyName), color: accentColor },
      { tag: tags.angleBracket, opacity: '0.5' },
      { tag: tags.contentSeparator, color: mutedColor }
    ])
  }, [])

  const handleSelectSlashCommand = (snippet: string) => {
    if (!slashMenu || !editorViewRef.current) return
    const view = editorViewRef.current
    const { pos, query } = slashMenu
    const transaction = view.state.update({
      changes: { from: pos, to: pos + 1 + query.length, insert: snippet },
      selection: { anchor: pos + snippet.length }
    })
    view.dispatch(transaction)
    view.focus()
    setSlashMenu(null)
  }

  const editorExtensions = useMemo(
    () => [
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        addKeymap: true
      }),
      syntaxHighlighting(markdownHighlighting),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          backgroundColor: 'transparent !important',
          height: '100%'
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
          fontFamily: "'Inter', sans-serif",
          fontSize: '16px',
          lineHeight: '1.7',
          overflow: 'auto',
          padding: '20px 2rem'
        },
        '.cm-content': {
          color: 'rgb(var(--text-primary))',
          caretColor: 'rgb(var(--text-primary)) !important',
          backgroundColor: 'transparent !important',
          padding: '0 !important'
        },
        '.cm-line': { padding: '2px 0' },
        '.cm-strong': {
          fontWeight: '700 !important',
          color: 'rgb(var(--text-primary)) !important'
        },
        '.cm-emphasis': {
          fontStyle: 'italic !important',
          color: 'rgb(var(--text-primary)) !important'
        },
        '.cm-strikethrough': {
          textDecoration: 'line-through !important',
          color: 'rgb(var(--text-muted)) !important',
          opacity: '0.7'
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
        '.cm-h5': {
          fontSize: '1em !important',
          fontWeight: '500 !important',
          fontFamily: "'Outfit', sans-serif",
          color: 'rgb(var(--text-muted))'
        },
        '.cm-h6': {
          fontSize: '0.9em !important',
          fontWeight: '500 !important',
          fontFamily: "'Outfit', sans-serif",
          color: 'rgb(var(--text-muted))'
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
          width: '100%',
          color: 'rgb(var(--text-muted))',
          fontStyle: 'italic'
        },
        '.cm-hr': {
          borderTop: '1px solid rgb(var(--border) / 0.3)',
          margin: '1em 0',
          display: 'block'
        },
        '.cm-table': { borderCollapse: 'collapse', width: '100%', margin: '1em 0' },
        '.cm-table-cell': { border: '1px solid rgb(var(--border) / 0.2)', padding: '0.5em 0.75em' },
        '.cm-table-header': { fontWeight: '600', backgroundColor: 'rgb(var(--accent) / 0.05)' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
          backgroundColor: 'rgb(var(--accent) / 0.2) !important'
        },
        '.cm-cursor': {
          borderLeftColor: 'rgb(var(--text-primary)) !important',
          borderLeftWidth: '2px'
        },
        '.cm-activeLine': { backgroundColor: 'transparent' },
        '.cm-gutters': { display: 'none' },
        '.cm-wiki-link': {
          color: 'rgb(var(--accent)) !important',
          backgroundColor: 'rgb(var(--accent) / 0.15)',
          borderRadius: '4px',
          padding: '1px 4px',
          textDecoration: 'none',
          cursor: 'pointer'
        },
        '.cm-wiki-link:hover': { backgroundColor: 'rgb(var(--accent) / 0.25)' },
        '.cm-bold-italic': { fontWeight: '700', fontStyle: 'italic', color: 'rgb(var(--accent))' },
        '.cm-highlight': {
          backgroundColor: 'rgb(var(--accent) / 0.2)',
          padding: '1px 4px',
          borderRadius: '3px'
        },
        '.cm-link': {
          color: 'rgb(var(--accent)) !important',
          textDecoration: 'underline !important'
        },
        '.cm-url': { color: 'rgb(var(--text-muted)) !important', opacity: '0.6' },
        '.cm-code': {
          color: 'rgb(var(--accent)) !important',
          backgroundColor: 'rgb(var(--accent) / 0.1) !important',
          borderRadius: '3px',
          padding: '1px 4px',
          fontFamily: 'monospace'
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
        '.cm-checkbox-checked': { color: 'rgb(var(--accent)) !important' },
        '.cm-md-hidden': {
          opacity: '0 !important',
          width: '0 !important',
          display: 'inline-block !important',
          overflow: 'hidden !important',
          fontSize: '0 !important',
          lineHeight: '0 !important',
          height: '0 !important',
          margin: '0 !important',
          padding: '0 !important'
        },
        '.cm-activeLine .cm-md-hidden': {
          opacity: '0 !important',
          width: '0 !important',
          display: 'inline-block !important',
          overflow: 'hidden !important',
          fontSize: '0 !important',
          lineHeight: '0 !important',
          height: '0 !important',
          margin: '0 !important',
          padding: '0 !important'
        },
        '.cm-wiki-bracket-hidden': {
          opacity: '0.4 !important',
          color: 'var(--accent, #818cf8)'
        }
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
                setSlashMenu({ x: coords.left, y: coords.bottom + 8, query, pos: slashPos })
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
            this.decorations = this.buildDecorations(view)
          }
          update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet || update.viewportChanged) {
              this.decorations = this.buildDecorations(update.view)
            }
          }
          buildDecorations(view: EditorView) {
            const decos: Range<Decoration>[] = []
            const doc = view.state.doc
            const activeLineNo = doc.lineAt(view.state.selection.main.head).number

            for (let i = 1; i <= doc.lines; i++) {
              const line = doc.line(i)
              const text = line.text
              const isActive = i === activeLineNo
              const cursorPos = view.state.selection.main.head
              const from = line.from
              const cursorNear = (p: number, margin = 3) => Math.abs(cursorPos - p) <= margin

              const wikiFrom = line.from
              const wikiMatches = [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
              for (const m of wikiMatches) {
                const s = m.index!
                const linkStart = wikiFrom + s
                const linkEnd = wikiFrom + s + m[0].length
                const cursorInside = cursorPos >= linkStart && cursorPos <= linkEnd
                if (!cursorInside) {
                  // Hide [[
                  decos.push(Decoration.replace({}).range(wikiFrom + s, wikiFrom + s + 2))
                  // Style link text
                  decos.push(
                    Decoration.mark({ class: 'cm-wiki-link' }).range(
                      wikiFrom + s + 2,
                      wikiFrom + s + m[0].length - 2
                    )
                  )
                  // Hide ]]
                  const e = s + m[0].length - 2
                  decos.push(Decoration.replace({}).range(wikiFrom + e, wikiFrom + e + 2))
                } else {
                  // Cursor is inside: show full [[link]] with styling
                  decos.push(Decoration.mark({ class: 'cm-wiki-link' }).range(linkStart, linkEnd))
                }
              }

              const linkMatches = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
              for (const m of linkMatches) {
                const s = m.index!
                const linkStart = line.from + s
                const linkEnd = line.from + s + m[0].length
                const cursorInside = cursorPos >= linkStart && cursorPos <= linkEnd
                if (!cursorInside) {
                  decos.push(
                    Decoration.mark({ class: 'cm-md-hidden' }).range(linkStart, linkStart + 1)
                  )
                  const be = linkStart + 1 + m[1].length
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(be, be + 1))
                  const ps = be + 1
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(ps, ps + 1))
                  const pe = linkEnd - 1
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(pe, pe + 1))
                }
              }

              const hashes = text.match(/^(#{1,6})(\s)/)
              if (hashes && !isActive) {
                decos.push(
                  Decoration.mark({ class: 'cm-md-hidden' }).range(from, from + hashes[1].length)
                )
              }

              const quote = text.match(/^(\s*>)(\s)/)
              if (quote && !isActive) {
                decos.push(
                  Decoration.mark({ class: 'cm-md-hidden' }).range(from, from + quote[1].length)
                )
              }

              const bullet = text.match(/^(\s*)([-*+])(\s)/)
              if (bullet) {
                const markerStart = from + bullet[1].length
                decos.push(
                  Decoration.mark({ class: 'cm-bullet-conceal' }).range(
                    markerStart,
                    markerStart + bullet[2].length
                  )
                )
              }

              const checkbox = text.match(/^(\s*)([-*+])(\s)(\[[ xX]\])(\s)/)
              if (checkbox) {
                const cbStart = from + checkbox[1].length + checkbox[2].length + checkbox[3].length
                const isChecked = checkbox[4].toLowerCase() === '[x]'
                decos.push(
                  Decoration.mark({
                    class: isChecked ? 'cm-checkbox cm-checkbox-checked' : 'cm-checkbox'
                  }).range(cbStart, cbStart + checkbox[4].length)
                )
              }

              const hr = text.match(/^(\s*)([-*_]{3,})(\s*)$/)
              if (hr) {
                decos.push(Decoration.line({ class: 'cm-hr' }).range(line.from, line.from))
                if (!isActive && line.from < line.to) {
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(line.from, line.to))
                }
              }

              const boldMatches = [...text.matchAll(/\*\*(.+?)\*\*/g)]
              for (const m of boldMatches) {
                const s = from + m.index!
                const e = s + m[0].length
                const cursorInside = cursorPos >= s && cursorPos <= e
                if (!isActive || !(cursorInside || cursorNear(s) || cursorNear(e))) {
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(s, s + 2))
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(e - 2, e))
                }
              }

              const underscoreBoldMatches = [...text.matchAll(/__(.+?)__/g)]
              for (const m of underscoreBoldMatches) {
                const s = from + m.index!
                const e = s + m[0].length
                const cursorInside = cursorPos >= s && cursorPos <= e
                if (!isActive || !(cursorInside || cursorNear(s) || cursorNear(e))) {
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(s, s + 2))
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(e - 2, e))
                }
              }

              const italicMatches = [...text.matchAll(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g)]
              for (const m of italicMatches) {
                const s = from + m.index!
                const e = s + m[0].length
                const cursorInside = cursorPos >= s && cursorPos <= e
                if (!isActive || !(cursorInside || cursorNear(s) || cursorNear(e))) {
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(s, s + 1))
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(e - 1, e))
                }
              }

              const underscoreItalicMatches = [...text.matchAll(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g)]
              for (const m of underscoreItalicMatches) {
                const s = from + m.index!
                const e = s + m[0].length
                const cursorInside = cursorPos >= s && cursorPos <= e
                if (!isActive || !(cursorInside || cursorNear(s) || cursorNear(e))) {
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(s, s + 1))
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(e - 1, e))
                }
              }

              const strikeMatches = [...text.matchAll(/~~(.+?)~~/g)]
              for (const m of strikeMatches) {
                const s = from + m.index!
                const e = s + m[0].length
                const cursorInside = cursorPos >= s && cursorPos <= e
                if (!isActive || !(cursorInside || cursorNear(s) || cursorNear(e))) {
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(s, s + 2))
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(e - 2, e))
                }
              }

              const codeMatches = [...text.matchAll(/`(.+?)`/g)]
              for (const m of codeMatches) {
                const s = from + m.index!
                const e = s + m[0].length
                const cursorInside = cursorPos >= s && cursorPos <= e
                if (!isActive || !(cursorInside || cursorNear(s) || cursorNear(e))) {
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(s, s + 1))
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(e - 1, e))
                }
              }

              const highlightMatches = [...text.matchAll(/==(.+?)==/g)]
              for (const m of highlightMatches) {
                const s = from + m.index!
                const e = s + m[0].length
                const cursorInside = cursorPos >= s && cursorPos <= e
                if (!isActive || !(cursorInside || cursorNear(s) || cursorNear(e))) {
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(s, s + 2))
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(e - 2, e))
                }
              }

              const boldItalicMatches = [...text.matchAll(/\*\*\*(.+?)\*\*\*/g)]
              for (const m of boldItalicMatches) {
                const s = from + m.index!
                const e = s + m[0].length
                const cursorInside = cursorPos >= s && cursorPos <= e
                if (!isActive || !(cursorInside || cursorNear(s) || cursorNear(e))) {
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(s, s + 3))
                  decos.push(Decoration.mark({ class: 'cm-md-hidden' }).range(e - 3, e))
                }
              }
            }

            // CodeMirror RangeSet requires decorations to be strictly sorted by range position
            decos.sort((a: any, b: any) => {
              if (a.from !== b.from) return a.from - b.from
              return (a.value?.startSide || 0) - (b.value?.startSide || 0)
            })

            return Decoration.set(decos, true)
          }
        },
        { decorations: (v) => v.decorations }
      )
    ],
    [markdownHighlighting]
  )

  return { editorViewRef, slashMenu, setSlashMenu, editorExtensions, handleSelectSlashCommand }
}
