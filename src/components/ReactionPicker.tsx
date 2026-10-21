import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { EMOJI_CATEGORIES, isFlagEmoji, getEmojiTwemojiUrl } from '../data/emojis'

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

const RECENT_REACTIONS_KEY = 'momai_whatsapp_recent_reactions'

export interface ReactionPickerProps {
  x: number
  y: number
  currentReaction?: string
  onSelectReaction: (emoji: string) => void
  onClose: () => void
}

const renderCategoryIcon = (id: string) => {
  switch (id) {
    case 'smileys':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
          <circle cx="12" cy="12" r="9" />
          <circle cx="9" cy="10" r="1" fill="currentColor" />
          <circle cx="15" cy="10" r="1" fill="currentColor" />
          <path d="M8 14.5a5 5 0 0 0 8 0" strokeLinecap="round" />
        </svg>
      )
    case 'animals':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
          <circle cx="7" cy="8" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17" cy="8" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="10" cy="5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="14" cy="5" r="1.5" fill="currentColor" stroke="none" />
          <path d="M7 14c0-3 2.5-4 5-4s5 1 5 4-2 6-5 6-5-3-5-6z" />
        </svg>
      )
    case 'food':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      )
    case 'activities':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 9 9" />
          <path d="M12 21a9 9 0 0 1-9-9" />
          <path d="M3 12h18" />
          <path d="M12 3v18" />
        </svg>
      )
    case 'travel':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
          <path d="M5 17h14v-5l-2-4H7l-2 4v5z" />
          <circle cx="7.5" cy="17.5" r="2.5" />
          <circle cx="16.5" cy="17.5" r="2.5" />
        </svg>
      )
    case 'objects':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 5.5v1.5h8v-1.5c1.5-1 3-3 3-5.5a7 7 0 0 0-7-7z" />
        </svg>
      )
    case 'symbols':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
          <path d="M7 11.5a4.5 4.5 0 1 1 9 0c0 3-4.5 6.5-4.5 6.5S7 14.5 7 11.5z" />
        </svg>
      )
    case 'flags':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      )
    default:
      return <span>😃</span>
  }
}

export default function ReactionPicker({
  x,
  y,
  currentReaction,
  onSelectReaction,
  onClose
}: ReactionPickerProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [showExtended, setShowExtended] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('smileys')
  const [recentEmojis, setRecentEmojis] = useState<string[]>([])
  const [pos, setPos] = useState({ top: y, left: x })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_REACTIONS_KEY)
      if (saved) setRecentEmojis(JSON.parse(saved))
    } catch {}
  }, [])

  const handleSelect = (emoji: string) => {
    try {
      const nextRecent = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 24)
      setRecentEmojis(nextRecent)
      localStorage.setItem(RECENT_REACTIONS_KEY, JSON.stringify(nextRecent))
    } catch {}
    onSelectReaction(emoji)
  }

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const padding = 12

    let adjustedX = x
    let adjustedY = y

    if (showExtended) {
      adjustedX = Math.max(padding, Math.min(x - 140, window.innerWidth - 340 - padding))
      adjustedY = Math.max(padding, Math.min(y - 180, window.innerHeight - 380 - padding))
    } else {
      if (adjustedX + rect.width > window.innerWidth - padding) {
        adjustedX = Math.max(padding, window.innerWidth - rect.width - padding)
      }
      if (adjustedX < padding) {
        adjustedX = padding
      }
      if (adjustedY < padding) {
        adjustedY = padding + 40
      } else if (adjustedY + rect.height > window.innerHeight - padding) {
        adjustedY = Math.max(padding, window.innerHeight - rect.height - padding)
      }
    }

    setPos({ top: adjustedY, left: adjustedX })
  }, [x, y, showExtended])

  useEffect(() => {
    let active = true

    const handleClickOutside = (event: MouseEvent) => {
      if (!active) return
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const timer = setTimeout(() => {
      if (!active) return
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }, 50)

    return () => {
      active = false
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('contextmenu', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase().trim()
    const results: { emoji: string; name: string }[] = []
    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (
          item.name.toLowerCase().includes(q) ||
          item.keywords.some((k) => k.toLowerCase().includes(q))
        ) {
          results.push(item)
        }
      }
    }
    return results
  }, [search])

  const scrollToCategory = (catId: string) => {
    setActiveCategory(catId)
    setSearch('')
    const target = categoryRefs.current[catId]
    if (target && scrollAreaRef.current) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const content = (
    <div
      ref={containerRef}
      className={`fixed z-[9999] select-none flex flex-col bg-card/95 backdrop-blur-md border border-border/80 shadow-2xl animate-in fade-in zoom-in-95 duration-100 ${
        showExtended ? 'w-[340px] h-[380px] rounded-2xl p-2.5 overflow-hidden' : 'p-1.5 rounded-full'
      }`}
      style={{
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Barra de Reações Rápidas */}
      <div className="flex items-center gap-1 justify-between shrink-0">
        <div className="flex items-center gap-1">
          {QUICK_REACTIONS.map((emoji) => {
            const isSelected = currentReaction === emoji
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelect(emoji)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all duration-150 ${
                  isSelected ? 'bg-accent/20 ring-1 ring-accent' : 'hover:bg-card-hover'
                }`}
                title={emoji}
                aria-label={emoji}
              >
                {emoji}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowExtended((prev) => !prev)}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-text-muted hover:text-text hover:bg-card-hover transition-colors cursor-pointer ml-1 ${
            showExtended ? 'bg-card-hover text-accent' : ''
          }`}
          title={showExtended ? 'Menos reações' : 'Mais emojis'}
          aria-label={showExtended ? 'Menos reações' : 'Mais emojis'}
        >
          {showExtended ? (
            <XMarkIcon className="w-4 h-4" />
          ) : (
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </button>
      </div>

      {/* Painel Estendido Estilo MediaPicker */}
      {showExtended && (
        <div className="flex flex-col flex-1 min-h-0 pt-2 border-t border-border/40 mt-2">
          {/* Campo de Busca */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-input border border-border/50 text-xs shrink-0 mb-1.5">
            <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar emoji..."
              className="w-full bg-transparent text-text placeholder:text-text-muted/60 focus:outline-none text-xs"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-text-muted hover:text-text"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Categorias */}
          {!search && (
            <div className="flex items-center justify-between gap-1 pb-1.5 overflow-x-auto custom-scrollbar shrink-0 border-b border-border/30 mb-1">
              {recentEmojis.length > 0 && (
                <button
                  type="button"
                  onClick={() => scrollToCategory('recent')}
                  className={`p-1.5 rounded-lg text-sm hover:bg-input transition-all cursor-pointer ${
                    activeCategory === 'recent' ? 'text-accent border-b-2 border-accent' : 'text-text-muted'
                  }`}
                  title="Recentes"
                >
                  <ClockIcon className="w-3.5 h-3.5" />
                </button>
              )}
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => scrollToCategory(cat.id)}
                  className={`p-1 rounded-lg hover:bg-input transition-all cursor-pointer ${
                    activeCategory === cat.id ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'
                  }`}
                  title={cat.name}
                >
                  {renderCategoryIcon(cat.id)}
                </button>
              ))}
            </div>
          )}

          {/* Grid de Emojis */}
          <div
            ref={scrollAreaRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar pr-0.5 space-y-2.5"
          >
            {filteredEmojis ? (
              <div>
                <p className="text-[10px] font-semibold text-text-muted mb-1 px-1">
                  Resultados ({filteredEmojis.length})
                </p>
                {filteredEmojis.length === 0 ? (
                  <p className="text-xs text-text-muted/70 py-6 text-center">
                    Nenhum emoji encontrado
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '3px' }}>
                    {filteredEmojis.map((item, idx) => (
                      <button
                        key={`${item.emoji}-${idx}`}
                        type="button"
                        onClick={() => handleSelect(item.emoji)}
                        className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-input transition-transform hover:scale-125 cursor-pointer"
                        title={item.name}
                      >
                        {isFlagEmoji(item.emoji) ? (
                          <img
                            src={getEmojiTwemojiUrl(item.emoji)}
                            alt={item.name}
                            className="w-5 h-5 object-contain pointer-events-none"
                            loading="lazy"
                          />
                        ) : (
                          item.emoji
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {recentEmojis.length > 0 && (
                  <div ref={(el) => { categoryRefs.current['recent'] = el }}>
                    <p className="text-[10px] font-semibold text-text-muted mb-1 px-1 flex items-center gap-1">
                      <ClockIcon className="w-3 h-3 text-text-muted" />
                      Recentes
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '3px' }}>
                      {recentEmojis.map((emoji, idx) => (
                        <button
                          key={`${emoji}-${idx}`}
                          type="button"
                          onClick={() => handleSelect(emoji)}
                          className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-input transition-transform hover:scale-125 cursor-pointer"
                        >
                          {isFlagEmoji(emoji) ? (
                            <img
                              src={getEmojiTwemojiUrl(emoji)}
                              alt="flag"
                              className="w-5 h-5 object-contain pointer-events-none"
                              loading="lazy"
                            />
                          ) : (
                            emoji
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {EMOJI_CATEGORIES.map((cat) => (
                  <div
                    key={cat.id}
                    ref={(el) => { categoryRefs.current[cat.id] = el }}
                  >
                    <p className="text-[10px] font-semibold text-text-muted mb-1 px-1">
                      {cat.name}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '3px' }}>
                      {cat.emojis.map((item, idx) => (
                        <button
                          key={`${item.emoji}-${idx}`}
                          type="button"
                          onClick={() => handleSelect(item.emoji)}
                          className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-input transition-transform hover:scale-125 cursor-pointer"
                          title={item.name}
                        >
                          {isFlagEmoji(item.emoji) ? (
                            <img
                              src={getEmojiTwemojiUrl(item.emoji)}
                              alt={item.name}
                              className="w-5 h-5 object-contain pointer-events-none"
                              loading="lazy"
                            />
                          ) : (
                            item.emoji
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
