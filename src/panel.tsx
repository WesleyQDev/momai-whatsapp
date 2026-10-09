import { useEffect, useRef, useState, useCallback, useMemo, Fragment } from 'react'
import {
  XMarkIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  DocumentIcon
} from '@heroicons/react/24/outline'
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid'
import QRCode from 'qrcode'
import sdk from 'momai:sdk'
import { useExtensionEvents } from './hooks/useExtensionEvents'
import { isSameChat } from './utils/chatJid'
import { useI18n } from './hooks/useI18n'
import { getChatBubbleClasses, getChatBubbleStyle, getChatBubbleTimeClasses } from './utils/chatBubble'
import { renderTextWithLinks } from './utils/linkify'
import { useReplySuggestions } from './hooks/useReplySuggestions'
import { writePendingShare } from './services/share-intent'
import { useWindowDrag } from './utils/windowDrag'
import ContextMenu from './components/ContextMenu'
import MediaPicker from './components/MediaPicker'
import { QuotedMessage } from './components/QuotedMessage'
import { copyTextToClipboard } from './utils/clipboard'
import { getApiBaseUrl } from './utils/apiBase'

interface AttachedDocument {
  id: string
  dataUrl: string
  name: string
  size: number
  mimetype: string
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const isDirectUrl = (url: string): boolean => {
  if (!url) return false
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('file://')
  )
}

const getAudioUrl = (filename: string): string => {
  if (!filename) return ''
  if (isDirectUrl(filename)) return filename
  const base = getApiBaseUrl()
  return `${base}${sdk.media.url('momai-whatsapp', `audio/${encodeURIComponent(filename)}`)}`
}

const getStickerUrl = (filename: string): string => {
  if (!filename) return ''
  if (isDirectUrl(filename)) return filename
  const base = getApiBaseUrl()
  return `${base}${sdk.media.url('momai-whatsapp', `stickers/${encodeURIComponent(filename)}`)}`
}

const getImageUrl = (filename: string): string => {
  if (!filename) return ''
  if (isDirectUrl(filename)) return filename
  const base = getApiBaseUrl()
  return `${base}${sdk.media.url('momai-whatsapp', `images/${encodeURIComponent(filename)}`)}`
}

const getVideoUrl = (filename: string): string => {
  if (!filename) return ''
  if (isDirectUrl(filename)) return filename
  const base = getApiBaseUrl()
  return `${base}${sdk.media.url('momai-whatsapp', `videos/${encodeURIComponent(filename)}`)}`
}

// Placeholder texts used for media messages without a caption (both locales).
const isMediaPlaceholder = (text: string): boolean =>
  text === '🎙️ Áudio' ||
  text === '🎙️ Audio' ||
  text === '📷 Foto' ||
  text === '📷 Photo' ||
  text === '📄 Documento' ||
  text === '📄 Document' ||
  text === '🎥 Vídeo' ||
  text === '🎥 Video' ||
  text === '[GIF]' ||
  text === '[Sticker]'

const isGifUrl = (text?: string): boolean => {
  if (!text) return false
  const t = text.trim()
  return (
    /^(https?:\/\/|data:image\/gif|data:video\/mp4)[^\s]+\.(gif|mp4)(\?[^\s]*)?$/i.test(t) ||
    /^(https?:\/\/media[0-9]*\.giphy\.com\/[^\s]+|https?:\/\/nekos\.best\/api\/v2\/[^\s]+|https?:\/\/tenor\.com\/[^\s]+)/i.test(t)
  )
}

function getOnlyEmojiCount(text?: string | null): number | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed) return null

  // NOTE: sem flag `g` no teste por grapheme — `RegExp.test` com `g` é
  // stateful (lastIndex avança) e fazia "😀😀" ou "😂🤣😅" retornarem null.
  const emojiTest = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|\p{Extended_Pictographic})/u
  const emojiGlobal = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|\p{Extended_Pictographic})/gu

  try {
    const segmenter = new (Intl as any).Segmenter('en', { granularity: 'grapheme' })
    const graphemes = Array.from(segmenter.segment(trimmed))
      .map((s: any) => s.segment.trim())
      .filter(Boolean)
    if (graphemes.length === 0 || graphemes.length > 3) return null

    for (const g of graphemes) {
      if (!emojiTest.test(g)) return null
      if (/[a-zA-Z0-9]/i.test(g) && !g.includes('\u20e3')) return null
    }
    return graphemes.length
  } catch {
    const cleaned = trimmed.replace(/\s+/g, '')
    const matches = cleaned.match(emojiGlobal)
    if (!matches) return null
    if (cleaned.replace(emojiGlobal, '').length === 0 && matches.length <= 3) {
      return matches.length
    }
    return null
  }
}

type MediaItem = {
  key: string
  kind: 'image' | 'document'
  file: string
  name: string
}

function MediaThumbnail({
  src,
  alt,
  size = 'md',
  onOpen,
  timestampOverlay
}: {
  src: string
  alt: string
  size?: 'md' | 'sm'
  onOpen: () => void
  timestampOverlay?: React.ReactNode
}) {
  const { t } = useI18n()
  const imgClass =
    size === 'sm'
      ? 'w-20 h-20 object-cover rounded-[11px] drop-shadow-sm select-none pointer-events-auto hover:scale-105 transition-transform cursor-pointer'
      : 'w-40 h-40 sm:w-48 sm:h-48 object-cover rounded-[13px] drop-shadow-sm select-none pointer-events-auto hover:scale-[1.02] transition-transform cursor-pointer'
  return (
    <div className="relative shrink-0 group/thumb">
      <img
        src={src}
        alt={alt}
        className={imgClass}
        loading="lazy"
        onClick={onOpen}
        onDoubleClick={onOpen}
        title={t('panel.photo_click')}
      />
      {timestampOverlay && (
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-xs text-[10px] font-normal text-white/95 flex items-center gap-1 shadow-xs pointer-events-none select-none z-10">
          {timestampOverlay}
        </div>
      )}
    </div>
  )
}

function VideoThumbnail({
  src,
  alt,
  size = 'md',
  onOpen,
  timestampOverlay
}: {
  src: string
  alt: string
  size?: 'md' | 'sm'
  onOpen: () => void
  timestampOverlay?: React.ReactNode
}) {
  const containerClass =
    size === 'sm'
      ? 'w-20 h-20 rounded-[11px] drop-shadow-sm select-none pointer-events-auto hover:scale-105 transition-transform cursor-pointer'
      : 'w-40 h-40 sm:w-48 sm:h-48 rounded-[13px] drop-shadow-sm select-none pointer-events-auto hover:scale-[1.02] transition-transform cursor-pointer'
  return (
    <div className="relative shrink-0 group/thumb" onClick={onOpen} title="Clique para ampliar o vídeo">
      <video
        src={src}
        preload="metadata"
        muted
        playsInline
        className={`${containerClass} object-cover rounded-[inherit]`}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-[inherit] opacity-80 group-hover/thumb:opacity-100 transition-opacity pointer-events-none">
        <svg className="w-10 h-10 text-white drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      {timestampOverlay && (
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-xs text-[10px] font-normal text-white/95 flex items-center gap-1 shadow-xs pointer-events-none select-none z-10">
          {timestampOverlay}
        </div>
      )}
    </div>
  )
}

function GifThumbnail({
  src,
  alt = 'GIF',
  size = 'md',
  onOpen,
  timestampOverlay
}: {
  src: string
  alt?: string
  size?: 'md' | 'sm'
  onOpen: () => void
  timestampOverlay?: React.ReactNode
}) {
  const isVideo =
    src.endsWith('.mp4') ||
    src.includes('.mp4?') ||
    src.includes('/mp4') ||
    src.startsWith('data:video/')
  const containerClass =
    size === 'sm'
      ? 'w-24 h-24 sm:w-28 sm:h-28 rounded-[11px] drop-shadow-xs select-none pointer-events-auto hover:scale-105 transition-transform cursor-pointer relative overflow-hidden bg-black/10'
      : 'w-44 h-44 sm:w-52 sm:h-52 rounded-[13px] drop-shadow-xs select-none pointer-events-auto hover:scale-[1.01] transition-transform cursor-pointer relative overflow-hidden bg-black/10'

  return (
    <div className={containerClass} onClick={onOpen} title="Clique para ampliar o GIF">
      {isVideo ? (
        <video
          src={src}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover rounded-[inherit]"
        />
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover rounded-[inherit]"
        />
      )}
      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white uppercase tracking-wider select-none pointer-events-none shadow-xs z-10">
        GIF
      </div>
      {timestampOverlay && (
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-xs text-[10px] font-normal text-white/95 flex items-center gap-1 shadow-xs pointer-events-none select-none z-10">
          {timestampOverlay}
        </div>
      )}
    </div>
  )
}

function StickerImg({
  src,
  onOpen
}: {
  src: string
  onOpen: () => void
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [src])
  if (!src || failed) {
    return (
      <div
        className="w-28 h-28 sm:w-36 sm:h-36 flex flex-col items-center justify-center gap-1 rounded-xl bg-input/40 border border-border/40 select-none cursor-pointer hover:scale-105 transition-transform"
        onClick={onOpen}
        title="Figurinha indisponível — clique para tentar ampliar"
      >
        <span className="text-4xl leading-none" aria-hidden="true">
          🏷️
        </span>
        <span className="text-[10px] text-text-muted font-medium">Figurinha</span>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt="Sticker"
      className="w-28 h-28 sm:w-36 sm:h-36 object-contain drop-shadow-sm select-none pointer-events-auto hover:scale-105 transition-transform cursor-pointer"
      loading="lazy"
      onClick={onOpen}
      onError={() => setFailed(true)}
      title="Clique para ampliar o sticker"
    />
  )
}


function DocumentCard({
  file,
  name,
  opening,
  onOpen
}: {
  file: string
  name: string
  opening: boolean
  onOpen: () => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={opening}
      className="mt-1 flex items-center gap-2 max-w-full w-full rounded-lg bg-input/80 border border-border/40 px-3 py-2 hover:bg-white/10 transition-colors text-left cursor-pointer disabled:opacity-60 min-w-0 overflow-hidden"
      title={t('panel.document_click')}
    >
      <span className="text-lg shrink-0" aria-hidden="true">
        📄
      </span>
      <span className="flex-1 min-w-0 overflow-hidden">
        <span className="block text-xs font-medium text-text truncate max-w-full" title={name}>
          {name}
        </span>
        <span className="block text-[10px] text-text-muted">
          {opening ? t('panel.opening') : t('panel.document_click')}
        </span>
      </span>
    </button>
  )
}

function OverlayImagePreview({
  src,
  alt,
  contactName,
  caption,
  onClose
}: {
  src: string
  alt: string
  contactName: string
  caption?: string | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const headerDragRef = useWindowDrag<HTMLDivElement>()
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [src])

  const clampPan = (newX: number, newY: number, currentZoom: number) => {
    if (currentZoom <= 1) return { x: 0, y: 0 }
    if (!imgRef.current || !containerRef.current) return { x: newX, y: newY }
    const containerW = containerRef.current.clientWidth
    const containerH = containerRef.current.clientHeight
    const baseW = imgRef.current.clientWidth
    const baseH = imgRef.current.clientHeight

    const scaledW = baseW * currentZoom
    const scaledH = baseH * currentZoom

    const maxPanX = Math.max(0, (scaledW - containerW) / 2 + 15)
    const maxPanY = Math.max(0, (scaledH - containerH) / 2 + 15)

    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, newX)),
      y: Math.min(maxPanY, Math.max(-maxPanY, newY))
    }
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const factor = e.deltaY < 0 ? 1.25 : 0.8
      setZoom((prev) => {
        const next = Math.min(6, Math.max(1, prev * factor))
        if (next <= 1) {
          setPan({ x: 0, y: 0 })
          return 1
        }
        setPan((prevPan) => clampPan(prevPan.x, prevPan.y, next))
        return next
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1 && e.button === 0) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && zoom > 1) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPan(clampPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy, zoom))
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (zoom > 1) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    } else {
      setZoom(2)
      setPan({ x: 0, y: 0 })
    }
  }

  const resetZoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-card animate-in fade-in duration-200 select-none overflow-hidden"
      style={{ WebkitAppRegion: 'no-drag' } as any}
      onClick={(e) => e.stopPropagation()}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div
        ref={headerDragRef}
        className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border/40 bg-sidebar/30 select-none cursor-move w-full min-w-0"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        title={t('panel.drag_window') || 'Arraste para mover a janela'}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors p-1 rounded-md hover:bg-input/50 cursor-pointer"
          title={t('panel.back_to_chat')}
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span className="font-medium">{t('panel.back_to_chat')}</span>
        </button>
        <div className="flex items-center gap-1.5 min-w-0 px-2">
          <span className="text-xs font-semibold text-text truncate max-w-[150px]">
            {contactName}
          </span>
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5 shrink-0"
            fill="none"
            stroke="#25D366"
            strokeWidth="1.4"
            aria-hidden
          >
            <path d="M12 2.5C6.753 2.5 2.5 6.753 2.5 12c0 1.7.446 3.296 1.226 4.684L2.5 21.5l4.916-1.29A9.45 9.45 0 0 0 12 21.5c5.247 0 9.5-4.253 9.5-9.5S17.247 2.5 12 2.5z" />
            <path
              d="M16.3 14.66c-.2.56-1.18 1.08-1.64 1.12-.42.04-.96.2-2.78-.52-2.32-.92-3.78-3.28-3.9-3.44-.12-.16-.94-1.24-.94-2.36 0-1.12.58-1.68.8-1.9.2-.22.44-.28.6-.28h.46c.14 0 .34.04.52.48l.92 2.24c.08.2.12.4.02.64-.08.16-.18.36-.3.48-.12.12-.24.26-.1.48.52.88 1.16 1.56 2.06 2.08.22.14.38.08.54-.08.14-.16.66-.76.84-1 .18-.24.36-.2.64-.1.26.1 1.68.8 1.96.94.28.14.48.2.54.32.08.12.08.68-.14 1.28z"
              fill="#25D366"
              stroke="none"
            />
          </svg>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors shrink-0 cursor-pointer"
          aria-label={t('panel.close')}
          title={t('panel.close')}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Media element occupying the full space of the overlay with scroll zoom & pan */}
      <div
        ref={containerRef}
        className={`relative flex-1 min-h-0 w-full p-2.5 flex items-center justify-center overflow-hidden select-none ${
          zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onDoubleClick={handleDoubleClick}
        title={zoom > 1 ? 'Arraste para mover ou dê duplo clique para resetar' : 'Role o mouse para dar zoom'}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          style={{
            transform: zoom > 1 ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : 'none',
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 120ms ease-out'
          }}
          className="max-w-full max-h-full object-contain rounded-lg select-none pointer-events-none shadow-sm"
          draggable={false}
        />

        {/* Zoom badge when zoomed in */}
        {zoom > 1 && (
          <button
            type="button"
            onClick={resetZoom}
            className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-input/90 hover:bg-input border border-border/60 text-[10px] font-medium text-text-muted hover:text-text shadow-sm transition-all cursor-pointer z-10"
            title="Resetar zoom (100%)"
          >
            {Math.round(zoom * 100)}% • Reset
          </button>
        )}
      </div>

      {/* Caption if message exists and is not a placeholder */}
      {caption && (
        <div className="px-3.5 py-2.5 border-t border-border/40 bg-input/20 select-text max-h-24 overflow-y-auto">
          <p
            className="text-xs text-text/90 whitespace-pre-wrap break-words"
            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          >
            {renderTextWithLinks(caption)}
          </p>
        </div>
      )}
    </div>
  )
}

function useOpenDocument() {
  const { t } = useI18n()
  const [openingFile, setOpeningFile] = useState<string | null>(null)
  const [docError, setDocError] = useState<string | null>(null)
  const openDocument = useCallback(async (file: string, name?: string | null) => {
    setDocError(null)
    setOpeningFile(file)
    try {
      const { data: res } = await sdk.api.post('/extensions/momai-whatsapp/command', {
        toolName: 'open_document',
        args: { filename: file, documentName: name || file }
      })
      if (!res?.ok) setDocError(res?.error || t('panel.doc_open_failed'))
    } catch (err: any) {
      setDocError(err?.message || t('panel.doc_open_failed'))
    } finally {
      setOpeningFile(null)
    }
  }, [t])
  return { openDocument, openingFile, docError }
}

type HistoryLine = {
  id?: string
  direction: 'incoming' | 'outgoing'
  text: string
  timestamp: number
  from?: string
  senderJid?: string
  audio?: string
  sticker?: string
  image?: string
  document?: string
  documentName?: string
  video?: string
  gif?: string
  isGif?: boolean
  quoted?: {
    id?: string
    text?: string
    from?: string
    senderJid?: string
    timestamp?: number
    image?: string
    video?: string
    audio?: string
    document?: string
    documentName?: string
    sticker?: string
    gif?: string
    isGif?: boolean
  }
}

type Participant = {
  id: string
  name: string
  phone: string
  admin?: string
  avatar?: string | null
}

/**
 * Normaliza a citação (`quoted`) recebida do worker/eventos para o formato
 * de `HistoryLine`, preservando nome (`from`), remetente e mídias para que o
 * bloco de resposta do overlay renderize como no WhatsApp Web.
 */
function normalizeIncomingQuoted(q: any): HistoryLine['quoted'] {
  if (!q || typeof q !== 'object') return undefined
  return {
    id: q.id || q.stanzaId || undefined,
    text: q.text || q.documentName || '',
    from: q.from || undefined,
    senderJid: q.senderJid || undefined,
    timestamp: q.timestamp ? Number(q.timestamp) : undefined,
    image: q.image,
    video: q.video,
    audio: q.audio,
    sticker: q.sticker,
    document: q.document,
    documentName: q.documentName,
    gif: q.gif,
    isGif: q.isGif
  }
}

function normalizeServerLine(m: any): HistoryLine | null {
  if (!m || typeof m !== 'object') return null
  const line: HistoryLine = {
    id: m.id || m.key?.id || undefined,
    direction: m.direction === 'outgoing' ? 'outgoing' : 'incoming',
    text: m.text || m.message || '',
    timestamp: Number(m.timestamp) || 0,
    from: m.from || undefined,
    senderJid: m.senderJid || m.participant || undefined,
    audio: m.audio,
    sticker: m.sticker,
    image: m.image,
    document: m.document,
    documentName: m.documentName,
    video: m.video,
    gif: m.gif,
    isGif: m.isGif,
    quoted: normalizeIncomingQuoted(m.quoted)
  }
  if (!line.text && !line.audio && !line.sticker && !line.image && !line.document && !line.video && !line.gif && !line.isGif && !line.quoted) {
    return null
  }
  return line
}

/**
 * Monta o payload de citação enviado ao worker. O `id` é obrigatório: o
 * worker só consegue anexar o `contextInfo` (resposta real no WhatsApp)
 * quando recebe o stanzaId da mensagem citada.
 */
function buildQuotedPayload(
  reply: HistoryLine,
  opts: { youLabel: string; fallbackFrom: string }
) {
  const fromMe = reply.direction === 'outgoing'
  return {
    id: reply.id,
    text: reply.text || reply.documentName || '',
    from: fromMe ? opts.youLabel : reply.from || opts.fallbackFrom,
    fromMe,
    senderJid: reply.senderJid || undefined,
    timestamp: reply.timestamp,
    image: reply.image,
    video: reply.video,
    audio: reply.audio,
    sticker: reply.sticker,
    document: reply.document,
    documentName: reply.documentName,
    gif: reply.gif,
    isGif: reply.isGif
  }
}

/**
 * Mescla o histórico fresco do worker com envios otimistas locais ainda não
 * confirmados (sem id ou mais novos que o servidor), sem duplicar.
 */
function mergeServerConversation(prev: HistoryLine[], server: HistoryLine[]): HistoryLine[] {
  if (server.length === 0) return prev
  const serverIds = new Set(server.map((m) => m.id).filter(Boolean))
  const maxServerTs = Math.max(...server.map((m) => Number(m.timestamp) || 0))
  const optimistic = prev.filter((m) => {
    if (m.id && serverIds.has(m.id)) return false
    if (!m.id) return true
    return m.direction === 'outgoing' && (Number(m.timestamp) || 0) > maxServerTs
  })
  return [...server, ...optimistic].sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * True when `line` is already represented in `prev`: same message id, or same
 * direction and content inside a 2s window (covers optimistic lines whose id
 * is not known yet). The `message_sent` worker event and the HTTP response of
 * `send_message` both insert the outgoing bubble, so this check must be used
 * by every insert path.
 */
function isDuplicateHistoryLine(prev: HistoryLine[], line: HistoryLine): boolean {
  return prev.some(
    (m) =>
      Boolean(line.id && m.id && line.id === m.id) ||
      (Boolean(line.timestamp) &&
        Boolean(m.timestamp) &&
        Math.abs((Number(line.timestamp) || 0) - (Number(m.timestamp) || 0)) <= 2 &&
        m.direction === line.direction &&
        (m.text || '') === (line.text || '') &&
        (m.image || '') === (line.image || '') &&
        (m.audio || '') === (line.audio || '') &&
        (m.video || '') === (line.video || '') &&
        (m.sticker || '') === (line.sticker || '') &&
        (m.gif || '') === (line.gif || '') &&
        Boolean(m.isGif) === Boolean(line.isGif) &&
        (m.document || '') === (line.document || ''))
  )
}

/** Appends `line` to the history unless an equivalent line is already there. */
function appendHistoryLine(prev: HistoryLine[], line: HistoryLine): HistoryLine[] {
  if (isDuplicateHistoryLine(prev, line)) return prev
  return [...prev, line]
}

const formatHistoryTime = (ts: number, locale = 'pt-BR') => {
  const ms = ts > 1e12 ? ts : ts * 1000
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

const formatDateSeparator = (
  ts: number,
  locale = 'pt-BR',
  labels?: { today: string; yesterday: string }
): string => {
  const ms = ts > 1e12 ? ts : ts * 1000
  if (!ms || isNaN(ms)) return ''
  const date = new Date(ms)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()

  if (isSameDay(date, today)) return labels?.today || 'Hoje'
  if (isSameDay(date, yesterday)) return labels?.yesterday || 'Ontem'
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

const isDifferentDay = (ts1: number, ts2: number): boolean => {
  const ms1 = ts1 > 1e12 ? ts1 : ts1 * 1000
  const ms2 = ts2 > 1e12 ? ts2 : ts2 * 1000
  const d1 = new Date(ms1)
  const d2 = new Date(ms2)
  return (
    d1.getFullYear() !== d2.getFullYear() ||
    d1.getMonth() !== d2.getMonth() ||
    d1.getDate() !== d2.getDate()
  )
}

const formatSeconds = (sec: number) => {
  if (isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function CustomAudioPlayer({ src }: { src: string }) {
  const { t } = useI18n()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleLoadedMetadata = () => setDuration(audio.duration || 0)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }
    const handlePause = () => setIsPlaying(false)
    const handlePlay = () => setIsPlaying(true)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('durationchange', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('play', handlePlay)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('durationchange', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('play', handlePlay)
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch((err) => console.warn('[CustomAudioPlayer] play error:', err))
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const newTime = Number(e.target.value)
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const toggleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1
    setPlaybackRate(nextRate)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="w-full max-w-full min-w-0 mt-1 flex flex-col gap-1.5 p-2 rounded-lg bg-input border border-border/50 select-none overflow-hidden">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          className="p-1 rounded-md text-text hover:text-accent active:scale-95 transition-colors shrink-0 cursor-pointer focus:outline-none"
          title={isPlaying ? t('media.pause_audio') : t('media.play_audio')}
          aria-label={isPlaying ? t('media.pause_audio') : t('media.play_audio')}
        >
          {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
        </button>

        <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
          <div className="relative w-full flex items-center h-3">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 rounded-full appearance-none bg-text/15 cursor-pointer accent-text focus:outline-none"
              style={{
                background: `linear-gradient(to right, rgb(var(--text-primary)) ${progress}%, rgb(var(--text-primary) / 0.15) ${progress}%)`
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-muted font-medium px-0.5 leading-none">
            <span>{formatSeconds(currentTime)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleSpeed}
          className="text-[10px] px-1.5 py-0.5 rounded font-bold text-text-muted hover:text-text bg-text/5 hover:bg-text/10 transition-colors shrink-0 cursor-pointer"
          title={t('media.playback_speed')}
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  )
}

const VOICE_LABEL_KEYS: Record<string, string> = {
  listening: 'voice.listening',
  detected: 'voice.detected',
  complete: 'voice.complete',
  error: 'voice.error',
  timeout: 'voice.timeout'
}

const getAvatarColor = (id: string) => {
  let hash = 0
  const str = id || 'default'
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 40%)`
}

const getInitials = (name: string): string => {
  if (!name || typeof name !== 'string') return ''
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  if (!clean || /^\d+$/.test(clean)) return ''
  const parts = clean.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0].slice(0, 1).toUpperCase()
}

function ContactAvatar({
  src,
  name,
  id,
  onOpenImage
}: {
  src?: string | null
  name: string
  id: string
  onOpenImage?: (src: string) => void
}) {
  const [stableSrc, setStableSrc] = useState<string | null>(src || null)
  const prevIdRef = useRef<string>(id)

  useEffect(() => {
    if (id !== prevIdRef.current) {
      prevIdRef.current = id
      setStableSrc(src || null)
      return
    }
    if (src) setStableSrc(src)
  }, [src, id])

  if (stableSrc) {
    return (
      <img
        key={stableSrc}
        src={stableSrc}
        alt={name}
        onError={() => setStableSrc((prev) => (prev === src ? null : prev))}
        className="w-10 h-10 rounded-full object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={(e) => {
          e.stopPropagation()
          if (onOpenImage) onOpenImage(stableSrc)
        }}
      />
    )
  }

  const initials = getInitials(name)
  if (initials) {
    const color = getAvatarColor(id)
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-text font-semibold text-sm shrink-0"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    )
  }

  const isPhone = /^[+\d\s().-]*$/.test(name)
  return (
    <div className="w-10 h-10 rounded-full bg-input/40 border border-border/40 flex items-center justify-center text-lg shrink-0">
      {isPhone ? '📱' : '👤'}
    </div>
  )
}

export default function WhatsAppNotificationCard({ data }: { data: any }) {
  const { locale, t } = useI18n()
  const isHistoryOverlay = Boolean(data?.isHistoryOverlay)
  const senderName = data?.senderName
  const contact = data?.contact || data?.from || t('panel.unknown_contact')
  const message = data?.message || data?.text || ''
  const [localHistory, setLocalHistory] = useState<HistoryLine[]>(() => {
    if (Array.isArray(data?.conversationHistory) && data.conversationHistory.length > 0) {
      return data.conversationHistory
    }
    const hasInitialMsg =
      message ||
      data?.image ||
      data?.sticker ||
      data?.document ||
      data?.audio ||
      data?.video ||
      data?.gif ||
      data?.isGif
    if (hasInitialMsg) {
      return [
        {
          id: data?.id || data?.stanzaId || undefined,
          direction: 'incoming',
          text: message || '',
          timestamp: data?.timestamp || Math.floor(Date.now() / 1000),
          from: senderName || contact,
          senderJid: data?.senderJid || undefined,
          audio: data?.audio,
          image: data?.image,
          sticker: data?.sticker,
          document: data?.document,
          documentName: data?.documentName,
          video: data?.video,
          gif: data?.gif,
          isGif: data?.isGif,
          quoted: normalizeIncomingQuoted(data?.quoted)
        }
      ]
    }
    return []
  })

  const prevChatJidRef = useRef<string>(data?.contactJid || data?.contact || '')
  useEffect(() => {
    const activeJid = data?.contactJid || data?.contact || ''
    const isDifferentChat = prevChatJidRef.current !== activeJid
    prevChatJidRef.current = activeJid

    if (Array.isArray(data?.conversationHistory) && data.conversationHistory.length > 0) {
      setLocalHistory(data.conversationHistory)
      return
    }

    const hasMsg =
      message ||
      data?.image ||
      data?.sticker ||
      data?.document ||
      data?.audio ||
      data?.video ||
      data?.gif ||
      data?.isGif
    if (!hasMsg) return

    const incomingLine: HistoryLine = {
      id: data?.id || data?.stanzaId || undefined,
      direction: 'incoming',
      text: message || '',
      timestamp: data?.timestamp || Math.floor(Date.now() / 1000),
      from: senderName || contact,
      senderJid: data?.senderJid || undefined,
      audio: data?.audio,
      image: data?.image,
      sticker: data?.sticker,
      document: data?.document,
      documentName: data?.documentName,
      video: data?.video,
      gif: data?.gif,
      isGif: data?.isGif,
      quoted: normalizeIncomingQuoted(data?.quoted)
    }

    if (isDifferentChat) {
      setLocalHistory([incomingLine])
    } else {
      setLocalHistory((prev) => appendHistoryLine(prev, incomingLine))
    }
  }, [
    data?.contactJid,
    data?.contact,
    message,
    data?.id,
    data?.stanzaId,
    data?.timestamp,
    data?.image,
    data?.audio,
    data?.video,
    data?.document,
    data?.documentName,
    data?.sticker,
    data?.gif,
    data?.isGif,
    data?.conversationHistory,
    senderName,
    contact
  ])

  const conversationHistory = localHistory
  // `page.you_label` vem com dois-pontos ("Você:") para uso em previews;
  // no balão de citação o padrão WhatsApp Web é sem dois-pontos.
  const youLabel = t('page.you_label', { defaultValue: 'Você' }).replace(/:\s*$/, '') || 'Você'
  // Índice id -> mensagem para resolver o nome do autor da citação
  // (ex.: responder à própria mensagem, que chega sem `participant`).
  const messageById = useMemo(() => {
    const map = new Map<string, { direction: 'incoming' | 'outgoing'; from?: string }>()
    for (const m of conversationHistory) {
      if (m.id && !map.has(m.id)) map.set(m.id, { direction: m.direction, from: m.from })
    }
    return map
  }, [conversationHistory])
  const showHistoryView = isHistoryOverlay
  const quickReplies = data?.quickReplies || []
  const contactJid = data?.contactJid || data?.contact || ''
  const isGroup = data?.isGroup || false
  const groupName = data?.groupName || ''
  const isStatus = Boolean(data?.isStatus)
  const isAdminsOnly = data?.isAdminsOnly || false
  const onClose = data?.onClose || (() => {})

  // No overlay de contato (modo histórico), busca a conversa direto do worker
  // para garantir dados frescos — incluindo a citação (`quoted`) do bloco de
  // resposta — independente do que a página repassou ao abrir o overlay.
  useEffect(() => {
    if (!isHistoryOverlay || !contactJid) return
    let cancelled = false
    const targetJid = contactJid
    void (async () => {
      try {
        const base = getApiBaseUrl()
        if (!base) return
        const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
          },
          body: JSON.stringify({
            toolName: 'get_conversation',
            args: { jid: targetJid, limit: 100 }
          })
        })
        const resData: any = await res.json().catch(() => null)
        const serverHistory: any[] = Array.isArray(resData?.history) ? resData.history : []
        if (cancelled || serverHistory.length === 0) return
        const lines = serverHistory
          .map(normalizeServerLine)
          .filter((l): l is HistoryLine => l !== null)
          .sort((a, b) => a.timestamp - b.timestamp)
        if (cancelled || lines.length === 0) return
        setLocalHistory((prev) => mergeServerConversation(prev, lines))
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [isHistoryOverlay, contactJid])

  const [voiceStatus, setVoiceStatus] = useState<
    'idle' | 'listening' | 'detected' | 'complete' | 'error' | 'timeout'
  >('idle')
  const [customText, setCustomText] = useState<string>(
    () => (typeof data?.initialDraft === 'string' ? data.initialDraft : '')
  )
  const [pastedImages, setPastedImages] = useState<string[]>([])
  const [attachedDocuments, setAttachedDocuments] = useState<AttachedDocument[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedStickerUrl, setSelectedStickerUrl] = useState<string | null>(null)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedImageUrl && !selectedStickerUrl && !selectedVideoUrl) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setSelectedImageUrl(null)
        setSelectedStickerUrl(null)
        setSelectedVideoUrl(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [selectedImageUrl, selectedStickerUrl, selectedVideoUrl])

  const { openDocument, openingFile, docError } = useOpenDocument()

  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const [availableStickers, setAvailableStickers] = useState<string[]>([])
  const [loadingStickers, setLoadingStickers] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [minimized, setMinimized] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [participantSearch, setParticipantSearch] = useState('')
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [participantsError, setParticipantsError] = useState('')
  const [avatarSrc, setAvatarSrc] = useState<string | null>(data?.contactAvatar || null)

  const [activeRecipient, setActiveRecipient] = useState<{
    jid: string
    name: string
    isGroup: boolean
    fromGroupJid?: string
    fromGroupName?: string
    avatar?: string | null
  }>(() => ({
    jid: contactJid,
    name: isGroup ? groupName || contact : contact,
    isGroup,
    avatar: data?.contactAvatar || null
  }))

  const fallbackQuickReplies = useMemo(() => {
    if (!activeRecipient.isGroup && activeRecipient.fromGroupJid) {
      return [t('page.quick_reply_hello', { name: activeRecipient.name }), t('page.quick_reply_help')]
    }
    return [
      t('page.quick_reply_check'),
      t('page.quick_reply_hello', { name: activeRecipient.name || contact }),
      t('page.quick_reply_help')
    ]
  }, [t, activeRecipient.name, activeRecipient.isGroup, activeRecipient.fromGroupJid, contact])

  const { suggestions: generatedQuickReplies, loading: suggestionsLoading } = useReplySuggestions({
    enabled: !isHistoryOverlay,
    contactName: activeRecipient.name || senderName || contact,
    contactJid,
    isGroup,
    latestMessage: message,
    history: conversationHistory,
    language: locale,
    fallback: fallbackQuickReplies
  })

  const [inputContextMenu, setInputContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [participantContextMenu, setParticipantContextMenu] = useState<{
    x: number
    y: number
    participant: Participant
  } | null>(null)
  const [messageContextMenu, setMessageContextMenu] = useState<{
    x: number
    y: number
    message: HistoryLine
  } | null>(null)
  const [pinnedContextMenu, setPinnedContextMenu] = useState<{
    x: number
    y: number
    message: HistoryLine
  } | null>(null)

  const [replyingTo, setReplyingTo] = useState<HistoryLine | null>(null)

  const scrollToMessage = useCallback((ts?: number) => {
    if (!ts) return
    const el = document.getElementById(`msg-${ts}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageTs(ts)
      setTimeout(() => setHighlightedMessageTs(null), 1800)
    }
  }, [])
  const [pinnedMessageTimestamps, setPinnedMessageTimestamps] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(`momai_wa_pinned_msgs_${contactJid}`)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [starredMessageTimestamps, setStarredMessageTimestamps] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(`momai_wa_starred_msgs_${contactJid}`)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [selectedMessageTimestamps, setSelectedMessageTimestamps] = useState<number[]>([])
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [highlightedMessageTs, setHighlightedMessageTs] = useState<number | null>(null)
  const [pinnedIndex, setPinnedIndex] = useState<number>(0)

  const singleMessageLine: HistoryLine = useMemo(
    () => ({
      id: data?.id || data?.stanzaId || undefined,
      direction: 'incoming',
      text: message || '',
      timestamp: data?.timestamp || Math.floor(Date.now() / 1000),
      from: senderName || contact,
      senderJid: data?.senderJid || undefined,
      audio: data?.audio,
      image: data?.image,
      sticker: data?.sticker,
      document: data?.document,
      documentName: data?.documentName,
      video: data?.video,
      gif: data?.gif,
      isGif: data?.isGif
    }),
    [message, data, senderName, contact]
  )

  const allAvailableMessages = useMemo(() => {
    if (conversationHistory.length > 0) return conversationHistory
    if (message || data?.image || data?.video || data?.audio || data?.document || data?.sticker || data?.gif || data?.isGif) {
      return [singleMessageLine]
    }
    return []
  }, [conversationHistory, message, data, singleMessageLine])

  const pinnedMessages = useMemo(
    () => conversationHistory.filter((m) => pinnedMessageTimestamps.includes(m.timestamp)),
    [conversationHistory, pinnedMessageTimestamps]
  )

  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<any>(null)
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null)
    }, 2200)
  }, [])

  const togglePinMessage = useCallback(
    (ts: number) => {
      setPinnedMessageTimestamps((prev) => {
        const next = prev.includes(ts) ? prev.filter((t) => t !== ts) : [...prev, ts]
        try {
          localStorage.setItem(`momai_wa_pinned_msgs_${contactJid}`, JSON.stringify(next))
        } catch {}
        return next
      })
    },
    [contactJid]
  )

  const toggleStarMessage = useCallback(
    (ts: number) => {
      setStarredMessageTimestamps((prev) => {
        const next = prev.includes(ts) ? prev.filter((t) => t !== ts) : [...prev, ts]
        try {
          localStorage.setItem(`momai_wa_starred_msgs_${contactJid}`, JSON.stringify(next))
        } catch {}
        return next
      })
    },
    [contactJid]
  )

  const toggleSelectMessage = useCallback((ts: number) => {
    setSelectedMessageTimestamps((prev) =>
      prev.includes(ts) ? prev.filter((t) => t !== ts) : [...prev, ts]
    )
  }, [])

  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    messages: HistoryLine[]
  } | null>(null)

  const handleDeleteMessages = useCallback(
    async (messagesToDelete: HistoryLine[], deleteForEveryone: boolean) => {
      if (!messagesToDelete || messagesToDelete.length === 0) return
      const timestampsToDelete = new Set(messagesToDelete.map((m) => m.timestamp))
      const idsToDelete = new Set(messagesToDelete.map((m) => m.id).filter(Boolean))

      const snapshot = localHistory

      // Atualiza estado local imediatamente (com rollback se o envio falhar)
      setLocalHistory((prev) =>
        prev.filter(
          (m) =>
            !timestampsToDelete.has(m.timestamp) &&
            !(m.id && idsToDelete.has(m.id))
        )
      )

      // Remove de fixadas, favoritadas e selecionadas
      setPinnedMessageTimestamps((prev) => prev.filter((ts) => !timestampsToDelete.has(ts)))
      setStarredMessageTimestamps((prev) => prev.filter((ts) => !timestampsToDelete.has(ts)))
      setSelectedMessageTimestamps((prev) => prev.filter((ts) => !timestampsToDelete.has(ts)))
      setIsSelectionMode(false)
      setDeleteConfirmTarget(null)

      // Só confirma o sucesso depois que o WhatsApp aceitou a ordem: antes o
      // overlay dizia "apagada para todos" mesmo quando o envio falhava (item 14).
      let failed = false
      try {
        const base = getApiBaseUrl()
        if (!base) {
          failed = true
        } else {
          const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
            },
            body: JSON.stringify({
              toolName: 'delete_chat_messages',
              args: {
                jid: contactJid,
                messages: messagesToDelete.map((m) => ({
                  id: m.id,
                  timestamp: m.timestamp,
                  fromMe: m.direction === 'outgoing',
                  participant: m.senderJid
                })),
                deleteForEveryone
              }
            })
          })
          if (!res.ok) {
            failed = true
          } else {
            const data = await res.json().catch(() => null)
            if (data && data.ok === false) failed = true
          }
        }
      } catch (err) {
        failed = true
        console.error('[whatsapp] delete messages error:', err)
      }

      if (failed) {
        setLocalHistory(snapshot)
        showToast(t('panel.delete_failed'))
        return
      }

      try {
        const bc = new BroadcastChannel('momai-whatsapp-channel')
        bc.postMessage({
          type: 'messages_deleted',
          data: {
            jid: contactJid,
            timestamps: Array.from(timestampsToDelete),
            ids: Array.from(idsToDelete)
          }
        })
        bc.close()
      } catch {}

      const many = messagesToDelete.length > 1
      showToast(
        deleteForEveryone
          ? t(many ? 'panel.deleted_for_everyone_many' : 'panel.deleted_for_everyone_one')
          : t(many ? 'panel.deleted_for_me_many' : 'panel.deleted_for_me_one')
      )
    },
    [contactJid, localHistory, showToast, t]
  )

  const cardRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const historyScrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const interactionGenRef = useRef(0)

  const beginUserSend = useCallback(() => {
    interactionGenRef.current += 1
    return interactionGenRef.current
  }, [])

  const handleInputContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setInputContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const insertTextAtCursor = useCallback((text: string) => {
    const input = inputRef.current
    if (!input) {
      setCustomText((prev) => prev + text)
      return
    }
    input.focus()
    const current = input.value ?? customText
    const start = input.selectionStart ?? current.length
    const end = input.selectionEnd ?? current.length
    const next = current.slice(0, start) + text + current.slice(end)
    setCustomText(next)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const pos = start + text.length
      try {
        el.setSelectionRange(pos, pos)
      } catch {}
    })
  }, [customText])

  const handlePasteFromContextMenu = useCallback(async () => {
    const input = inputRef.current
    input?.focus()
    // Primary path: native Electron clipboard via SDK/preload IPC.
    // The Web Clipboard API (navigator.clipboard.read/readText) requires a
    // clipboard-read grant that the overlay session denies, so clicking the
    // custom "Colar" menu item always throws DOMException while Ctrl+V
    // (trusted paste event with clipboardData) keeps working.
    try {
      const sdkRead = (sdk as any)?.clipboard?.read
      const apiRead =
        (window as any)?.api?.readClipboard || (window as any)?.momaiAPI?.readClipboard
      if (typeof sdkRead === 'function' || typeof apiRead === 'function') {
        const result = await (typeof sdkRead === 'function'
          ? (sdk as any).clipboard.read()
          : (window as any)?.api?.readClipboard?.() ??
            (window as any)?.momaiAPI?.readClipboard?.())
        if (result?.ok) {
          if (result.type === 'image' && result.dataUrl) {
            setPastedImages((prev) => [...prev, result.dataUrl as string])
            setSendError('')
            inputRef.current?.focus()
            return
          }
          if (result.type === 'text' && result.text) {
            insertTextAtCursor(result.text)
            setSendError('')
            inputRef.current?.focus()
            return
          }
        } else if (result?.error === 'Clipboard is empty') {
          return
        }
      }
    } catch {
      // Fall through to the Web Clipboard API below.
    }
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            const reader = new FileReader()
            reader.onload = (loadEv) => {
              const dataUrl = loadEv.target?.result as string
              if (dataUrl) {
                setPastedImages((prev) => [...prev, dataUrl])
                setSendError('')
                inputRef.current?.focus()
              }
            }
            reader.readAsDataURL(blob)
            return
          }
        }
      }
      const text = await navigator.clipboard.readText()
      if (text) {
        insertTextAtCursor(text)
        inputRef.current?.focus()
        return
      }
    } catch (err) {
      console.warn('[WhatsAppPanel] Falha ao colar do clipboard:', err)
    }
    // Last resort: let Chromium perform a native paste into the focused
    // input. This fires onPaste (image path via handlePasteImage) and inserts
    // text natively without needing the clipboard-read grant.
    try {
      inputRef.current?.focus()
      document.execCommand('paste')
    } catch {}
  }, [insertTextAtCursor])

  const handleSelectAll = useCallback(() => {
    inputRef.current?.select()
  }, [])

  const handlePasteImage = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = (loadEv) => {
          const dataUrl = loadEv.target?.result as string
          if (dataUrl) {
            setPastedImages((prev) => [...prev, dataUrl])
            setSendError('')
            inputRef.current?.focus()
          }
        }
        reader.readAsDataURL(file)
        return
      }
    }
  }, [])

  const handleSelectFiles = useCallback((files: FileList | File[]) => {
    if (!files || files.length === 0) return
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
      const reader = new FileReader()
      reader.onload = (loadEv) => {
        const dataUrl = loadEv.target?.result as string
        if (!dataUrl) return
        if (isImage) {
          setPastedImages((prev) => [...prev, dataUrl])
        } else {
          setAttachedDocuments((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              dataUrl,
              name: file.name,
              size: file.size,
              mimetype: file.type || 'application/octet-stream'
            }
          ])
        }
        setSendError('')
        inputRef.current?.focus()
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const [isDraggingOver, setIsDraggingOver] = useState(false)

  const handleDropImage = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)

    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      handleSelectFiles(files)
      return
    }

    const html = e.dataTransfer?.getData('text/html')
    if (html) {
      const match = html.match(/src=["'](.*?)["']/i)
      if (match && match[1]) {
        const src = match[1]
        if (src.startsWith('data:image/') || src.startsWith('http')) {
          setPastedImages((prev) => [...prev, src])
          setSendError('')
          inputRef.current?.focus()
          return
        }
      }
    }

    const text = e.dataTransfer?.getData('text/plain')
    if (text && /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(text.trim())) {
      setPastedImages((prev) => [...prev, text.trim()])
      setSendError('')
      inputRef.current?.focus()
    }
  }, [handleSelectFiles])

  const handleToggleParticipants = useCallback(async () => {
    if (showParticipants) {
      setShowParticipants(false)
      return
    }

    setShowParticipants(true)
    setLoadingParticipants(true)
    setParticipantsError('')

    try {
      const base = getApiBaseUrl()
      if (!base) {
        setParticipantsError('Servidor da extensão não encontrado.')
        return
      }

      const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
        },
        body: JSON.stringify({
          toolName: 'get_group_participants',
          args: { groupJid: contactJid }
        })
      })

      const resData = await res.json()
      if (resData?.ok && Array.isArray(resData.participants)) {
        setParticipants(resData.participants)
      } else {
        setParticipantsError(resData?.error || 'Erro ao carregar participantes.')
      }
    } catch (err: any) {
      setParticipantsError(err?.message || 'Erro ao carregar participantes.')
    } finally {
      setLoadingParticipants(false)
    }
  }, [showParticipants, contactJid])

  const handleSelectParticipant = useCallback(
    (p: Participant) => {
      setActiveRecipient({
        jid: p.id,
        name: p.name || p.phone,
        isGroup: false,
        fromGroupJid: contactJid,
        fromGroupName: isGroup ? groupName || contact : contact,
        avatar: p.avatar || null
      })
      setShowParticipants(false)
      setCustomText('')
    },
    [contactJid, isGroup, groupName, contact]
  )

  const handleReturnToGroup = useCallback(() => {
    setActiveRecipient({
      jid: contactJid,
      name: isGroup ? groupName || contact : contact,
      isGroup,
      avatar: avatarSrc
    })
    setCustomText('')
  }, [contactJid, isGroup, groupName, contact, avatarSrc])

  const filteredParticipants = useMemo(() => {
    if (!participantSearch.trim()) return participants
    const qNorm = participantSearch
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    const qDigits = participantSearch.replace(/\D/g, '')
    return participants.filter((p) => {
      const pNameNorm = (p.name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      const pPhone = (p.phone || '').toLowerCase()
      const pPhoneDigits = (p.phone || '').replace(/\D/g, '')
      const textMatched = pNameNorm.includes(qNorm) || pPhone.includes(qNorm)
      const digitsMatched = qDigits.length >= 2 && pPhoneDigits.includes(qDigits)
      return textMatched || digitsMatched
    })
  }, [participants, participantSearch])

  // Overlay window drag: the SDK helper (with a local fallback for older
  // hosts) keeps the gesture alive when the cursor outruns the window and
  // coalesces moves to one per animation frame. Clicks after a real drag
  // are suppressed by the helper.
  const cardHeaderDragRef = useWindowDrag<HTMLDivElement>()
  const videoHeaderDragRef = useWindowDrag<HTMLDivElement>()

  const handleHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeRecipient.isGroup) {
      handleToggleParticipants()
    }
  }

  // A share from another extension (e.g. a Bible verse) arrives as
  // `initialDraft` with the overlay data. The composer resets whenever the
  // chat target changes (overlay open included), so the draft is consumed
  // here: each unique chat+draft combination pre-fills once instead of
  // starting empty, and later resets keep the previous empty behavior.
  const currentChatRef = useRef<string>(contactJid)
  const consumedDraftRef = useRef<string | null>(
    typeof data?.initialDraft === 'string' && data.initialDraft ? data.initialDraft : null
  )
  useEffect(() => {
    const isNewChat = currentChatRef.current !== contactJid
    currentChatRef.current = contactJid

    const incomingDraft =
      typeof data?.initialDraft === 'string' && data.initialDraft ? data.initialDraft : ''

    if (incomingDraft && consumedDraftRef.current !== incomingDraft) {
      consumedDraftRef.current = incomingDraft
      setCustomText(incomingDraft)
      setSending(false)
      setShowMediaPicker(false)
      interactionGenRef.current += 1
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.selectionStart = inputRef.current.value.length
          inputRef.current.selectionEnd = inputRef.current.value.length
        }
      }, 50)
    } else if (isNewChat) {
      setCustomText('')
      setSending(false)
      setShowMediaPicker(false)
      interactionGenRef.current += 1
    }
  }, [contactJid, data?.initialDraft])

  useEffect(() => {
    setActiveRecipient({
      jid: contactJid,
      name: isGroup ? groupName || contact : contact,
      isGroup,
      avatar: data?.contactAvatar || null
    })
    setShowParticipants(false)
  }, [contactJid, isGroup, groupName, contact, data?.contactAvatar])

  useEffect(() => {
    if (data?.contactAvatar) {
      setAvatarSrc(data.contactAvatar)
    } else if (contactJid) {
      const base = getApiBaseUrl()
      if (!base) return
      const avatarUrl = `${base}${sdk.media.url('momai-whatsapp', `avatars/${encodeURIComponent(contactJid)}.jpg`)}`
      fetch(avatarUrl)
        .then((r) => {
          if (r.ok) setAvatarSrc(avatarUrl)
        })
        .catch(() => {})
    }
  }, [contactJid, data?.contactAvatar])

  const notifyConversationRead = useCallback(() => {
    if (!contactJid) return
    try {
      const base = getApiBaseUrl()
      if (!base) return
      fetch(`${base}/extensions/momai-whatsapp/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
        },
        body: JSON.stringify({
          toolName: 'mark_conversation_read',
          args: { jid: contactJid }
        })
      }).catch(() => {})
    } catch {}
  }, [contactJid])

  const dismissAfterEngagement = useCallback(() => {
    notifyConversationRead()
    onClose()
  }, [notifyConversationRead, onClose])

  useEffect(() => {
    const el = historyScrollRef.current
    if (!el || localHistory.length === 0) return
    el.scrollTop = el.scrollHeight
  }, [contactJid, localHistory.length, showHistoryView])

  // Presença do overlay de contatos: enquanto este chat estiver aberto, o
  // worker suprime o overlay de notificação de mensagens novas (ele
  // substituiria este chat). Mesmo contato entra ao vivo aqui via eventos e
  // não gera bolinha/NOVA; outro contato sinaliza só pela bolinha + NOVA.
  // Divulga em 3 canais: worker (supressão + badge), BroadcastChannel e
  // localStorage (widget NOVA filtra a conversa aberta).
  useEffect(() => {
    if (!isHistoryOverlay || !contactJid) return
    const targetJid = contactJid
    const announce = (state: 'opened' | 'heartbeat' | 'closed') => {
      try {
        const bc = new BroadcastChannel('momai-whatsapp-channel')
        bc.postMessage({ type: `history_overlay_${state}`, data: { jid: targetJid } })
        bc.close()
      } catch {}
      try {
        const key = 'momai_wa_history_overlay_open'
        if (state === 'closed') {
          const raw = localStorage.getItem(key)
          if (raw) {
            try {
              if (JSON.parse(raw)?.jid === targetJid) localStorage.removeItem(key)
            } catch {
              localStorage.removeItem(key)
            }
          }
        } else {
          localStorage.setItem(key, JSON.stringify({ jid: targetJid, at: Date.now() }))
        }
      } catch {}
      try {
        const base = getApiBaseUrl()
        if (!base) return
        fetch(`${base}/extensions/momai-whatsapp/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
          },
          // keepalive: o `closed` precisa sair mesmo quando a janela fecha no
          // mesmo instante (unmount/pagehide), senão o worker segue achando
          // que o chat está aberto e suprime notificações até o TTL expirar.
          keepalive: true,
          body: JSON.stringify({
            toolName: 'history_overlay_presence',
            args: { jid: targetJid, state }
          })
        }).catch(() => {})
      } catch {}
    }
    announce('opened')
    const timer = setInterval(() => announce('heartbeat'), 5000)
    // O cleanup do React não roda de forma garantida quando a janela do
    // overlay é fechada; `pagehide` garante o aviso de fechamento ao worker.
    const handlePageHide = () => announce('closed')
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', handlePageHide)
      announce('closed')
    }
  }, [isHistoryOverlay, contactJid])

  useEffect(() => {
    const el = cardRef.current
    const setSize =
      (window as any).momaiAPI?.setOverlaySize ||
      (window as any).api?.setOverlaySize
    if (!el || typeof setSize !== 'function') return

    const CARD_BASE_WIDTH = showHistoryView ? 560 : 320
    const PICKER_WIDTH = 360
    const GAP = 12
    const totalWidth = showMediaPicker ? CARD_BASE_WIDTH + GAP + PICKER_WIDTH : CARD_BASE_WIDTH
    const exactHeight = showHistoryView
      ? pastedImages.length > 0 || attachedDocuments.length > 0
        ? 540
        : 440
      : pastedImages.length > 0 || attachedDocuments.length > 0
        ? 520
        : 400
    const MARGIN = 16

    setSize({
      width: totalWidth + MARGIN * 2,
      height: exactHeight + MARGIN * 2,
      center: showHistoryView,
      isHistoryOverlay: showHistoryView
    })
  }, [pastedImages.length, attachedDocuments.length, showMediaPicker, showHistoryView])

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  useExtensionEvents({
    onEvent: (event: any) => {
      // O bridge `momai:events` entrega `{ eventType, data }` (ver page.tsx e
      // widgets). Versões antigas do painel liam `event.type`, o que fazia o
      // overlay aberto nunca receber mensagens novas. Aceita ambos.
      const eventType: string = String(event?.eventType || event?.type || '')
      if (eventType === 'whatsapp.voice_response' || eventType === 'voice_response') {
        const eventContactJid = event.data?.contactJid || event.data?.contact
        if (eventContactJid && !isSameChat(String(eventContactJid), contactJid)) return

        const status = event.data?.status
        if (status) setVoiceStatus(status)

        if (status === 'complete' && event.data?.text) {
          setCustomText(event.data.text)
          const gen = beginUserSend()
          sendReply(event.data.text, gen, pastedImages, attachedDocuments)
        } else if (status === 'timeout' || status === 'error') {
          stop()
        }
        return
      }

      if (
        eventType === 'whatsapp_notification' ||
        eventType === 'whatsapp_message' ||
        eventType === 'message_received'
      ) {
        // `contactJid` é o endereço da conversa (grupo = @g.us). Usa
        // comparação tolerante a sufixo de device/telefone (@lid vs
        // @s.whatsapp.net) em vez de igualdade estrita, senão a mensagem do
        // contato aberto é ignorada.
        const rawJid =
          event.data?.contactJid || event.data?.jid || event.data?.replyJid || event.data?.contact || ''
        const senderJid = event.data?.senderJid || ''
        const matchesChat =
          (rawJid && isSameChat(String(rawJid), contactJid)) ||
          (senderJid && !String(rawJid).includes('@') && isSameChat(String(senderJid), contactJid))
        if (!matchesChat) return
        if (event.data?.fromMe) return

        const hasMsg =
          event.data?.message ||
          event.data?.text ||
          event.data?.image ||
          event.data?.sticker ||
          event.data?.document ||
          event.data?.audio ||
          event.data?.video ||
          event.data?.gif ||
          event.data?.isGif
        if (!hasMsg) return

        const incomingLine: HistoryLine = {
          id: event.data?.id || event.data?.stanzaId || undefined,
          direction: 'incoming',
          text: event.data?.message || event.data?.text || '',
          timestamp: event.data?.timestamp || Math.floor(Date.now() / 1000),
          from: event.data?.senderName || event.data?.contact || contact,
          senderJid: event.data?.senderJid || undefined,
          audio: event.data?.audio,
          image: event.data?.image,
          sticker: event.data?.sticker,
          document: event.data?.document,
          documentName: event.data?.documentName,
          video: event.data?.video,
          gif: event.data?.gif,
          isGif: event.data?.isGif,
          quoted: normalizeIncomingQuoted(event.data?.quoted)
        }

        setLocalHistory((prev) => appendHistoryLine(prev, incomingLine))
        return
      }

      // Eco de mensagem enviada pelo próprio número em outro aparelho: aparece
      // no overlay aberto como balão verde sem precisar reabrir.
      if (eventType === 'message_sent') {
        const rawJid =
          event.data?.contactJid || event.data?.jid || event.data?.replyJid || event.data?.contact || ''
        if (!rawJid || !isSameChat(String(rawJid), contactJid)) return
        const text = event.data?.text || event.data?.message || ''
        const hasMsg =
          text ||
          event.data?.image ||
          event.data?.sticker ||
          event.data?.document ||
          event.data?.audio ||
          event.data?.video ||
          event.data?.gif ||
          event.data?.isGif
        if (!hasMsg) return
        const outgoingLine: HistoryLine = {
          id: event.data?.id || undefined,
          direction: 'outgoing',
          text,
          timestamp: event.data?.timestamp || Math.floor(Date.now() / 1000),
          from: event.data?.from || contact,
          senderJid: event.data?.senderJid || undefined,
          audio: event.data?.audio,
          image: event.data?.image,
          sticker: event.data?.sticker,
          document: event.data?.document,
          documentName: event.data?.documentName,
          video: event.data?.video,
          gif: event.data?.gif,
          isGif: event.data?.isGif,
          quoted: normalizeIncomingQuoted(event.data?.quoted)
        }
        setLocalHistory((prev) => appendHistoryLine(prev, outgoingLine))
      }
    }
  })

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  const sendReply = useCallback(
    async (
      text: string,
      gen: number,
      imagesToSend: string[] = [],
      documentsToSend: AttachedDocument[] = []
    ) => {
      const targetJid = activeRecipient.jid
      const body = text?.trim() || ''
      if (
        (!body && imagesToSend.length === 0 && documentsToSend.length === 0) ||
        gen !== interactionGenRef.current
      ) {
        if (gen === interactionGenRef.current) setSending(false)
        return
      }
      const currentReply =
        replyingTo ||
        (!isHistoryOverlay &&
        !isStatus &&
        (message || data?.image || data?.video || data?.document || data?.audio || data?.sticker || data?.gif || data?.isGif)
          ? singleMessageLine
          : null)
      // Sem stanzaId o worker não consegue anexar a citação: enviar sem
      // `quoted` evita o balão local de "respondido" que chega como mensagem
      // comum no aparelho do contato.
      const quotedReply = currentReply?.id ? currentReply : null
      const quotedPayload = quotedReply
        ? buildQuotedPayload(quotedReply, {
            youLabel,
            fallbackFrom: activeRecipient.name || contact
          })
        : null
      setSending(true)
      setCustomText('')
      setReplyingTo(null)
      setPastedImages([])
      setAttachedDocuments([])
      setSendError('')
      try {
        const base = getApiBaseUrl()
        if (!base) {
          setSendError(t('panel.server_error'))
          setSending(false)
          return
        }

        const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
          },
          body: JSON.stringify({
            toolName: 'send_message',
            args: {
              contact: targetJid,
              message: body,
              ...(quotedPayload
                ? {
                    quotedMessageId: quotedPayload.id,
                    quoted: quotedPayload
                  }
                : {}),
              ...(isStatus && data?.statusContext ? { statusContext: data.statusContext } : {}),
              ...(imagesToSend.length > 0
                ? { images: imagesToSend, image: imagesToSend[0] }
                : {}),
              ...(documentsToSend.length > 0
                ? {
                    documents: documentsToSend.map((d) => ({
                      dataUrl: d.dataUrl,
                      fileName: d.name,
                      mimetype: d.mimetype
                    })),
                    document: {
                      dataUrl: documentsToSend[0].dataUrl,
                      fileName: documentsToSend[0].name,
                      mimetype: documentsToSend[0].mimetype
                    }
                  }
                : {})
            }
          })
        })

        const resData = await res.json()
        if (gen !== interactionGenRef.current) return

        if (!resData?.ok) {
          setSendError(t('panel.send_error', { error: resData?.error || t('panel.server_error') }))
          setSending(false)
          setMinimized(false)
          return
        }
        try {
          const bc = new BroadcastChannel('momai-whatsapp-channel')
          bc.postMessage({
            type: 'message_sent',
            data: {
              jid: targetJid,
              text: body,
              direction: 'outgoing',
              timestamp: Math.floor(Date.now() / 1000),
              contact: activeRecipient.name || contact,
              id: resData?.id || undefined,
              isGroup: activeRecipient.isGroup,
              groupName: activeRecipient.isGroup ? activeRecipient.name : undefined,
              image: imagesToSend[0] || undefined,
              document: documentsToSend[0]?.dataUrl || undefined,
              documentName: documentsToSend[0]?.name || undefined,
              quoted: quotedPayload || undefined
            }
          })
          bc.close()
        } catch {}
        if (isHistoryOverlay) {
          setCustomText('')
          setPastedImages([])
          setAttachedDocuments([])
          setReplyingTo(null)
          setSending(false)
          setMinimized(false)
          const outgoingLine: HistoryLine = {
            id: resData?.id || undefined,
            direction: 'outgoing',
            text: body,
            timestamp: Math.floor(Date.now() / 1000),
            quoted: quotedPayload || undefined,
            ...(imagesToSend.length > 0 ? { image: imagesToSend[0] } : {}),
            ...(documentsToSend.length > 0
              ? { document: documentsToSend[0]?.dataUrl, documentName: documentsToSend[0]?.name }
              : {})
          }
          setLocalHistory((prev) => appendHistoryLine(prev, outgoingLine))
        } else {
          dismissAfterEngagement()
        }
      } catch (err: any) {
        if (gen !== interactionGenRef.current) return
        setSendError(
          t('panel.send_error', { error: err?.message || t('panel.server_error') })
        )
        setSending(false)
        setMinimized(false)
      }
    },
    [activeRecipient, isHistoryOverlay, dismissAfterEngagement, isStatus, data?.statusContext, youLabel, replyingTo, message, singleMessageLine, contact, t]
  )

  const handleInsertEmoji = useCallback((emoji: string) => {
    const input = inputRef.current
    if (!input) {
      setCustomText((prev) => prev + emoji)
      return
    }
    const start = input.selectionStart ?? customText.length
    const end = input.selectionEnd ?? customText.length
    const newText = customText.slice(0, start) + emoji + customText.slice(end)
    setCustomText(newText)
    setTimeout(() => {
      input.focus()
      const newPos = start + emoji.length
      input.setSelectionRange(newPos, newPos)
    }, 0)
  }, [customText])

  const loadStickers = useCallback(async () => {
    setLoadingStickers(true)
    try {
      const base = getApiBaseUrl()
      if (!base) return
      const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
        },
        body: JSON.stringify({
          toolName: 'get_stickers',
          args: {}
        })
      })
      const resData = await res.json()
      if (resData?.ok && Array.isArray(resData.stickers)) {
        setAvailableStickers(resData.stickers)
      }
    } catch (err) {
      console.error('[WhatsAppPanel] Falha ao carregar stickers:', err)
    } finally {
      setLoadingStickers(false)
    }
  }, [])

  const handleSendSticker = useCallback(
    async (stickerFilename: string) => {
      setShowMediaPicker(false)
      const gen = beginUserSend()
      const targetJid = activeRecipient.jid
      setSending(true)
      setSendError('')
      try {
        const base = getApiBaseUrl()
        if (!base) {
          setSendError(t('panel.server_error'))
          setSending(false)
          return
        }
        const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
          },
          body: JSON.stringify({
            toolName: 'send_message',
            args: {
              contact: targetJid,
              sticker: stickerFilename
            }
          })
        })
        const resData = await res.json()
        if (gen !== interactionGenRef.current) return
        if (resData?.ok) {
          if (isHistoryOverlay) {
            setSending(false)
            setLocalHistory((prev) =>
              appendHistoryLine(prev, {
                id: resData?.id || undefined,
                direction: 'outgoing',
                text: '',
                sticker: stickerFilename,
                timestamp: Math.floor(Date.now() / 1000)
              })
            )
          } else {
            dismissAfterEngagement()
          }
        } else {
          setSendError(t('panel.send_sticker_error', { error: resData?.error || t('panel.server_error') }))
          setSending(false)
        }
      } catch (err: any) {
        if (gen !== interactionGenRef.current) return
        setSendError(t('panel.send_sticker_error', { error: err?.message || t('panel.server_error') }))
        setSending(false)
      }
    },
    [activeRecipient.jid, beginUserSend, isHistoryOverlay, dismissAfterEngagement]
  )

  const handleSendGif = useCallback(
    async (gifUrl: string, previewUrl?: string) => {
      setShowMediaPicker(false)
      const gen = beginUserSend()
      const targetJid = activeRecipient.jid
      setSending(true)
      setSendError('')
      try {
        const base = getApiBaseUrl()
        if (!base) {
          setSendError(t('panel.server_error'))
          setSending(false)
          return
        }
        const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
          },
          body: JSON.stringify({
            toolName: 'send_message',
            args: {
              contact: targetJid,
              gif: gifUrl
            }
          })
        })
        const resData = await res.json()
        if (gen !== interactionGenRef.current) return
        if (resData?.ok) {
          if (isHistoryOverlay) {
            setSending(false)
            const isMp4 =
              gifUrl.endsWith('.mp4') ||
              gifUrl.includes('.mp4?') ||
              gifUrl.includes('/mp4') ||
              gifUrl.startsWith('data:video/')
            const displayMedia = previewUrl || gifUrl
            setLocalHistory((prev) =>
              appendHistoryLine(prev, {
                id: resData?.id || undefined,
                direction: 'outgoing',
                text: '',
                video: isMp4 ? gifUrl : undefined,
                image: !isMp4 ? displayMedia : undefined,
                gif: displayMedia,
                isGif: true,
                timestamp: Math.floor(Date.now() / 1000)
              })
            )
          } else {
            dismissAfterEngagement()
          }
        } else {
          setSendError(t('panel.send_gif_error', { error: resData?.error || t('panel.server_error') }))
          setSending(false)
        }
      } catch (err: any) {
        if (gen !== interactionGenRef.current) return
        setSendError(t('panel.send_gif_error', { error: err?.message || t('panel.server_error') }))
        setSending(false)
      }
    },
    [activeRecipient.jid, beginUserSend, isHistoryOverlay, dismissAfterEngagement, t]
  )

  const handleQuickReply = useCallback(
    (reply: string) => {
      if (sending) return
      const gen = beginUserSend()
      void sendReply(reply, gen)
    },
    [sending, sendReply, beginUserSend]
  )

  if (!data || data?.status === 'disconnected' || data?.qr) return null

  const isSelectedMember = Boolean(!activeRecipient.isGroup && activeRecipient.fromGroupJid)
  const contactName = activeRecipient.name || senderName || contact || t('panel.unknown_contact')
  const payloadQuickReplies = Array.isArray(quickReplies)
    ? quickReplies.filter(
        (reply: unknown): reply is string => typeof reply === 'string' && reply.trim().length > 0
      )
    : []
  const resolvedQuickReplies = isHistoryOverlay
    ? []
    : payloadQuickReplies.length > 0
      ? payloadQuickReplies
      : generatedQuickReplies

  return (
    <>
      <div
        className="flex items-start gap-3 p-4 select-none"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div
          ref={cardRef}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={handleDropImage}
          className={`flex flex-col rounded-2xl border border-border bg-card overflow-hidden relative ${
            minimized ? 'hidden' : ''
          }`}
          style={{
            WebkitAppRegion: 'drag',
            width: `${showHistoryView ? 560 : 320}px`,
            height: `${
              showHistoryView
                ? pastedImages.length > 0 || attachedDocuments.length > 0
                  ? 540
                  : 440
                : pastedImages.length > 0 || attachedDocuments.length > 0
                  ? 520
                  : 400
            }px`,
            maxHeight: `${
              showHistoryView
                ? pastedImages.length > 0 || attachedDocuments.length > 0
                  ? 540
                  : 440
                : pastedImages.length > 0 || attachedDocuments.length > 0
                  ? 520
                  : 400
            }px`
          } as any}
        >
          {toastMessage && (
            <div
              className="absolute top-12 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-lg bg-card/95 backdrop-blur-sm border border-border shadow-lg text-[11px] font-medium text-text select-none animate-in fade-in slide-in-from-top-2 duration-150 flex items-center gap-1.5"
              style={{ WebkitAppRegion: 'no-drag' } as any}
            >
              <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Media overlay occupying the overlay card space without opaque frosted backdrop */}
          {(selectedImageUrl || selectedStickerUrl) && (
            <OverlayImagePreview
              src={selectedImageUrl || selectedStickerUrl || ''}
              alt={selectedStickerUrl ? 'Sticker' : message && !isMediaPlaceholder(message) ? message : 'Foto'}
              contactName={contactName}
              caption={selectedImageUrl && message && !isMediaPlaceholder(message) ? message : null}
              onClose={() => {
                setSelectedImageUrl(null)
                setSelectedStickerUrl(null)
              }}
            />
          )}

          {selectedVideoUrl && (
            <div
              className="absolute inset-0 z-30 flex flex-col bg-card animate-in fade-in duration-200 select-none overflow-hidden"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                ref={videoHeaderDragRef}
                className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border/40 bg-sidebar/30 select-none cursor-move w-full min-w-0"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                title={t('panel.drag_window') || 'Arraste para mover a janela'}
              >
                <button
                  type="button"
                  onClick={() => setSelectedVideoUrl(null)}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors p-1 rounded-md hover:bg-input/50 cursor-pointer"
                  title={t('panel.back_to_chat')}
                >
                  <ArrowLeftIcon className="w-3.5 h-3.5" />
                  <span className="font-medium">{t('panel.back_to_chat')}</span>
                </button>
                <span className="text-xs font-semibold text-text truncate max-w-[150px]">
                  {contactName}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedVideoUrl(null)}
                  className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors shrink-0 cursor-pointer"
                  aria-label={t('panel.close')}
                  title={t('panel.close')}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 w-full p-2 flex items-center justify-center overflow-hidden bg-black/90">
                <video
                  src={selectedVideoUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
            </div>
          )}

          {/* Header */}
          <div
            ref={cardHeaderDragRef}
            className="flex shrink-0 items-center gap-3 px-4 py-3 border-b border-border/40 bg-sidebar/30 select-none cursor-move w-full min-w-0 overflow-hidden"
            onClick={handleHeaderClick}
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title={activeRecipient.isGroup ? 'Clique para ver os membros do grupo ou arraste para mover' : 'Arraste para mover a janela'}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
              <div
                className="shrink-0 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (activeRecipient.isGroup) {
                    handleToggleParticipants()
                  }
                }}
              >
                <ContactAvatar
                  src={activeRecipient.avatar || (activeRecipient.isGroup ? avatarSrc : null)}
                  name={activeRecipient.name}
                  id={activeRecipient.jid}
                  onOpenImage={setSelectedImageUrl}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-text truncate select-none">
                    {activeRecipient.name}
                  </p>
                  {activeRecipient.fromGroupJid && !activeRecipient.isGroup && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReturnToGroup()
                      }}
                      className="text-[10px] text-accent hover:underline font-medium shrink-0 cursor-pointer"
                      title="Voltar para a conversa em grupo"
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                    >
                      ← Voltar ao grupo
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isStatus ? (
                    <span className="text-[11px] font-semibold truncate select-none text-accent">
                      {t('panel.status_of', { name: contactName })}
                    </span>
                  ) : activeRecipient.isGroup ? (
                    <span className="text-[11px] text-text-muted hover:text-accent font-medium truncate cursor-pointer transition-colors text-left">
                      {participants.length > 0
                        ? `${participants.length} participantes • clique para ver`
                        : 'Grupo • clique para ver membros'}
                    </span>
                  ) : (
                    <span className="text-[11px] text-text-muted font-medium truncate select-none">
                      {activeRecipient.fromGroupJid
                        ? `Mensagem direta (via ${activeRecipient.fromGroupName})`
                        : `${contactName} no WhatsApp`}
                    </span>
                  )}
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5 shrink-0"
                    fill="none"
                    stroke="#25D366"
                    strokeWidth="1.4"
                    aria-hidden
                  >
                    <path d="M12 2.5C6.753 2.5 2.5 6.753 2.5 12c0 1.7.446 3.296 1.226 4.684L2.5 21.5l4.916-1.29A9.45 9.45 0 0 0 12 21.5c5.247 0 9.5-4.253 9.5-9.5S17.247 2.5 12 2.5z" />
                    <path
                      d="M16.3 14.66c-.2.56-1.18 1.08-1.64 1.12-.42.04-.96.2-2.78-.52-2.32-.92-3.78-3.28-3.9-3.44-.12-.16-.94-1.24-.94-2.36 0-1.12.58-1.68.8-1.9.2-.22.44-.28.6-.28h.46c.14 0 .34.04.52.48l.92 2.24c.08.2.12.4.02.64-.08.16-.18.36-.3.48-.12.12-.24.26-.1.48.52.88 1.16 1.56 2.06 2.08.22.14.38.08.54-.08.14-.16.66-.76.84-1 .18-.24.36-.2.64-.1.26.1 1.68.8 1.96.94.28.14.48.2.54.32.08.12.08.68-.14 1.28z"
                      fill="#25D366"
                      stroke="none"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors shrink-0 cursor-pointer"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              aria-label={t('panel.close')}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div
            className="flex flex-col flex-1 min-w-0 w-full min-h-0 gap-3 p-4 overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            {showParticipants ? (
              <div className="flex flex-col flex-1 min-h-[15rem] max-h-none gap-2.5 overflow-hidden">
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/40">
                  <button
                    type="button"
                    onClick={() => setShowParticipants(false)}
                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors p-1 rounded-md hover:bg-input/50 cursor-pointer"
                  >
                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                    <span>{t('panel.back_to_chat')}</span>
                  </button>
                  <span className="text-[11px] font-medium text-text-muted">
                    {participants.length > 0 ? t('panel.members_count', { count: participants.length }) : t('panel.members')}
                  </span>
                </div>

                <div className="relative flex items-center px-2.5 py-1.5 rounded-lg bg-input border border-border focus-within:border-accent/40 transition-colors">
                  <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-muted shrink-0 mr-2" />
                  <input
                    type="text"
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    placeholder={t('panel.search_participant')}
                    className="w-full bg-transparent text-xs text-text placeholder:text-text-muted/50 focus:outline-none"
                  />
                  {participantSearch && (
                    <button
                      type="button"
                      onClick={() => setParticipantSearch('')}
                      className="p-0.5 rounded-md hover:bg-card text-text-muted hover:text-text"
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div
                  className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar"
                  style={{ maxHeight: '20rem' }}
                >
                  {loadingParticipants ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                      <p className="text-xs text-text-muted">{t('panel.loading_participants')}</p>
                    </div>
                  ) : filteredParticipants.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-xs text-text-muted">{t('panel.no_participants')}</p>
                    </div>
                  ) : (
                    filteredParticipants.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectParticipant(p)}
                        className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-input/60 transition-colors text-left group/item cursor-pointer"
                      >
                        <ContactAvatar
                          src={p.avatar || null}
                          name={p.name}
                          id={p.id}
                          onOpenImage={setSelectedImageUrl}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium text-text truncate group-hover/item:text-accent transition-colors">
                              {p.name}
                            </p>
                            {p.admin && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-accent/20 text-accent font-semibold shrink-0">
                                {p.admin}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-text-muted truncate">+{p.phone}</p>
                        </div>
                        <span className="text-[10px] text-text-muted/60 group-hover/item:text-accent font-medium shrink-0 flex items-center gap-1">
                          {t('panel.send_message')}
                          <PaperAirplaneIcon className="w-3 h-3" />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-w-0 w-full min-h-0 justify-between overflow-hidden">
                {/* Upper scrollable section */}
                <div
                  className={`flex-1 min-w-0 w-full min-h-0 ${
                    showHistoryView
                      ? 'flex flex-col overflow-hidden p-0'
                      : 'overflow-y-auto custom-scrollbar overscroll-contain pr-0.5 space-y-2'
                  }`}
                >
                  {showHistoryView ? (
                    <>

                    {/* Barra de Mensagem Fixada no topo do chat (Estilo WhatsApp Web) */}
                    {pinnedMessages.length > 0 && (
                      <div
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const currentPinned = pinnedMessages[pinnedIndex % pinnedMessages.length]
                          if (currentPinned) {
                            setPinnedContextMenu({ x: e.clientX, y: e.clientY, message: currentPinned })
                          }
                        }}
                        className="mb-2 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-card border border-border/50 shadow-xs select-none animate-in fade-in duration-150"
                      >
                        <button
                          type="button"
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const currentPinned = pinnedMessages[pinnedIndex % pinnedMessages.length]
                            if (currentPinned) {
                              setPinnedContextMenu({ x: e.clientX, y: e.clientY, message: currentPinned })
                            }
                          }}
                          onClick={() => {
                            const currentPinned = pinnedMessages[pinnedIndex % pinnedMessages.length]
                            if (currentPinned) {
                              scrollToMessage(currentPinned.timestamp)
                            }
                            if (pinnedMessages.length > 1) {
                              setPinnedIndex((prev) => (prev + 1) % pinnedMessages.length)
                            }
                          }}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer group/pin"
                        >
                          <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center text-accent shrink-0 group-hover/pin:bg-accent/25 transition-colors">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="17" x2="12" y2="22" />
                              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-accent truncate">
                                {pinnedMessages.length > 1
                                  ? `Mensagem fixada (${(pinnedIndex % pinnedMessages.length) + 1}/${pinnedMessages.length})`
                                  : 'Mensagem fixada'}
                              </span>
                            </div>
                            <p className="text-[10px] text-text-muted truncate max-w-full">
                              {(() => {
                                const m = pinnedMessages[pinnedIndex % pinnedMessages.length]
                                return (
                                  m.text ||
                                  m.documentName ||
                                  (m.image ? '📷 Foto' : m.video ? '🎥 Vídeo' : m.audio ? '🎙️ Áudio' : m.sticker ? 'Sticker' : 'Mensagem')
                                )
                              })()}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const currentPinned = pinnedMessages[pinnedIndex % pinnedMessages.length]
                            togglePinMessage(currentPinned.timestamp)
                            showToast(t('page.unpinned_toast', { defaultValue: 'Mensagem desafixada' }))
                          }}
                          className="p-1 rounded-md text-text-muted hover:text-text hover:bg-input/60 transition-colors shrink-0 cursor-pointer"
                          title={t('page.unpin', { defaultValue: 'Desafixar mensagem' })}
                          aria-label={t('page.unpin', { defaultValue: 'Desafixar mensagem' })}
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* MODO HISTÓRICO: Balões horizontais estilo WhatsApp */}
                    {conversationHistory.length > 0 ? (
                      <div
                        ref={historyScrollRef}
                        className="flex-1 min-w-0 w-full min-h-0 h-full overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar rounded-xl bg-input/20 border border-border/25 p-3 space-y-3.5 select-text"
                        style={{ overflowX: 'hidden', overflowY: 'auto' }}
                      >
                        {conversationHistory.map((line, i) => {
                          const isOutgoing = line.direction === 'outgoing'
                          const isNewDay =
                            i === 0 ||
                            isDifferentDay(conversationHistory[i - 1].timestamp, line.timestamp)
                          const prevMsg = i > 0 ? conversationHistory[i - 1] : null
                          const isSameSenderAsPrev =
                            !isNewDay &&
                            prevMsg !== null &&
                            prevMsg.direction === line.direction &&
                            (line.direction === 'outgoing' ||
                              (prevMsg.from || contact) === (line.from || contact))

                          const showSenderName = !isOutgoing && !isSameSenderAsPrev
                          const senderDisplayName =
                            line.from || (activeRecipient.isGroup ? 'Participante' : contact)

                          const isGifMsg = Boolean(
                            line.isGif ||
                              line.gif ||
                              (line.video && (line.isGif || isGifUrl(line.video) || line.text === '[GIF]')) ||
                              (line.image && isGifUrl(line.image)) ||
                              isGifUrl(line.text)
                          )
                          const onlyEmojiCount =
                            !line.quoted &&
                            !line.audio &&
                            !line.image &&
                            !line.video &&
                            !line.document &&
                            !line.sticker &&
                            !line.gif &&
                            !line.isGif
                              ? getOnlyEmojiCount(line.text)
                              : null
                          const isOnlyEmojiMsg = Boolean(onlyEmojiCount !== null)
                          const isStickerMsg = Boolean(
                            line.sticker && !line.quoted && (!line.text || isMediaPlaceholder(line.text))
                          )
                          const isPureMedia = Boolean(
                            !line.quoted &&
                              (isStickerMsg ||
                                isOnlyEmojiMsg ||
                                (isGifMsg && (!line.text || isMediaPlaceholder(line.text) || isGifUrl(line.text))) ||
                                (line.video && (!line.text || isMediaPlaceholder(line.text))) ||
                                (line.image && (!line.text || isMediaPlaceholder(line.text))))
                          )

                          return (
                            <Fragment key={`${line.timestamp}-${i}`}>
                              {isNewDay && (
                                <div className="flex justify-center my-2 select-none">
                                  <span className="px-3 py-1 text-[10px] font-medium rounded-lg bg-input/70 text-text-muted border border-border/40 shadow-xs uppercase tracking-wider">
                                    {formatDateSeparator(line.timestamp, locale, {
                                      today: t('panel.today'),
                                      yesterday: t('panel.yesterday')
                                    })}
                                  </span>
                                </div>
                              )}
                              <div
                                className={`flex items-center gap-2.5 w-full ${
                                  isOutgoing ? 'justify-end' : 'justify-start'
                                } ${isSameSenderAsPrev ? 'mt-1' : 'mt-2.5'}`}
                              >
                                {isSelectionMode && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleSelectMessage(line.timestamp)
                                    }}
                                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                                      selectedMessageTimestamps.includes(line.timestamp)
                                        ? 'bg-accent border-accent text-card'
                                        : 'border-border/60 bg-input/40 hover:border-accent/60'
                                    }`}
                                    aria-label="Selecionar mensagem"
                                  >
                                    {selectedMessageTimestamps.includes(line.timestamp) && (
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    )}
                                  </button>
                                )}
                                <div
                                  className={`flex flex-col ${
                                    isOutgoing ? 'items-end self-end' : 'items-start self-start'
                                  } max-w-[85%] min-w-0`}
                                  style={{ maxWidth: isSelectionMode ? 'calc(85% - 2rem)' : '85%' }}
                                >
                                  {showSenderName && (
                                    <span className="text-[11px] font-semibold mb-1 px-1 select-text text-accent truncate max-w-full">
                                      {senderDisplayName}
                                    </span>
                                  )}
                                  <div
                                    id={`msg-${line.timestamp}`}
                                    onClick={() => {
                                      if (isSelectionMode) {
                                        toggleSelectMessage(line.timestamp)
                                      }
                                    }}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation()
                                      if (!isSelectionMode) {
                                        setReplyingTo(line)
                                        inputRef.current?.focus()
                                      }
                                    }}
                                    onContextMenu={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      setMessageContextMenu({ x: e.clientX, y: e.clientY, message: line })
                                    }}
                                    className={`group/bubble relative select-text flex flex-col max-w-full min-w-0 transition-all ${
                                      isStickerMsg || isOnlyEmojiMsg
                                        ? 'bg-transparent border-transparent shadow-none p-0 overflow-visible'
                                        : `rounded-lg shadow-xs border overflow-hidden ${
                                            isPureMedia ? 'p-[2px] gap-0' : 'px-2.5 py-1.5 gap-1'
                                          } ${
                                            selectedMessageTimestamps.includes(line.timestamp)
                                              ? 'ring-2 ring-accent/60 bg-accent/20'
                                              : highlightedMessageTs === line.timestamp
                                                ? 'ring-2 ring-accent shadow-md animate-pulse'
                                                : ''
                                          } ${getChatBubbleClasses(isOutgoing)}`
                                    }`}
                                    style={
                                      isStickerMsg || isOnlyEmojiMsg
                                        ? { wordBreak: 'break-word', overflowWrap: 'anywhere' }
                                        : {
                                            ...getChatBubbleStyle(isOutgoing),
                                            wordBreak: 'break-word',
                                            overflowWrap: 'anywhere'
                                          }
                                    }
                                  >
                                    {/* Quick context menu button on hover (like WhatsApp Web) */}
                                    {!isSelectionMode && !isStickerMsg && !isOnlyEmojiMsg && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          const rect = e.currentTarget.getBoundingClientRect()
                                          setMessageContextMenu({ x: rect.left, y: rect.bottom + 4, message: line })
                                        }}
                                        className={`absolute top-1 right-1.5 p-0.5 rounded-full opacity-0 group-hover/bubble:opacity-100 transition-opacity z-20 cursor-pointer shadow-xs ${
                                          isOutgoing
                                            ? 'bg-black/30 hover:bg-black/50 text-white'
                                            : 'bg-card/80 hover:bg-card text-text border border-border/50'
                                        }`}
                                        title="Opções da mensagem"
                                      >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                      </button>
                                    )}

                                    {/* Bloco de citação no padrão do WhatsApp Web (igual nos dois overlays) */}
                                    {line.quoted && (
                                      <QuotedMessage
                                        quoted={line.quoted}
                                        isOutgoing={isOutgoing}
                                        youLabel={youLabel}
                                        contactName={
                                          activeRecipient.isGroup
                                            ? undefined
                                            : activeRecipient.name || contact
                                        }
                                        findLine={(id) => messageById.get(id)}
                                        replyLabel={t('page.reply')}
                                        onOpenQuote={(ts) => {
                                          if (ts) scrollToMessage(ts)
                                        }}
                                        getImageUrl={getImageUrl}
                                      />
                                    )}

                                    {(() => {
                                      const isGifMsg = Boolean(
                                        line.isGif ||
                                          line.gif ||
                                          (line.video && (line.isGif || isGifUrl(line.video) || line.text === '[GIF]')) ||
                                          (line.image && isGifUrl(line.image)) ||
                                          isGifUrl(line.text)
                                      )
                                      const gifUrlResolved =
                                        (line.gif
                                          ? isDirectUrl(line.gif)
                                            ? line.gif
                                            : line.gif.endsWith('.mp4') || line.gif.includes('.mp4?') || line.gif.includes('/mp4')
                                              ? getVideoUrl(line.gif)
                                              : getImageUrl(line.gif)
                                          : '') ||
                                        (line.video && isGifMsg ? getVideoUrl(line.video) : '') ||
                                        (line.image && isGifMsg ? getImageUrl(line.image) : '') ||
                                        (isGifUrl(line.text) ? line.text.trim() : '')

                                      const timestampOverlayNode = isPureMedia ? (
                                        <div className="flex items-center gap-1 shrink-0 select-none">
                                          {pinnedMessageTimestamps.includes(line.timestamp) && (
                                            <span title={t('page.pin')} className="text-white/80 shrink-0">
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="17" x2="12" y2="22" />
                                                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                                              </svg>
                                            </span>
                                          )}
                                          {starredMessageTimestamps.includes(line.timestamp) && (
                                            <span title={t('page.favorite')} className="text-amber-400 shrink-0">
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                              </svg>
                                            </span>
                                          )}
                                          <span className="text-[10px] select-none font-normal shrink-0 text-white/95 leading-none">
                                            {formatHistoryTime(line.timestamp, locale)}
                                          </span>
                                          {isOutgoing && (
                                            <span className="text-white/90 shrink-0 inline-flex items-center">
                                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="18 6 9 15 4 10" />
                                                <polyline points="22 10 13 19 11 17" />
                                              </svg>
                                            </span>
                                          )}
                                        </div>
                                      ) : undefined

                                      // For sticker/emoji-only messages the timestamp sits
                                      // BELOW the media (not over it) and uses the bubble
                                      // colors: outgoing green/white, incoming input/text.
                                      const bubbleTimeNode = (
                                        <div
                                          className={`flex items-center gap-1 shrink-0 select-none px-1.5 py-0.5 rounded-md text-[10px] font-normal ${
                                            isOutgoing
                                              ? 'text-white'
                                              : 'bg-input/80 border border-border/50 text-text'
                                          }`}
                                          style={getChatBubbleStyle(isOutgoing)}
                                        >
                                          {pinnedMessageTimestamps.includes(line.timestamp) && (
                                            <span
                                              title={t('page.pin')}
                                              className={
                                                isOutgoing
                                                  ? 'text-white/80 shrink-0'
                                                  : 'text-text-muted shrink-0'
                                              }
                                            >
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="17" x2="12" y2="22" />
                                                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                                              </svg>
                                            </span>
                                          )}
                                          {starredMessageTimestamps.includes(line.timestamp) && (
                                            <span
                                              title={t('page.favorite')}
                                              className="text-highlight shrink-0"
                                            >
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                              </svg>
                                            </span>
                                          )}
                                          <span
                                            className={`inline-flex items-center gap-1 ${getChatBubbleTimeClasses(
                                              isOutgoing
                                            )}`}
                                          >
                                            <span>{formatHistoryTime(line.timestamp, locale)}</span>
                                            {isOutgoing && (
                                              <span className="shrink-0 inline-flex items-center" title="Enviada">
                                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                  <polyline points="18 6 9 15 4 10" />
                                                  <polyline points="22 10 13 19 11 17" />
                                                </svg>
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                      )

                                      if (isGifMsg && gifUrlResolved) {
                                        return (
                                          <div className="flex flex-col gap-1 max-w-full overflow-hidden">
                                            <GifThumbnail
                                              src={gifUrlResolved}
                                              alt={line.text && !isMediaPlaceholder(line.text) && !isGifUrl(line.text) ? line.text : 'GIF'}
                                              timestampOverlay={timestampOverlayNode}
                                              onOpen={() => {
                                                const isVid =
                                                  gifUrlResolved.endsWith('.mp4') ||
                                                  gifUrlResolved.includes('.mp4?') ||
                                                  gifUrlResolved.includes('/mp4') ||
                                                  gifUrlResolved.startsWith('data:video/')
                                                if (isVid) setSelectedVideoUrl(gifUrlResolved)
                                                else setSelectedImageUrl(gifUrlResolved)
                                              }}
                                            />
                                            {line.text && !isMediaPlaceholder(line.text) && !isGifUrl(line.text) && (
                                              <p
                                                className="text-xs whitespace-pre-wrap break-words select-text max-w-full"
                                                style={{
                                                  wordBreak: 'break-word',
                                                  overflowWrap: 'anywhere'
                                                }}
                                              >
                                                {renderTextWithLinks(line.text, isOutgoing)}
                                              </p>
                                            )}
                                          </div>
                                        )
                                      }

                                      if (line.video) {
                                        return (
                                          <div className="flex flex-col gap-1 max-w-full overflow-hidden">
                                            <VideoThumbnail
                                              src={getVideoUrl(line.video)}
                                              alt={line.text && !isMediaPlaceholder(line.text) ? line.text : 'Vídeo'}
                                              timestampOverlay={timestampOverlayNode}
                                              onOpen={() => setSelectedVideoUrl(getVideoUrl(line.video!))}
                                            />
                                            {line.text && !isMediaPlaceholder(line.text) && (
                                              <p
                                                className="text-xs whitespace-pre-wrap break-words select-text max-w-full"
                                                style={{
                                                  wordBreak: 'break-word',
                                                  overflowWrap: 'anywhere'
                                                }}
                                              >
                                                {renderTextWithLinks(line.text, isOutgoing)}
                                              </p>
                                            )}
                                          </div>
                                        )
                                      }

                                      if (line.image) {
                                        return (
                                          <div className="flex flex-col gap-1 max-w-full overflow-hidden">
                                            <MediaThumbnail
                                              src={getImageUrl(line.image)}
                                              alt={line.text && !isMediaPlaceholder(line.text) ? line.text : 'Foto'}
                                              timestampOverlay={timestampOverlayNode}
                                              onOpen={() => setSelectedImageUrl(getImageUrl(line.image!))}
                                            />
                                            {line.text && !isMediaPlaceholder(line.text) && (
                                              <p
                                                className="text-xs whitespace-pre-wrap break-words select-text max-w-full"
                                                style={{
                                                  wordBreak: 'break-word',
                                                  overflowWrap: 'anywhere'
                                                }}
                                              >
                                                {renderTextWithLinks(line.text, isOutgoing)}
                                              </p>
                                            )}
                                          </div>
                                        )
                                      }

                                      if (line.sticker) {
                                        return (
                                          <div className="flex flex-col items-end gap-0.5 group/sticker">
                                            <StickerImg
                                              src={getStickerUrl(line.sticker)}
                                              onOpen={() => setSelectedStickerUrl(getStickerUrl(line.sticker!))}
                                            />
                                            {bubbleTimeNode}
                                          </div>
                                        )
                                      }

                                      // Sticker sem arquivo (download falhou): mostra placeholder em vez de bolha vazia
                                      if (line.text === '[Sticker]') {
                                        return (
                                          <div className="flex items-center gap-1.5 text-xs text-text-muted select-none">
                                            <span className="text-base" aria-hidden="true">
                                              🏷️
                                            </span>
                                            <span>Figurinha</span>
                                          </div>
                                        )
                                      }

                                      if (onlyEmojiCount !== null && line.text) {
                                        const sizeClass =
                                          onlyEmojiCount === 1
                                            ? 'text-5xl sm:text-6xl'
                                            : onlyEmojiCount === 2
                                              ? 'text-4xl sm:text-5xl'
                                              : 'text-3xl sm:text-4xl'
                                        return (
                                          <div className="flex flex-col items-end gap-0.5 group/emoji select-none">
                                            <span className={`${sizeClass} select-text leading-none drop-shadow-xs tracking-normal self-center`}>
                                              {line.text.trim()}
                                            </span>
                                            {bubbleTimeNode}
                                          </div>
                                        )
                                      }

                                      if (line.text && !isMediaPlaceholder(line.text)) {
                                        return (
                                          <p
                                            className="text-xs whitespace-pre-wrap break-words select-text leading-relaxed max-w-full"
                                            style={{
                                              wordBreak: 'break-word',
                                              overflowWrap: 'anywhere'
                                            }}
                                          >
                                            {renderTextWithLinks(line.text, isOutgoing)}
                                          </p>
                                        )
                                      }

                                      return null
                                    })()}
                                    {line.document ? (
                                      <DocumentCard
                                        file={line.document}
                                        name={line.documentName || line.document}
                                        opening={openingFile === line.document}
                                        onOpen={() =>
                                          openDocument(line.document!, line.documentName || line.document)
                                        }
                                      />
                                    ) : null}
                                    {(line.audio || ((line.text === '🎙️ Áudio' || line.text === '🎙️ Audio') && data?.audio)) && (
                                      <CustomAudioPlayer src={getAudioUrl(line.audio || data?.audio)} />
                                    )}
                                    {!isPureMedia && (
                                      <div className="flex justify-end items-center gap-1.5 mt-0.5 shrink-0">
                                        {pinnedMessageTimestamps.includes(line.timestamp) && (
                                          <span title={t('page.pin')} className="text-text-muted shrink-0">
                                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                              <line x1="12" y1="17" x2="12" y2="22" />
                                              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                                            </svg>
                                          </span>
                                        )}
                                        {starredMessageTimestamps.includes(line.timestamp) && (
                                          <span title={t('page.favorite')} className="text-highlight shrink-0">
                                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                            </svg>
                                          </span>
                                        )}
                                        <span
                                          className={`text-[10px] select-none font-normal shrink-0 inline-flex items-center gap-1 ${getChatBubbleTimeClasses(
                                            isOutgoing
                                          )}`}
                                        >
                                          <span>{formatHistoryTime(line.timestamp, locale)}</span>
                                          {isOutgoing && (
                                            <span className="text-white/90 shrink-0 inline-flex items-center" title="Enviada">
                                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="18 6 9 15 4 10" />
                                                <polyline points="22 10 13 19 11 17" />
                                              </svg>
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Fragment>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="h-44 rounded-xl bg-input/20 border border-border/25 p-4 flex items-center justify-center select-none">
                        <p className="text-xs text-text-muted/60 font-normal">
                          {activeRecipient.fromGroupJid && !activeRecipient.isGroup
                            ? `Inicie uma conversa direta com ${activeRecipient.name}`
                            : 'Nenhuma mensagem recente'}
                        </p>
                      </div>
                    )}
                    </>
                  ) : (
                    /* MODO NOTIFICAÇÃO (Novas Mensagens): Mostra todas as mensagens recebidas durante a sessão do overlay */
                    isStatus ? (
                      message || data?.image || data?.sticker || data?.document || data?.audio || data?.video ? (
                        <div className="flex flex-col gap-2 min-w-0 overflow-hidden select-text">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-accent select-text">
                              {t('panel.status_of', { name: senderName || contact })}
                            </span>
                            {data?.timestamp && (
                              <span className="text-[10px] text-text-muted ml-auto shrink-0 select-none">
                                {formatHistoryTime(data.timestamp, locale)}
                              </span>
                            )}
                          </div>
                          {data?.video ? (
                            <video
                              src={getVideoUrl(data.video)}
                              controls
                              preload="metadata"
                              playsInline
                              className="w-full h-auto max-h-72 object-contain rounded-lg bg-black"
                            />
                          ) : data?.image ? (
                            <img
                              src={getImageUrl(data.image)}
                              alt={message && !isMediaPlaceholder(message) ? message : 'Status'}
                              loading="lazy"
                              onClick={() => {
                                notifyConversationRead()
                                setSelectedImageUrl(getImageUrl(data.image))
                              }}
                              title={t('panel.photo_click')}
                              className="w-full h-auto max-h-72 object-contain rounded-lg cursor-pointer"
                            />
                          ) : data?.sticker ? (
                            <img
                              src={getStickerUrl(data.sticker)}
                              alt="Sticker"
                              loading="lazy"
                              onClick={() => {
                                notifyConversationRead()
                                setSelectedStickerUrl(getStickerUrl(data.sticker))
                              }}
                              title={t('panel.sticker_click')}
                              className="w-full h-48 object-contain rounded-lg cursor-pointer"
                            />
                          ) : null}
                          {message && !isMediaPlaceholder(message) && (
                            <p
                              className="text-sm text-text/90 whitespace-pre-wrap break-words select-text max-w-full"
                              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                            >
                              {renderTextWithLinks(message)}
                            </p>
                          )}
                          {data?.document ? (
                            <DocumentCard
                              file={data.document}
                              name={data.documentName || data.document}
                              opening={openingFile === data.document}
                              onOpen={() => {
                                notifyConversationRead()
                                openDocument(data.document, data.documentName || data.document)
                              }}
                            />
                          ) : null}
                          {data?.audio && (
                            <CustomAudioPlayer src={getAudioUrl(data.audio)} />
                          )}
                        </div>
                      ) : (
                        <div className="min-h-[4.5rem] rounded-lg bg-input/40 border border-border/30 p-3 flex items-center justify-center select-none">
                          <p className="text-xs text-text-muted/60 font-normal">
                            Nenhuma mensagem recente
                          </p>
                        </div>
                      )
                    ) : localHistory.length > 0 ? (
                      <div
                        ref={historyScrollRef}
                        className="flex flex-col gap-2 min-w-0 w-full min-h-0 flex-1 overflow-y-auto custom-scrollbar overscroll-contain pr-0.5 select-text"
                      >
                        {localHistory.map((line, i) => {
                          const isOutgoing = line.direction === 'outgoing'
                          const lineSender =
                            line.from ||
                            (isOutgoing
                              ? youLabel
                              : senderName || contact)
                          const isGifNotif = Boolean(
                            line.isGif ||
                              line.gif ||
                              (line.video && (isGifUrl(line.video) || line.text === '[GIF]')) ||
                              (line.image && isGifUrl(line.image)) ||
                              isGifUrl(line.text)
                          )
                          const notifGifUrl =
                            (line.gif
                              ? isDirectUrl(line.gif)
                                ? line.gif
                                : line.gif.endsWith('.mp4') ||
                                    line.gif.includes('.mp4?') ||
                                    line.gif.includes('/mp4')
                                  ? getVideoUrl(line.gif)
                                  : getImageUrl(line.gif)
                              : '') ||
                            (line.video && isGifNotif ? getVideoUrl(line.video) : '') ||
                            (line.image && isGifNotif ? getImageUrl(line.image) : '') ||
                            (isGifUrl(line.text) ? line.text.trim() : '')

                          return (
                            <div
                              key={line.id || `${line.timestamp}-${i}`}
                              className="flex items-center gap-2.5 w-full shrink-0"
                            >
                              {isSelectionMode && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleSelectMessage(line.timestamp)
                                  }}
                                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                                    selectedMessageTimestamps.includes(line.timestamp)
                                      ? 'bg-accent border-accent text-card'
                                      : 'border-border/60 bg-input/40 hover:border-accent/60'
                                  }`}
                                  aria-label="Selecionar mensagem"
                                >
                                  {selectedMessageTimestamps.includes(line.timestamp) && (
                                    <svg
                                      className="w-3.5 h-3.5"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </button>
                              )}
                              <div
                                id={`msg-${line.timestamp}`}
                                onClick={() => {
                                  if (isSelectionMode) {
                                    toggleSelectMessage(line.timestamp)
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  if (!isSelectionMode) {
                                    setReplyingTo(line)
                                    inputRef.current?.focus()
                                  }
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setMessageContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    message: line
                                  })
                                }}
                                className={`min-h-[4.5rem] rounded-lg bg-input/40 border p-2.5 select-text flex flex-col justify-center min-w-0 overflow-hidden flex-1 transition-all ${
                                  isSelectionMode ? 'cursor-pointer' : ''
                                } ${
                                  selectedMessageTimestamps.includes(line.timestamp)
                                    ? 'ring-2 ring-accent/60 bg-accent/20 border-accent/40'
                                    : 'border-border/30'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-text-muted select-text truncate">
                                    {lineSender}
                                  </span>
                                  {line.timestamp && (
                                    <span className="text-[10px] text-text-muted ml-auto shrink-0 select-none">
                                      {formatHistoryTime(line.timestamp, locale)}
                                    </span>
                                  )}
                                </div>

                                {/* Bloco de citação no padrão do WhatsApp Web (igual ao overlay de contato) */}
                                {line.quoted && (
                                  <div className="mt-1.5">
                                    <QuotedMessage
                                      quoted={line.quoted}
                                      isOutgoing={isOutgoing}
                                      youLabel={youLabel}
                                      contactName={
                                        activeRecipient.isGroup
                                          ? undefined
                                          : activeRecipient.name || contact
                                      }
                                      findLine={(id) => messageById.get(id)}
                                      replyLabel={t('page.reply')}
                                      onOpenQuote={(ts) => {
                                        if (ts) scrollToMessage(ts)
                                      }}
                                      getImageUrl={getImageUrl}
                                    />
                                  </div>
                                )}

                                {isGifNotif && notifGifUrl && (
                                  <div className="mt-1 flex flex-col gap-1 max-w-full overflow-hidden">
                                    <GifThumbnail
                                      src={notifGifUrl}
                                      alt={
                                        line.text &&
                                        !isMediaPlaceholder(line.text) &&
                                        !isGifUrl(line.text)
                                          ? line.text
                                          : 'GIF'
                                      }
                                      onOpen={() => {
                                        notifyConversationRead()
                                        const isVid =
                                          notifGifUrl.endsWith('.mp4') ||
                                          notifGifUrl.includes('.mp4?') ||
                                          notifGifUrl.includes('/mp4') ||
                                          notifGifUrl.startsWith('data:video/')
                                        if (isVid) setSelectedVideoUrl(notifGifUrl)
                                        else setSelectedImageUrl(notifGifUrl)
                                      }}
                                    />
                                    {line.text &&
                                      !isMediaPlaceholder(line.text) &&
                                      !isGifUrl(line.text) && (
                                        <p
                                          className="text-sm text-text/90 whitespace-pre-wrap break-words select-text max-w-full"
                                          style={{
                                            wordBreak: 'break-word',
                                            overflowWrap: 'anywhere'
                                          }}
                                        >
                                          {renderTextWithLinks(line.text, isOutgoing)}
                                        </p>
                                      )}
                                  </div>
                                )}

                                {!isGifNotif && line.video && (
                                  <div className="mt-1 flex flex-col gap-1 max-w-full overflow-hidden">
                                    <VideoThumbnail
                                      src={getVideoUrl(line.video)}
                                      alt={
                                        line.text && !isMediaPlaceholder(line.text)
                                          ? line.text
                                          : 'Vídeo'
                                      }
                                      onOpen={() => {
                                        notifyConversationRead()
                                        setSelectedVideoUrl(getVideoUrl(line.video!))
                                      }}
                                    />
                                    {line.text && !isMediaPlaceholder(line.text) && (
                                      <p
                                        className="text-sm text-text/90 whitespace-pre-wrap break-words select-text max-w-full"
                                        style={{
                                          wordBreak: 'break-word',
                                          overflowWrap: 'anywhere'
                                        }}
                                      >
                                        {renderTextWithLinks(line.text, isOutgoing)}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {!isGifNotif && line.image && (
                                  <div className="mt-1 flex flex-col gap-1 max-w-full overflow-hidden">
                                    <MediaThumbnail
                                      src={getImageUrl(line.image)}
                                      alt={
                                        line.text && !isMediaPlaceholder(line.text)
                                          ? line.text
                                          : 'Foto'
                                      }
                                      onOpen={() => {
                                        notifyConversationRead()
                                        setSelectedImageUrl(getImageUrl(line.image!))
                                      }}
                                    />
                                    {line.text && !isMediaPlaceholder(line.text) && (
                                      <p
                                        className="text-sm text-text/90 whitespace-pre-wrap break-words select-text max-w-full"
                                        style={{
                                          wordBreak: 'break-word',
                                          overflowWrap: 'anywhere'
                                        }}
                                      >
                                        {renderTextWithLinks(line.text, isOutgoing)}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {!isGifNotif && line.sticker && (
                                  <div className="mt-1 flex items-center">
                                    <StickerImg
                                      src={getStickerUrl(line.sticker)}
                                      onOpen={() => {
                                        notifyConversationRead()
                                        setSelectedStickerUrl(getStickerUrl(line.sticker!))
                                      }}
                                    />
                                  </div>
                                )}

                                {!isGifNotif &&
                                  !line.video &&
                                  !line.image &&
                                  !line.sticker &&
                                  line.text === '[Sticker]' && (
                                    <div className="flex items-center gap-1.5 mt-1 text-xs text-text-muted select-none">
                                      <span className="text-base" aria-hidden="true">
                                        🏷️
                                      </span>
                                      <span>Figurinha</span>
                                    </div>
                                  )}

                                {!isGifNotif &&
                                  !line.video &&
                                  !line.image &&
                                  line.text &&
                                  !isMediaPlaceholder(line.text) && (
                                    <p
                                      className="text-sm text-text/90 mt-1 whitespace-pre-wrap break-words select-text max-w-full"
                                      style={{
                                        wordBreak: 'break-word',
                                        overflowWrap: 'anywhere'
                                      }}
                                    >
                                      {renderTextWithLinks(line.text, isOutgoing)}
                                    </p>
                                  )}

                                {line.document ? (
                                  <DocumentCard
                                    file={line.document}
                                    name={line.documentName || line.document}
                                    opening={openingFile === line.document}
                                    onOpen={() => {
                                      notifyConversationRead()
                                      openDocument(line.document!, line.documentName || line.document)
                                    }}
                                  />
                                ) : null}

                                {line.audio && <CustomAudioPlayer src={getAudioUrl(line.audio)} />}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="min-h-[4.5rem] rounded-lg bg-input/40 border border-border/30 p-3 flex items-center justify-center select-none">
                        <p className="text-xs text-text-muted/60 font-normal">
                          Nenhuma mensagem recente
                        </p>
                      </div>
                    )
                  )}
                </div>

                {docError && (
                  <p className="text-[11px] text-error px-1 select-text">{docError}</p>
                )}

                {/* Previews de Anexos Pendentes */}
                {(pastedImages.length > 0 || attachedDocuments.length > 0) && (
                  <div
                    className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-0.5 shrink-0 select-none custom-scrollbar overscroll-contain mt-2"
                    style={{
                      WebkitAppRegion: 'no-drag',
                      scrollbarWidth: 'thin'
                    } as any}
                    onWheel={(e) => e.stopPropagation()}
                  >
                    {pastedImages.map((imgSrc, index) => (
                      <div
                        key={`img-${index}`}
                        className="relative shrink-0 rounded-lg border border-accent/40 bg-input/80 p-1.5 flex items-center justify-between gap-2.5 animate-in fade-in duration-150"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <img
                            src={imgSrc}
                            alt={`Imagem ${index + 1}`}
                            className="w-10 h-10 object-cover rounded-md border border-border shadow-sm shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setSelectedImageUrl(imgSrc)}
                            title={t('panel.photo_click')}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-text truncate">
                              {pastedImages.length > 1
                                ? `Imagem ${index + 1} de ${pastedImages.length}`
                                : 'Imagem pronta para envio'}
                            </p>
                            <p className="text-[10px] text-text-muted truncate">
                              Adicione legenda opcional ou envie
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPastedImages((prev) => prev.filter((_, i) => i !== index))}
                          className="p-1 rounded-md text-text-muted hover:text-text hover:bg-card border border-transparent hover:border-border transition-all cursor-pointer shrink-0 self-start"
                          title="Remover imagem"
                          aria-label="Remover imagem"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {attachedDocuments.map((doc, index) => (
                      <div
                        key={doc.id || `doc-${index}`}
                        className="relative shrink-0 rounded-lg border border-accent/40 bg-input/80 p-1.5 flex items-center justify-between gap-2.5 animate-in fade-in duration-150"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-md border border-border bg-card shadow-sm shrink-0 flex items-center justify-center text-accent">
                            <DocumentIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-text truncate" title={doc.name}>
                              {doc.name}
                            </p>
                            <p className="text-[10px] text-text-muted truncate">
                              {formatFileSize(doc.size) || 'Documento pronto para envio'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAttachedDocuments((prev) => prev.filter((_, i) => i !== index))}
                          className="p-1 rounded-md text-text-muted hover:text-text hover:bg-card border border-transparent hover:border-border transition-all cursor-pointer shrink-0 self-start"
                          title="Remover documento"
                          aria-label="Remover documento"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {replyingTo && (
                  <div
                    onClick={() => scrollToMessage(replyingTo.timestamp)}
                    className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-input/70 border-l-4 border-accent border border-border/40 text-xs mt-2 select-none animate-in fade-in duration-150 cursor-pointer hover:bg-input transition-colors group/reply"
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                  >
                    <div className="flex-1 min-w-0 pr-1">
                      <p className="text-[11px] font-semibold text-accent truncate">
                        {replyingTo.direction === 'outgoing'
                          ? youLabel
                          : replyingTo.from || senderName || contact}
                      </p>
                      <p className="text-[10px] text-text-muted truncate mt-0.5">
                        {replyingTo.text ||
                          replyingTo.documentName ||
                          replyingTo.document ||
                          (replyingTo.audio
                            ? '🎙️ Áudio'
                            : replyingTo.image
                              ? '📷 Foto'
                              : replyingTo.video
                                ? '🎥 Vídeo'
                                : replyingTo.sticker
                                  ? '🏷️ Figurinha'
                                  : 'Mensagem')}
                      </p>
                    </div>

                    {replyingTo.image && (
                      <img
                        src={getImageUrl(replyingTo.image)}
                        alt="Preview"
                        className="w-9 h-9 object-cover rounded shrink-0 border border-border/40"
                      />
                    )}
                    {replyingTo.sticker && (
                      <img
                        src={getStickerUrl(replyingTo.sticker)}
                        alt="Sticker Preview"
                        className="w-9 h-9 object-contain rounded shrink-0"
                      />
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setReplyingTo(null)
                      }}
                      className="p-1 rounded-md text-text-muted hover:text-text hover:bg-card border border-transparent hover:border-border transition-all cursor-pointer shrink-0 self-start"
                      title={t('panel.cancel_reply')}
                      aria-label={t('panel.cancel_reply')}
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {sendError && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs mt-1 select-text">
                    <span className="truncate flex-1">{sendError}</span>
                    <button
                      type="button"
                      onClick={() => setSendError('')}
                      className="text-text-muted hover:text-text text-xs shrink-0 cursor-pointer"
                      aria-label="Fechar erro"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Selection Bar or Input Area */}
                {isSelectionMode ? (
                  <div className="flex shrink-0 items-center justify-between px-3 py-2.5 rounded-lg bg-input border border-border mt-2 animate-in fade-in">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSelectionMode(false)
                          setSelectedMessageTimestamps([])
                        }}
                        className="p-1 rounded-md text-text-muted hover:text-text hover:bg-card border border-transparent hover:border-border transition-colors cursor-pointer"
                        title={t('page.cancel_selection', { defaultValue: 'Cancelar seleção' })}
                        aria-label={t('page.cancel_selection', { defaultValue: 'Cancelar seleção' })}
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-semibold text-text">
                        {selectedMessageTimestamps.length}{' '}
                        {selectedMessageTimestamps.length === 1
                          ? t('page.selected_singular', { defaultValue: 'selecionada' })
                          : t('page.selected_plural', { defaultValue: 'selecionadas' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={selectedMessageTimestamps.length === 0}
                        onClick={async () => {
                          const selected = allAvailableMessages.filter((m) =>
                            selectedMessageTimestamps.includes(m.timestamp)
                          )
                          const text = selected
                            .map((m) => m.text || m.documentName || m.document || '')
                            .filter(Boolean)
                            .join('\n')
                          if (text) {
                            await copyTextToClipboard(text)
                            showToast(t('page.copied_clipboard', { defaultValue: 'Copiado para a área de transferência' }))
                          }
                        }}
                        className="p-1.5 rounded-md hover:bg-card text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title={t('page.copy')}
                        aria-label={t('page.copy')}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={selectedMessageTimestamps.length === 0}
                        onClick={async () => {
                          const selected = allAvailableMessages.filter((m) =>
                            selectedMessageTimestamps.includes(m.timestamp)
                          )
                          const text = selected
                            .map((m) => m.text || m.documentName || '')
                            .filter(Boolean)
                            .join('\n')
                          if (text) {
                            writePendingShare(text, 'whatsapp')
                            await copyTextToClipboard(text)
                            showToast(t('page.ready_to_forward', { defaultValue: 'Pronto para encaminhar' }))
                          }
                        }}
                        className="p-1.5 rounded-md hover:bg-card text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title={t('page.forward')}
                        aria-label={t('page.forward')}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="15 14 20 9 15 4" />
                          <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={selectedMessageTimestamps.length === 0}
                        onClick={() => {
                          selectedMessageTimestamps.forEach((ts) => {
                            if (!starredMessageTimestamps.includes(ts)) {
                              toggleStarMessage(ts)
                            }
                          })
                          showToast(t('page.messages_starred', { defaultValue: 'Mensagens favoritadas' }))
                        }}
                        className="p-1.5 rounded-md hover:bg-card text-text-muted hover:text-highlight disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title={t('page.favorite')}
                        aria-label={t('page.favorite')}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={selectedMessageTimestamps.length === 0}
                        onClick={() => {
                          const selectedSet = new Set(selectedMessageTimestamps)
                          const selectedMsgs = allAvailableMessages.filter((m) => selectedSet.has(m.timestamp))
                          if (selectedMsgs.length > 0) {
                            setDeleteConfirmTarget({ messages: selectedMsgs })
                          }
                        }}
                        className="p-1.5 rounded-md hover:bg-error/20 text-text-muted hover:text-error disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title={t('page.delete')}
                        aria-label={t('page.delete')}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : isAdminsOnly && activeRecipient.isGroup ? (
                  <div className="flex items-center justify-center py-2 px-3 rounded-lg bg-input/40 border border-border/30 mt-2">
                    <p className="text-[11px] text-text-muted">
                      Somente <span className="text-accent font-bold">admins</span> podem enviar
                      mensagens
                    </p>
                  </div>
                ) : (
                  <div
                    className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg bg-input border transition-all mt-2 ${
                      isDraggingOver
                        ? 'border-accent ring-2 ring-accent/30 bg-accent/10'
                        : 'border-border focus-within:border-accent/40'
                    } ${sending ? 'cursor-default' : 'cursor-text'}`}
                    onContextMenu={handleInputContextMenu}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDraggingOver(true)
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDraggingOver(true)
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDraggingOver(false)
                    }}
                    onDrop={handleDropImage}
                    onMouseDown={(e) => {
                      if (sending) return
                      const target = e.target as HTMLElement
                      if (target.closest('button') || target.tagName === 'INPUT') return
                      e.preventDefault()
                      inputRef.current?.focus()
                    }}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        if (!showMediaPicker) {
                          loadStickers()
                        }
                        setShowMediaPicker((prev) => !prev)
                      }}
                      title={t('panel.emoji_hint')}
                      aria-label={t('panel.emoji_hint')}
                      className={`p-1 -ml-1 rounded-md transition-colors shrink-0 cursor-pointer ${
                        showMediaPicker ? 'text-accent' : 'text-text-muted hover:text-text'
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                      >
                        <path d="M14.5 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8.5L14.5 21z" />
                        <path d="M14.5 21v-4.5a2 2 0 0 1 2-2H21" />
                        <circle cx="8.5" cy="9.5" r="0.85" fill="currentColor" stroke="none" />
                        <circle cx="15.5" cy="9.5" r="0.85" fill="currentColor" stroke="none" />
                        <path d="M8.5 13.5a4.5 4.5 0 0 0 7 0" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => fileInputRef.current?.click()}
                      title={t('panel.attach_hint')}
                      aria-label={t('panel.attach_hint')}
                      className="p-1 rounded-md transition-colors shrink-0 cursor-pointer text-text-muted hover:text-text"
                    >
                      <PaperClipIcon className="w-4 h-4" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.tar,.gz,.json,.xml"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          handleSelectFiles(e.target.files)
                          e.target.value = ''
                        }
                      }}
                    />
                    <input
                      ref={inputRef}
                      type="text"
                      value={customText}
                      onPaste={handlePasteImage}
                      onContextMenu={handleInputContextMenu}
                      onChange={(e) => {
                        setCustomText(e.target.value)
                        if (sendError) setSendError('')
                      }}
                      onKeyDown={(e) => {
                        const hasAttachments = pastedImages.length > 0 || attachedDocuments.length > 0
                        if (e.key === 'Enter' && (customText.trim() || hasAttachments) && !sending) {
                          e.preventDefault()
                          const gen = beginUserSend()
                          sendReply(customText.trim(), gen, pastedImages, attachedDocuments)
                        }
                      }}
                      readOnly={sending}
                      placeholder={
                        pastedImages.length > 0 || attachedDocuments.length > 0
                          ? attachedDocuments.length > 0 && pastedImages.length === 0
                            ? (attachedDocuments.length === 1
                                ? t('panel.input_placeholder_one_doc', { name: attachedDocuments[0].name })
                                : t('panel.input_placeholder_multi_doc', { count: attachedDocuments.length }))
                            : pastedImages.length > 0 && attachedDocuments.length === 0
                              ? (pastedImages.length === 1
                                  ? t('panel.input_placeholder_caption')
                                  : t('panel.input_placeholder_multi_image', { count: pastedImages.length }))
                              : t('panel.input_placeholder_multi_mixed', { count: pastedImages.length + attachedDocuments.length })
                          : !activeRecipient.isGroup && activeRecipient.fromGroupJid
                            ? t('panel.input_placeholder_direct', { name: activeRecipient.name })
                            : t('panel.input_placeholder')
                      }
                      className={`flex-1 min-w-0 bg-transparent text-xs text-text placeholder:text-text-muted/50 focus:outline-none ${
                        sending ? 'opacity-50 cursor-default' : 'cursor-text'
                      }`}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        const hasAttachments = pastedImages.length > 0 || attachedDocuments.length > 0
                        if ((customText.trim() || hasAttachments) && !sending) {
                          const gen = beginUserSend()
                          sendReply(customText.trim(), gen, pastedImages, attachedDocuments)
                        }
                      }}
                      disabled={(!customText.trim() && pastedImages.length === 0 && attachedDocuments.length === 0) || sending}
                      className={`p-1 rounded-md text-text-muted hover:text-text transition-colors disabled:opacity-40 shrink-0 ${
                        (!customText.trim() && pastedImages.length === 0 && attachedDocuments.length === 0) || sending ? 'cursor-default' : 'cursor-pointer'
                      }`}
                      aria-label={t('panel.send_message')}
                    >
                      <PaperAirplaneIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {suggestionsLoading && payloadQuickReplies.length === 0 && !isHistoryOverlay && !showMediaPicker && (!isAdminsOnly || !activeRecipient.isGroup) && (
                  <div className="flex shrink-0 flex-col gap-1.5 mt-2">
                    {[0, 1].map((i) => (
                      <div
                        key={i}
                        className="h-[26px] w-full rounded-lg bg-input/40 border border-border/30 animate-pulse"
                      />
                    ))}
                  </div>
                )}

                {resolvedQuickReplies.length > 0 && !showMediaPicker && (!isAdminsOnly || !activeRecipient.isGroup) && (
                  <div className="flex shrink-0 flex-col gap-1.5 mt-2">
                    {resolvedQuickReplies.slice(0, 2).map((reply: string, i: number) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleQuickReply(reply)}
                        disabled={sending}
                        className="w-full text-left text-xs px-3 py-1.5 rounded-lg bg-input/50 hover:bg-input border border-border/40 text-text/90 hover:text-text transition-colors truncate cursor-pointer disabled:opacity-50"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {showMediaPicker && (
          <MediaPicker
            height={pastedImages.length > 0 || attachedDocuments.length > 0 ? 520 : 400}
            onSelectEmoji={handleInsertEmoji}
            onSelectGif={handleSendGif}
            onSelectSticker={handleSendSticker}
            onClose={() => setShowMediaPicker(false)}
            getStickerUrl={getStickerUrl}
            stickers={availableStickers}
            loadingStickers={loadingStickers}
          />
        )}
      </div>

      {messageContextMenu && (
        <ContextMenu
          x={messageContextMenu.x}
          y={messageContextMenu.y}
          items={[
            {
              id: 'reply',
              label: t('page.reply'),
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 14 4 9 9 4" />
                  <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                </svg>
              ),
              onClick: () => {
                setReplyingTo(messageContextMenu.message)
                inputRef.current?.focus()
              }
            },
            {
              id: 'copy',
              label: t('page.copy'),
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              ),
              onClick: async () => {
                const textToCopy =
                  messageContextMenu.message.text ||
                  messageContextMenu.message.documentName ||
                  messageContextMenu.message.document ||
                  ''
                if (textToCopy) {
                  await copyTextToClipboard(textToCopy)
                  showToast('Copiado para a área de transferência')
                }
              }
            },
            {
              id: 'forward',
              label: t('page.forward'),
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 14 20 9 15 4" />
                  <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
                </svg>
              ),
              onClick: async () => {
                const textToForward =
                  messageContextMenu.message.text ||
                  messageContextMenu.message.documentName ||
                  ''
                if (textToForward) {
                  writePendingShare(textToForward, 'whatsapp')
                  await copyTextToClipboard(textToForward)
                  showToast('Pronto para encaminhar')
                }
              }
            },
            {
              id: 'pin',
              label: pinnedMessageTimestamps.includes(messageContextMenu.message.timestamp) ? t('page.unpin') : t('page.pin'),
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                </svg>
              ),
              onClick: () => {
                togglePinMessage(messageContextMenu.message.timestamp)
                showToast(
                  pinnedMessageTimestamps.includes(messageContextMenu.message.timestamp)
                    ? 'Mensagem desafixada'
                    : 'Mensagem fixada'
                )
              }
            },
            {
              id: 'favorite',
              label: starredMessageTimestamps.includes(messageContextMenu.message.timestamp) ? t('page.unfavorite') : t('page.favorite'),
              icon: (
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill={starredMessageTimestamps.includes(messageContextMenu.message.timestamp) ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ),
              onClick: () => {
                toggleStarMessage(messageContextMenu.message.timestamp)
                showToast(
                  starredMessageTimestamps.includes(messageContextMenu.message.timestamp)
                    ? 'Removida dos favoritos'
                    : 'Adicionada aos favoritos'
                )
              }
            },
            {
              id: 'select',
              label: t('page.select'),
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="m8.5 12.5 2.5 2.5 5-5" />
                </svg>
              ),
              onClick: () => {
                setIsSelectionMode(true)
                if (!selectedMessageTimestamps.includes(messageContextMenu.message.timestamp)) {
                  setSelectedMessageTimestamps((prev) => [...prev, messageContextMenu.message.timestamp])
                }
              }
            },
            {
              id: 'delete',
              label: t('page.delete'),
              danger: true,
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              ),
              onClick: () => {
                setIsSelectionMode(true)
                if (!selectedMessageTimestamps.includes(messageContextMenu.message.timestamp)) {
                  setSelectedMessageTimestamps((prev) => [...prev, messageContextMenu.message.timestamp])
                }
              }
            }
          ]}
          onClose={() => setMessageContextMenu(null)}
          minWidth={170}
        />
      )}

      {inputContextMenu && (
        <ContextMenu
          x={inputContextMenu.x}
          y={inputContextMenu.y}
          items={[
            {
              id: 'paste',
              label: t('panel.context_paste'),
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              ),
              onClick: handlePasteFromContextMenu
            },
            {
              id: 'select-all',
              label: t('panel.context_select_all'),
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="m8.5 12.5 2.5 2.5 5-5" />
                </svg>
              ),
              onClick: handleSelectAll
            }
          ]}
          onClose={() => setInputContextMenu(null)}
          minWidth={170}
        />
      )}

      {pinnedContextMenu && (
        <ContextMenu
          x={pinnedContextMenu.x}
          y={pinnedContextMenu.y}
          items={[
            {
              id: 'go-to-message',
              label: t('page.go_to_message', { defaultValue: 'Ir para a mensagem' }),
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 16 16 12 12 8" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              ),
              onClick: () => {
                scrollToMessage(pinnedContextMenu.message.timestamp)
              }
            },
            {
              id: 'unpin',
              label: t('page.unpin', { defaultValue: 'Desafixar' }),
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z" />
                </svg>
              ),
              onClick: () => {
                togglePinMessage(pinnedContextMenu.message.timestamp)
                showToast(t('page.unpinned_toast', { defaultValue: 'Mensagem desafixada' }))
              }
            }
          ]}
          onClose={() => setPinnedContextMenu(null)}
          minWidth={170}
        />
      )}

      {participantContextMenu && (
        <ContextMenu
          x={participantContextMenu.x}
          y={participantContextMenu.y}
          items={[
            {
              id: 'direct-message',
              label: 'Enviar mensagem direta',
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              ),
              onClick: () => handleSelectParticipant(participantContextMenu.participant)
            }
          ]}
          onClose={() => setParticipantContextMenu(null)}
          minWidth={170}
        />
      )}

      {deleteConfirmTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setDeleteConfirmTarget(null)}
        >
          <div
            className="rounded-3xl bg-card border border-border/60 p-6 flex flex-col items-center text-center max-w-[280px] w-full shadow-2xl space-y-3.5 select-none animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-text leading-snug">
              {deleteConfirmTarget.messages.length > 1
                ? t('page.delete_confirm_multiple', {
                    count: deleteConfirmTarget.messages.length,
                    defaultValue: `Deseja apagar as ${deleteConfirmTarget.messages.length} mensagens?`
                  })
                : t('page.delete_confirm_single', {
                    defaultValue: 'Deseja apagar a mensagem?'
                  })}
            </h3>

            <div className="flex flex-col gap-2.5 w-full pt-1">
              {deleteConfirmTarget.messages.some((m) => m.direction === 'outgoing') && (
                <button
                  type="button"
                  onClick={() => handleDeleteMessages(deleteConfirmTarget.messages, true)}
                  className="w-full py-2.5 px-4 rounded-full border border-border/50 text-error hover:bg-error/15 font-semibold text-xs tracking-wide transition-colors cursor-pointer"
                >
                  {t('page.delete_for_everyone', { defaultValue: 'Apagar para todos' })}
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDeleteMessages(deleteConfirmTarget.messages, false)}
                className="w-full py-2.5 px-4 rounded-full border border-border/50 text-accent hover:bg-accent/15 font-semibold text-xs tracking-wide transition-colors cursor-pointer"
              >
                {t('page.delete_for_me', { defaultValue: 'Apagar para mim' })}
              </button>

              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="text-accent hover:text-accent/80 font-semibold text-xs pt-1 transition-colors cursor-pointer"
              >
                {t('page.cancel', { defaultValue: 'Cancelar' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function WhatsAppReconnectCard({ data }: { data: any }) {
  const { t } = useI18n()
  const onClose = data?.onClose || (() => {})
  const qr = data?.qr
  const status = data?.status || 'disconnected'
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const qrCodeString = typeof qr === 'string' ? qr : qr?.code || qr?.qr || ''

  useEffect(() => {
    if (qrCodeString) {
      QRCode.toDataURL(qrCodeString, {
        width: 180,
        margin: 1.5,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
        .then((url) => setQrUrl(url))
        .catch((err) => {
          console.error('Failed to generate QR code data URL:', err)
          setError(t('notification.qr_failed'))
        })
    }
  }, [qrCodeString, qr, t])

  const handleReconnect = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: res } = await sdk.api.post('/extensions/momai-whatsapp/command', {
        toolName: 'restart_auth',
        args: {}
      })
      if (!res?.ok) {
        setError(res?.error || t('notification.reconnect_failed'))
      }
    } catch (err: any) {
      console.error('Failed to reconnect/restart WhatsApp:', err)
      setError(t('notification.reconnect_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex flex-col w-[320px] m-4 rounded-xl border border-border bg-card p-4 select-none animate-in fade-in zoom-in-95 duration-200"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center justify-between pb-3 border-b border-border/40 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-error/10 flex items-center justify-center text-error">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <span className="text-xs font-bold text-text">{t('notification.wa_disconnected')}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors shrink-0 cursor-pointer"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          aria-label={t('panel.close')}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center text-center">
        <p className="text-[11px] text-text-muted mb-3 max-w-[280px]">
          {t('notification.scan_qr')}
        </p>

        <div
          className="p-2.5 bg-white rounded-xl shadow-inner border border-border/40 flex items-center justify-center min-h-[190px] min-w-[190px]"
          style={{ WebkitAppRegion: 'no-drag', backgroundColor: '#ffffff' } as any}
        >
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="WhatsApp QR Code"
              className="block w-44 h-44 select-none"
              style={{ backgroundColor: '#ffffff', borderRadius: 0 }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-7 h-7 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              <span className="text-[10px] text-text-muted font-medium">{t('notification.waiting_code')}</span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-error mt-2 max-w-[260px] leading-tight select-text">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleReconnect}
          disabled={loading}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="mt-3 w-full max-w-[200px] py-2 px-4 text-xs font-semibold rounded-lg bg-accent text-card hover:opacity-90 transition-all duration-200 border border-accent/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
        >
          {loading ? t('notification.requesting') : t('notification.generating')}
        </button>
      </div>
    </div>
  )
}
