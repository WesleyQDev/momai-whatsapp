import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ClockIcon,
  FaceSmileIcon
} from '@heroicons/react/24/outline'
import { StarIcon as SolidStarIcon } from '@heroicons/react/24/solid'
import { StarIcon as OutlineStarIcon } from '@heroicons/react/24/outline'
import { EMOJI_CATEGORIES, EmojiItem, isFlagEmoji, getEmojiTwemojiUrl } from '../data/emojis'
import { useI18n } from '../hooks/useI18n'
import { fetchTrendingGifs, searchGifs, GifItem } from '../services/tenorService'

interface MediaPickerProps {
  height?: number
  onSelectEmoji: (emoji: string) => void
  onSelectGif: (gifUrl: string) => void
  onSelectSticker: (stickerFilename: string) => void
  onClose: () => void
  getStickerUrl: (filename: string) => string
  stickers: string[]
  loadingStickers?: boolean
}

const RECENT_EMOJIS_KEY = 'momai_whatsapp_recent_emojis'
const RECENT_STICKERS_KEY = 'momai_whatsapp_recent_stickers'
const FAV_STICKERS_KEY = 'momai_whatsapp_favorite_stickers'

const renderCategoryIcon = (id: string, fallback: string) => {
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
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
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
      return <span>{fallback}</span>
  }
}

export default function MediaPicker({
  height = 400,
  onSelectEmoji,
  onSelectGif,
  onSelectSticker,
  onClose,
  getStickerUrl,
  stickers,
  loadingStickers = false
}: MediaPickerProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<'emoji' | 'gif' | 'sticker'>('emoji')
  const [emojiSearch, setEmojiSearch] = useState('')
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>('smileys')
  const [recentEmojis, setRecentEmojis] = useState<string[]>([])

  // Stickers state & categories
  const [stickerFilter, setStickerFilter] = useState<'all' | 'recents' | 'favorites'>('all')
  const [recentStickers, setRecentStickers] = useState<string[]>([])
  const [favoriteStickers, setFavoriteStickers] = useState<string[]>([])

  // GIFs state
  const [gifSearch, setGifSearch] = useState('')
  const [gifs, setGifs] = useState<GifItem[]>([])
  const [loadingGifs, setLoadingGifs] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)

  // Carregar dados locais (recentes e favoritos)
  useEffect(() => {
    try {
      const savedEmojis = localStorage.getItem(RECENT_EMOJIS_KEY)
      if (savedEmojis) setRecentEmojis(JSON.parse(savedEmojis))

      const savedRecentStickers = localStorage.getItem(RECENT_STICKERS_KEY)
      if (savedRecentStickers) setRecentStickers(JSON.parse(savedRecentStickers))

      const savedFavStickers = localStorage.getItem(FAV_STICKERS_KEY)
      if (savedFavStickers) setFavoriteStickers(JSON.parse(savedFavStickers))
    } catch {}
  }, [])

  // Fechar com tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Busca de GIFs no Giphy com debounce
  useEffect(() => {
    if (activeTab !== 'gif') return
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoadingGifs(true)
      try {
        const results = gifSearch.trim()
          ? await searchGifs(gifSearch.trim())
          : await fetchTrendingGifs()
        if (!cancelled) setGifs(results)
      } finally {
        if (!cancelled) setLoadingGifs(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [gifSearch, activeTab])

  // Salvar emoji recente ao clicar
  const handleEmojiClick = (emoji: string) => {
    onSelectEmoji(emoji)
    setRecentEmojis((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 32)
      try {
        localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Enviar sticker e salvar nos recentes
  const handleStickerClick = (filename: string) => {
    onSelectSticker(filename)
    setRecentStickers((prev) => {
      const next = [filename, ...prev.filter((f) => f !== filename)].slice(0, 30)
      try {
        localStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
    onClose()
  }

  // Alternar favorito de sticker
  const toggleFavoriteSticker = (filename: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavoriteStickers((prev) => {
      const exists = prev.includes(filename)
      const next = exists ? prev.filter((f) => f !== filename) : [filename, ...prev]
      try {
        localStorage.setItem(FAV_STICKERS_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Filtragem de emojis
  const filteredEmojis = useMemo(() => {
    const q = emojiSearch.trim().toLowerCase()
    if (!q) return null

    const matches: EmojiItem[] = []
    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (
          item.name.toLowerCase().includes(q) ||
          item.keywords.some((k) => k.toLowerCase().includes(q))
        ) {
          matches.push(item)
        }
      }
    }
    return matches
  }, [emojiSearch])

  // Filtragem de stickers por categoria (recentes, favoritos, todos)
  const displayedStickers = useMemo(() => {
    if (stickerFilter === 'recents') {
      return stickers.filter((s) => recentStickers.includes(s))
    }
    if (stickerFilter === 'favorites') {
      return stickers.filter((s) => favoriteStickers.includes(s))
    }
    return stickers
  }, [stickers, stickerFilter, recentStickers, favoriteStickers])

  // Scroll suave até a categoria clicada
  const scrollToCategory = (catId: string) => {
    setActiveEmojiCategory(catId)
    setEmojiSearch('')
    const target = categoryRefs.current[catId]
    if (target && scrollAreaRef.current) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div
      ref={containerRef}
      className="w-[360px] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150 shrink-0"
      style={{
        WebkitAppRegion: 'no-drag',
        width: '360px',
        minWidth: '360px',
        maxWidth: '360px',
        height: `${height}px`,
        maxHeight: `${height}px`,
        boxSizing: 'border-box'
      } as any}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Top Header / Categories Bar */}
      {activeTab === 'emoji' && (
        <div className="flex flex-col border-b border-border/40 bg-input/40 shrink-0">
          {/* Category Icons */}
          <div className="flex items-center justify-between px-2 pt-2 pb-1 gap-1 overflow-x-auto custom-scrollbar">
            {recentEmojis.length > 0 && (
              <button
                type="button"
                onClick={() => scrollToCategory('recent')}
                className={`p-1.5 rounded-lg text-sm hover:bg-card transition-all cursor-pointer ${
                  activeEmojiCategory === 'recent' ? 'text-accent border-b-2 border-accent' : 'text-text-muted'
                }`}
                title={t('media.recents')}
              >
                <ClockIcon className="w-4 h-4" />
              </button>
            )}
            {EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                className={`p-1.5 rounded-lg hover:bg-card transition-all cursor-pointer ${
                  activeEmojiCategory === cat.id ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'
                }`}
                title={cat.name}
              >
                {renderCategoryIcon(cat.id, cat.icon)}
              </button>
            ))}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-text-muted hover:text-text hover:bg-card ml-auto transition-colors cursor-pointer"
              title={t('media.close')}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Emoji Search Box */}
          <div className="px-3 pb-2 pt-1">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-input border border-border/50 text-xs">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <input
                type="text"
                value={emojiSearch}
                onChange={(e) => setEmojiSearch(e.target.value)}
                placeholder={t('media.search_emoji')}
                className="w-full bg-transparent text-text placeholder:text-text-muted/60 focus:outline-none text-xs"
                autoFocus
              />
              {emojiSearch && (
                <button
                  type="button"
                  onClick={() => setEmojiSearch('')}
                  className="text-text-muted hover:text-text"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'gif' && (
        <div className="flex flex-col border-b border-border/40 bg-input/40 p-2 gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-input border border-border/50 text-xs">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <input
                type="text"
                value={gifSearch}
                onChange={(e) => setGifSearch(e.target.value)}
                placeholder={t('media.search_gif')}
                className="w-full bg-transparent text-text placeholder:text-text-muted/60 focus:outline-none text-xs"
                autoFocus
              />
              {gifSearch && (
                <button
                  type="button"
                  onClick={() => setGifSearch('')}
                  className="text-text-muted hover:text-text"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-card transition-colors cursor-pointer"
              title={t('media.close')}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Reaction Chips */}
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5">
            {[
              { label: t('media.gif_reactions.happy'), q: 'happy' },
              { label: t('media.gif_reactions.hug'), q: 'hug' },
              { label: t('media.gif_reactions.dance'), q: 'dance' },
              { label: t('media.gif_reactions.laugh'), q: 'laugh' },
              { label: t('media.gif_reactions.wave'), q: 'wave' },
              { label: t('media.gif_reactions.kiss'), q: 'kiss' },
              { label: t('media.gif_reactions.wink'), q: 'wink' },
              { label: t('media.gif_reactions.angry'), q: 'angry' },
              { label: t('media.gif_reactions.cry'), q: 'cry' },
              { label: t('media.gif_reactions.sleep'), q: 'sleep' }
            ].map((chip) => (
              <button
                key={chip.q}
                type="button"
                onClick={() => setGifSearch(chip.q)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0 transition-colors cursor-pointer ${
                  gifSearch.toLowerCase() === chip.q
                    ? 'bg-accent/20 text-accent font-semibold'
                    : 'bg-card/60 text-text-muted hover:text-text hover:bg-card'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'sticker' && (
        <div className="flex flex-col border-b border-border/40 bg-input/40 shrink-0">
          <div className="flex items-center justify-between px-3 py-2">
            {/* Sub-categorias de stickers */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStickerFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  stickerFilter === 'all'
                    ? 'bg-card text-accent font-semibold shadow-xs'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {t('media.all_stickers', { count: stickers.length })} //{stickers.length})
              </button>
              <button
                type="button"
                onClick={() => setStickerFilter('favorites')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  stickerFilter === 'favorites'
                    ? 'bg-card text-accent font-semibold shadow-xs'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                <SolidStarIcon className="w-3.5 h-3.5 text-accent" />
                <span>{t('media.favorites', { count: favoriteStickers.length })}</span>
              </button>
              <button
                type="button"
                onClick={() => setStickerFilter('recents')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  stickerFilter === 'recents'
                    ? 'bg-card text-accent font-semibold shadow-xs'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                <ClockIcon className="w-3.5 h-3.5" />
                <span>{t('media.recents')}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-text-muted hover:text-text hover:bg-card transition-colors cursor-pointer"
              title={t('media.close')}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div
        ref={scrollAreaRef}
        style={{
          width: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box'
        }}
        className="flex-1 min-h-0 overscroll-contain custom-scrollbar p-3"
      >
        {/* Emoji Tab Content */}
        {activeTab === 'emoji' && (
          <div className="space-y-4">
            {filteredEmojis ? (
              <div>
                <p className="text-[11px] font-semibold text-text-muted mb-2">
                  {t('media.search_results', { count: filteredEmojis.length })} // ({filteredEmojis.length})
                </p>
                {filteredEmojis.length === 0 ? (
                  <p className="text-xs text-text-muted/70 py-6 text-center">
                    {t('media.no_emoji', { query: emojiSearch })} // "{emojiSearch}"
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '4px' }}>
                    {filteredEmojis.map((item, idx) => (
                      <button
                        key={`${item.emoji}-${idx}`}
                        type="button"
                        onClick={() => handleEmojiClick(item.emoji)}
                        className="w-8 h-8 flex items-center justify-center text-xl rounded-lg hover:bg-input transition-transform hover:scale-125 cursor-pointer"
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
                    <p className="text-[11px] font-semibold text-text-muted mb-1.5 flex items-center gap-1">
                      <ClockIcon className="w-3 h-3 text-text-muted" />
                      Recentes
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '4px' }} className="mb-3">
                      {recentEmojis.map((emoji, idx) => (
                        <button
                          key={`${emoji}-${idx}`}
                          type="button"
                          onClick={() => handleEmojiClick(emoji)}
                          className="w-8 h-8 flex items-center justify-center text-xl rounded-lg hover:bg-input transition-transform hover:scale-125 cursor-pointer"
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
                    <p className="text-[11px] font-semibold text-text-muted mb-1.5">
                      {cat.name}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '4px' }} className="mb-3">
                      {cat.emojis.map((item, idx) => (
                        <button
                          key={`${item.emoji}-${idx}`}
                          type="button"
                          onClick={() => handleEmojiClick(item.emoji)}
                          className="w-8 h-8 flex items-center justify-center text-xl rounded-lg hover:bg-input transition-transform hover:scale-125 cursor-pointer"
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
        )}

        {/* GIF Tab Content */}
        {activeTab === 'gif' && (
          <div className="w-full">
            {loadingGifs ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">{t('media.loading_gifs')}</span>
              </div>
            ) : gifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted text-xs">
                <span>{t('media.no_gif')}</span>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: '6px',
                  width: '100%'
                }}
              >
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => {
                      onSelectGif(gif.url)
                      onClose()
                    }}
                    style={{
                      height: '84px',
                      minHeight: '84px',
                      maxHeight: '84px',
                      width: '100%',
                      minWidth: 0,
                      position: 'relative',
                      overflow: 'hidden',
                      boxSizing: 'border-box'
                    }}
                    className="group rounded-lg bg-input/40 border border-border/40 hover:border-accent hover:bg-input transition-all cursor-pointer"
                    title={gif.title}
                  >
                    <img
                      src={gif.previewUrl}
                      alt={gif.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block'
                      }}
                      className="group-hover:scale-110 transition-transform pointer-events-none"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sticker Tab Content */}
        {activeTab === 'sticker' && (
          <div>
            {loadingStickers ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">{t('media.loading_stickers')}</span>
              </div>
            ) : displayedStickers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-text-muted text-xs px-4">
                {stickerFilter === 'favorites' ? (
                  <>
                    <span>{t('media.no_stickers_fav')}</span>
                    <span className="text-[10px] text-text-muted/60 mt-1">
                      {t('media.no_stickers_fav_hint')}
                    </span>
                  </>
                ) : stickerFilter === 'recents' ? (
                  <>
                    <span>{t('media.no_stickers_recent')}</span>
                    <span className="text-[10px] text-text-muted/60 mt-1">
                      {t('media.no_stickers_recent_hint')}
                    </span>
                  </>
                ) : (
                  <>
                    <span>{t('media.no_stickers_empty')}</span>
                    <span className="text-[10px] text-text-muted/60 mt-1">
                      {t('media.no_stickers_empty_hint')}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '6px' }}>
                {displayedStickers.map((filename) => {
                  const isFav = favoriteStickers.includes(filename)
                  return (
                    <div
                      key={filename}
                      className="group relative flex items-center justify-center p-1 rounded-xl bg-input/40 border border-border/40 hover:border-accent/80 hover:bg-input transition-all cursor-pointer aspect-square"
                      onClick={() => handleStickerClick(filename)}
                      title={t('media.send_sticker')}
                    >
                      <img
                        src={getStickerUrl(filename)}
                        alt="Sticker"
                        className="w-10 h-10 object-contain drop-shadow-sm pointer-events-none group-hover:scale-110 transition-transform"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                      {/* Botão de favoritar */}
                      <button
                        type="button"
                        onClick={(e) => toggleFavoriteSticker(filename, e)}
                        className={`absolute top-0.5 right-0.5 p-0.5 rounded-full transition-opacity cursor-pointer ${
                          isFav
                            ? 'opacity-100 text-accent'
                            : 'opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent'
                        }`}
                        title={isFav ? t('media.remove_fav') : t('media.add_fav')}
                      >
                        {isFav ? (
                          <SolidStarIcon className="w-3 h-3 text-accent" />
                        ) : (
                          <OutlineStarIcon className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation Pills (Tabs) — Identical to WhatsApp */}
      <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 border-t border-border/40 bg-input/50 shrink-0">
        <div className="flex items-center bg-card border border-border/80 rounded-full p-0.5 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('emoji')}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'emoji'
                ? 'bg-accent/20 text-accent font-semibold'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <FaceSmileIcon className="w-4 h-4" />
            <span>{t('media.tab_emoji')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gif')}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'gif'
                ? 'bg-accent/20 text-accent font-semibold'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <span>{t('media.tab_gif')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sticker')}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'sticker'
                ? 'bg-accent/20 text-accent font-semibold'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {/* Ícone vetorizado de sticker */}
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h6l8-8V7a4 4 0 0 0-4-4z" />
              <path d="M13 21v-6a2 2 0 0 1 2-2h6" />
              <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
              <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
              <path d="M8.5 13a4.5 4.5 0 0 0 5 0" />
            </svg>
            <span>{t('media.tab_sticker')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
