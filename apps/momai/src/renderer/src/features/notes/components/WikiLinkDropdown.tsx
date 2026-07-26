import { useEffect, useState, useRef, useMemo } from 'react'
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
    return notes.filter((n) => n.title?.toLowerCase().includes(query.toLowerCase())).slice(0, 20)
  }, [notes, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((p) => (p + 1) % filteredNotes.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((p) => (p - 1 + filteredNotes.length) % filteredNotes.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredNotes[selectedIndex]) onSelect(filteredNotes[selectedIndex].title)
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
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
            <span className="text-xs truncate flex-1">{note.title || 'Untitled'}</span>
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
