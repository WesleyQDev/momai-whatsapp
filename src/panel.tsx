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
import ImageViewer from 'momai:image-viewer'
import sdk from 'momai:sdk'
import { useExtensionEvents } from './hooks/useExtensionEvents'
import { useI18n } from './hooks/useI18n'
import ContextMenu from './components/ContextMenu'
import MediaPicker from './components/MediaPicker'

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

const getApiBaseUrl = (): string => {
  const fromHost =
    (window as any)?.momaiAPI?.getApiBaseUrl?.() ||
    (window as any)?.api?.getApiBaseUrl?.()
  if (fromHost) return String(fromHost).replace(/\/+$/, '')
  const fromSdk = (sdk as any)?.API_URL
  if (fromSdk) return String(fromSdk).replace(/\/+$/, '')
  return 'http://127.0.0.1:8050'
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
  return `${base}/extensions/momai-whatsapp/storage/audio/${encodeURIComponent(filename)}`
}

const getStickerUrl = (filename: string): string => {
  if (!filename) return ''
  if (isDirectUrl(filename)) return filename
  const base = getApiBaseUrl()
  return `${base}/extensions/momai-whatsapp/storage/stickers/${encodeURIComponent(filename)}`
}

const getImageUrl = (filename: string): string => {
  if (!filename) return ''
  if (isDirectUrl(filename)) return filename
  const base = getApiBaseUrl()
  return `${base}/extensions/momai-whatsapp/storage/images/${encodeURIComponent(filename)}`
}

// Placeholder texts used for media messages without a caption (both locales).
const isMediaPlaceholder = (text: string): boolean =>
  text === '🎙️ Áudio' ||
  text === '🎙️ Audio' ||
  text === '📷 Foto' ||
  text === '📷 Photo' ||
  text === '📄 Documento' ||
  text === '📄 Document'

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
  onOpen
}: {
  src: string
  alt: string
  size?: 'md' | 'sm'
  onOpen: () => void
}) {
  const { t } = useI18n()
  const imgClass =
    size === 'sm'
      ? 'w-20 h-20 object-cover rounded-lg drop-shadow-sm select-none pointer-events-auto hover:scale-105 transition-transform cursor-pointer'
      : 'w-40 h-40 sm:w-48 sm:h-48 object-cover rounded-lg drop-shadow-sm select-none pointer-events-auto hover:scale-[1.02] transition-transform cursor-pointer'
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
    </div>
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
  direction: 'incoming' | 'outgoing'
  text: string
  timestamp: number
  from?: string
  audio?: string
  sticker?: string
  image?: string
  document?: string
  documentName?: string
}

type Participant = {
  id: string
  name: string
  phone: string
  admin?: string
  avatar?: string | null
}

const formatHistoryTime = (ts: number, locale = 'pt-BR') => {
  const ms = ts > 1e12 ? ts : ts * 1000
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

const formatDateSeparator = (ts: number, locale = 'pt-BR'): string => {
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

  if (isSameDay(date, today)) return 'Hoje'
  if (isSameDay(date, yesterday)) return 'Ontem'
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

function ContactAvatar({ src, name, id }: { src?: string | null; name: string; id: string }) {
  const [showViewer, setShowViewer] = useState(false)
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
      <>
        <img
          key={stableSrc}
          src={stableSrc}
          alt={name}
          onError={() => setStableSrc((prev) => (prev === src ? null : prev))}
          className="w-10 h-10 rounded-full object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            setShowViewer(true)
          }}
        />
        {showViewer && <ImageViewer src={stableSrc} alt={name} onClose={() => setShowViewer(false)} />}
      </>
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
  const [localHistory, setLocalHistory] = useState<HistoryLine[]>(() => data?.conversationHistory || [])

  useEffect(() => {
    if (Array.isArray(data?.conversationHistory)) {
      setLocalHistory(data.conversationHistory)
    }
  }, [data?.conversationHistory])

  const conversationHistory = localHistory
  const quickReplies = data?.quickReplies || []
  const contactJid = data?.contactJid || data?.contact || ''
  const isGroup = data?.isGroup || false
  const groupName = data?.groupName || ''
  const isAdminsOnly = data?.isAdminsOnly || false
  const onClose = data?.onClose || (() => {})
  const isLight =
    typeof document !== 'undefined' &&
    Boolean(document.documentElement.getAttribute('data-theme')?.includes('light'))

  console.log('[WhatsAppPanel] data received:', {
    audio: data?.audio,
    image: data?.image,
    document: data?.document,
    message,
    contactJid,
    isGroup,
    conversationHistoryLen: conversationHistory.length,
    conversationHistoryAudios: conversationHistory.map((l: any) => l.audio),
    activeRecipientJid: contactJid,
    dataKeys: data ? Object.keys(data) : []
  })

  const [voiceStatus, setVoiceStatus] = useState<
    'idle' | 'listening' | 'detected' | 'complete' | 'error' | 'timeout'
  >('idle')
  const [customText, setCustomText] = useState('')
  const [pastedImages, setPastedImages] = useState<string[]>([])
  const [attachedDocuments, setAttachedDocuments] = useState<AttachedDocument[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedStickerUrl, setSelectedStickerUrl] = useState<string | null>(null)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
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

  const [inputContextMenu, setInputContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [participantContextMenu, setParticipantContextMenu] = useState<{
    x: number
    y: number
    participant: Participant
  } | null>(null)

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

  const handlePasteFromContextMenu = useCallback(async () => {
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
        setCustomText((prev) => prev + text)
        inputRef.current?.focus()
      }
    } catch (err) {
      console.warn('[WhatsAppPanel] Falha ao colar do clipboard:', err)
    }
  }, [])

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
    const q = participantSearch.toLowerCase()
    return participants.filter(
      (p) => p.name.toLowerCase().includes(q) || p.phone.includes(q)
    )
  }, [participants, participantSearch])

  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; winX: number; winY: number } | null>(null)

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDraggingRef.current = false
    dragStartRef.current = {
      mouseX: e.screenX,
      mouseY: e.screenY,
      winX: window.screenX,
      winY: window.screenY
    }
  }

  const handleHeaderMouseMove = (e: React.MouseEvent) => {
    if (!dragStartRef.current || e.buttons !== 1) return
    const dx = e.screenX - dragStartRef.current.mouseX
    const dy = e.screenY - dragStartRef.current.mouseY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      isDraggingRef.current = true
      const moveFn =
        (window as any).momaiAPI?.moveOverlay ||
        (window as any).api?.moveOverlay
      if (typeof moveFn === 'function') {
        moveFn({
          x: dragStartRef.current.winX + dx,
          y: dragStartRef.current.winY + dy
        })
      }
    }
  }

  const handleHeaderMouseUp = () => {
    setTimeout(() => {
      isDraggingRef.current = false
      dragStartRef.current = null
    }, 50)
  }

  const handleHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isDraggingRef.current) return
    if (activeRecipient.isGroup) {
      handleToggleParticipants()
    }
  }

  useEffect(() => {
    setCustomText('')
    setSending(false)
    setShowMediaPicker(false)
    interactionGenRef.current += 1
  }, [contactJid, message, conversationHistory.length])

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
      fetch(`${base}/extensions/momai-whatsapp/storage/avatars/${encodeURIComponent(contactJid)}.jpg`)
        .then((r) => {
          if (r.ok) setAvatarSrc(`${base}/extensions/momai-whatsapp/storage/avatars/${encodeURIComponent(contactJid)}.jpg`)
        })
        .catch(() => {})
    }
  }, [contactJid, data?.contactAvatar])

  useEffect(() => {
    const el = historyScrollRef.current
    if (!el || conversationHistory.length === 0) return
    el.scrollTop = el.scrollHeight
  }, [contactJid, conversationHistory.length])

  useEffect(() => {
    const el = cardRef.current
    const setSize =
      (window as any).momaiAPI?.setOverlaySize ||
      (window as any).api?.setOverlaySize
    if (!el || typeof setSize !== 'function') return

    const CARD_BASE_WIDTH = isHistoryOverlay ? 560 : 320
    const PICKER_WIDTH = 360
    const GAP = 12
    const totalWidth = showMediaPicker ? CARD_BASE_WIDTH + GAP + PICKER_WIDTH : CARD_BASE_WIDTH
    const exactHeight = isHistoryOverlay
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
      center: isHistoryOverlay,
      isHistoryOverlay
    })
  }, [pastedImages.length, attachedDocuments.length, showMediaPicker, isHistoryOverlay])

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const expandQuickReply = useCallback(
    async (intent: string) => {
      const displayContact = activeRecipient.name || senderName || contact
      try {
        const { data } = await sdk.api.post('/extensions/llm/complete', {
          prompt: [
            'Escreva APENAS o texto de uma mensagem de WhatsApp a ser enviada.',
            'Sem aspas, sem explicações, sem preâmbulo, sem assinatura.',
            `Contexto: resposta para "${displayContact}".`,
            `Última mensagem recebida: "${message}"`,
            `Intenção da resposta: "${intent}"`
          ].join('\n')
        })
        return data?.text?.trim() || intent
      } catch {
        return intent
      }
    },
    [activeRecipient.name, senderName, contact, message]
  )

  useExtensionEvents({
    onEvent: (event: any) => {
      if (event?.type !== 'whatsapp.voice_response') return
      const eventContactJid = event.data?.contactJid || event.data?.contact
      if (eventContactJid && eventContactJid !== contactJid) return

      const status = event.data?.status
      if (status) setVoiceStatus(status)

      if (status === 'complete' && event.data?.text) {
        setCustomText(event.data.text)
        const gen = beginUserSend()
        sendReply(event.data.text, gen, pastedImages, attachedDocuments)
      } else if (status === 'timeout' || status === 'error') {
        stop()
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
      setSending(true)
      setCustomText('')
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
        if (isHistoryOverlay) {
          setCustomText('')
          setPastedImages([])
          setAttachedDocuments([])
          setSending(false)
          setMinimized(false)
          setLocalHistory((prev) => [
            ...prev,
            {
              direction: 'outgoing',
              text: body,
              timestamp: Math.floor(Date.now() / 1000),
              ...(imagesToSend.length > 0 ? { image: imagesToSend[0] } : {}),
              ...(documentsToSend.length > 0
                ? { document: documentsToSend[0]?.dataUrl, documentName: documentsToSend[0]?.name }
                : {})
            }
          ])
        } else {
          onClose()
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
    [activeRecipient.jid, isHistoryOverlay, onClose]
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
            setLocalHistory((prev) => [
              ...prev,
              {
                direction: 'outgoing',
                text: '',
                sticker: stickerFilename,
                timestamp: Math.floor(Date.now() / 1000)
              }
            ])
          } else {
            onClose()
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
    [activeRecipient.jid, beginUserSend, isHistoryOverlay, onClose]
  )

  const handleSendGif = useCallback(
    async (gifUrl: string) => {
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
            setLocalHistory((prev) => [
              ...prev,
              {
                direction: 'outgoing',
                text: gifUrl,
                timestamp: Math.floor(Date.now() / 1000)
              }
            ])
          } else {
            onClose()
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
    [activeRecipient.jid, beginUserSend, isHistoryOverlay, onClose]
  )

  const handleQuickReply = useCallback(
    async (label: string) => {
      if (sending) return
      const gen = beginUserSend()
      const finalReply = await expandQuickReply(label)
      sendReply(finalReply, gen)
    },
    [sending, expandQuickReply, sendReply, beginUserSend]
  )

  if (!data || data?.status === 'disconnected' || data?.qr) return null

  const isSelectedMember = Boolean(!activeRecipient.isGroup && activeRecipient.fromGroupJid)
  const contactName = activeRecipient.name || senderName || contact || t('panel.unknown_contact')
  const defaultQuickReplies = [
    '👍 Ok',
    t('page.quick_reply_check'),
    t('page.quick_reply_hello', { name: contactName }),
    t('page.quick_reply_help')
  ]
  const resolvedQuickReplies = isHistoryOverlay
    ? []
    : !activeRecipient.isGroup && activeRecipient.fromGroupJid
      ? [t('page.quick_reply_hello', { name: activeRecipient.name }), t('page.quick_reply_help')]
      : Array.isArray(quickReplies) && quickReplies.length > 0
        ? quickReplies
        : defaultQuickReplies

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
          className={`flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden ${
            minimized ? 'hidden' : ''
          }`}
          style={{
            WebkitAppRegion: 'drag',
            width: `${isHistoryOverlay ? 560 : 320}px`,
            height: `${
              isHistoryOverlay
                ? pastedImages.length > 0 || attachedDocuments.length > 0
                  ? 540
                  : 440
                : pastedImages.length > 0 || attachedDocuments.length > 0
                  ? 520
                  : 400
            }px`,
            maxHeight: `${
              isHistoryOverlay
                ? pastedImages.length > 0 || attachedDocuments.length > 0
                  ? 540
                  : 440
                : pastedImages.length > 0 || attachedDocuments.length > 0
                  ? 520
                  : 400
            }px`
          } as any}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-center gap-3 px-4 py-3 border-b border-border/40 bg-sidebar/30 select-none cursor-move w-full min-w-0 overflow-hidden"
            onMouseDown={handleHeaderMouseDown}
            onMouseMove={handleHeaderMouseMove}
            onMouseUp={handleHeaderMouseUp}
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
                  {activeRecipient.isGroup ? (
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
                        <ContactAvatar src={p.avatar || null} name={p.name} id={p.id} />
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
                    isHistoryOverlay
                      ? 'flex flex-col overflow-hidden p-0'
                      : 'overflow-y-auto custom-scrollbar overscroll-contain pr-0.5 space-y-2'
                  }`}
                >
                  {isHistoryOverlay ? (
                    /* MODO HISTÓRICO: Balões horizontais estilo WhatsApp */
                    conversationHistory.length > 0 ? (
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

                          return (
                            <Fragment key={`${line.timestamp}-${i}`}>
                              {isNewDay && (
                                <div className="flex justify-center my-2 select-none">
                                  <span className="px-3 py-1 text-[10px] font-medium rounded-lg bg-input/70 text-text-muted border border-border/40 shadow-xs uppercase tracking-wider">
                                    {formatDateSeparator(line.timestamp, locale)}
                                  </span>
                                </div>
                              )}
                              <div
                                className={`flex flex-col ${
                                  isOutgoing ? 'items-end self-end ml-auto' : 'items-start self-start'
                                } max-w-[85%] min-w-0 ${isSameSenderAsPrev ? 'mt-1' : 'mt-2.5'}`}
                                style={{ maxWidth: '85%' }}
                              >
                                {showSenderName && (
                                  <span className="text-[11px] font-semibold mb-1 px-1 select-text text-accent truncate max-w-full">
                                    {senderDisplayName}
                                  </span>
                                )}
                                <div
                                  className={`rounded-2xl px-3.5 py-2 shadow-sm select-text flex flex-col gap-1.5 border max-w-full min-w-0 overflow-hidden ${
                                    isOutgoing
                                      ? 'rounded-tr-xs'
                                      : 'bg-input/80 border-border/50 text-text rounded-tl-xs'
                                  }`}
                                  style={{
                                    wordBreak: 'break-word',
                                    overflowWrap: 'anywhere',
                                    ...(isOutgoing
                                      ? {
                                          backgroundColor: isLight ? '#d9fdd3' : '#005c4b',
                                          borderColor: isLight ? '#c4eec0' : '#026955',
                                          color: isLight ? '#111b21' : '#e9edef'
                                        }
                                      : {})
                                  }}
                                >
                                  {line.image ? (
                                    <div className="flex flex-col gap-1 max-w-full overflow-hidden">
                                      <MediaThumbnail
                                        src={getImageUrl(line.image)}
                                        alt={line.text && !isMediaPlaceholder(line.text) ? line.text : 'Foto'}
                                        onOpen={() => setSelectedImageUrl(getImageUrl(line.image!))}
                                      />
                                      {line.text && !isMediaPlaceholder(line.text) && (
                                        <p
                                          className="text-xs whitespace-pre-wrap break-words select-text max-w-full"
                                          style={{
                                            wordBreak: 'break-word',
                                            overflowWrap: 'anywhere',
                                            ...(isOutgoing ? { color: isLight ? '#111b21' : '#e9edef' } : {})
                                          }}
                                        >
                                          {line.text}
                                        </p>
                                      )}
                                    </div>
                                  ) : line.sticker ? (
                                    <div className="flex items-center">
                                      <img
                                        src={getStickerUrl(line.sticker)}
                                        alt="Sticker"
                                        className="w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-lg drop-shadow-sm select-none pointer-events-auto hover:scale-105 transition-transform cursor-pointer"
                                        loading="lazy"
                                        onClick={() => setSelectedStickerUrl(getStickerUrl(line.sticker!))}
                                        title="Clique para ampliar o sticker"
                                      />
                                    </div>
                                  ) : (
                                    line.text &&
                                    !isMediaPlaceholder(line.text) && (
                                      <p
                                        className="text-xs whitespace-pre-wrap break-words select-text leading-relaxed max-w-full"
                                        style={{
                                          wordBreak: 'break-word',
                                          overflowWrap: 'anywhere',
                                          ...(isOutgoing ? { color: isLight ? '#111b21' : '#e9edef' } : {})
                                        }}
                                      >
                                        {line.text}
                                      </p>
                                    )
                                  )}
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
                                  <div className="flex justify-end items-center mt-0.5 shrink-0">
                                    <span
                                      className="text-[10px] select-none font-normal shrink-0"
                                      style={
                                        isOutgoing
                                          ? { color: isLight ? '#54656f' : '#8696a0' }
                                          : undefined
                                      }
                                    >
                                      {formatHistoryTime(line.timestamp, locale)}
                                    </span>
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
                    )
                  ) : (
                    /* MODO NOTIFICAÇÃO (Novas Mensagens): Somente a última mensagem enviada */
                    message || data?.image || data?.sticker || data?.document || data?.audio ? (
                      <div className="min-h-[4.5rem] rounded-lg bg-input/40 border border-border/30 p-2.5 select-text flex flex-col justify-center min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-text-muted select-text">
                            {senderName || contact}
                          </span>
                          {data?.timestamp && (
                            <span className="text-[10px] text-text-muted ml-auto shrink-0 select-none">
                              {formatHistoryTime(data.timestamp, locale)}
                            </span>
                          )}
                        </div>
                        {data?.image ? (
                          <div className="mt-1 flex flex-col gap-1 max-w-full overflow-hidden">
                            <MediaThumbnail
                              src={getImageUrl(data.image)}
                              alt={message && !isMediaPlaceholder(message) ? message : 'Foto'}
                              onOpen={() => setSelectedImageUrl(getImageUrl(data.image))}
                            />
                            {message && !isMediaPlaceholder(message) && (
                              <p
                                className="text-sm text-text/90 whitespace-pre-wrap break-words select-text max-w-full"
                                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                              >
                                {message}
                              </p>
                            )}
                          </div>
                        ) : data?.sticker ? (
                          <div className="mt-1 flex items-center">
                            <img
                              src={getStickerUrl(data.sticker)}
                              alt="Sticker"
                              className="w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-lg drop-shadow-sm select-none pointer-events-auto hover:scale-105 transition-transform cursor-pointer"
                              loading="lazy"
                              onClick={() => setSelectedStickerUrl(getStickerUrl(data.sticker))}
                              title="Clique para ampliar o sticker"
                            />
                          </div>
                        ) : (
                          message &&
                          !isMediaPlaceholder(message) && (
                            <p
                              className="text-sm text-text/90 mt-1 whitespace-pre-wrap break-words select-text max-w-full"
                              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                            >
                              {message}
                            </p>
                          )
                        )}
                        {data?.document ? (
                          <DocumentCard
                            file={data.document}
                            name={data.documentName || data.document}
                            opening={openingFile === data.document}
                            onOpen={() => openDocument(data.document, data.documentName || data.document)}
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
                  )}
                </div>

                {docError && (
                  <p className="text-[11px] text-red-400 px-1 select-text">{docError}</p>
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
                            className="w-10 h-10 object-cover rounded-md border border-border shadow-sm shrink-0"
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

                {sendError && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs mt-1 select-text">
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

                {/* Input Area */}
                {isAdminsOnly && activeRecipient.isGroup ? (
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
                      title="Emojis, GIFs e Figurinhas"
                      aria-label="Emojis, GIFs e Figurinhas"
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
                      title="Anexar imagens ou documentos"
                      aria-label="Anexar imagens ou documentos"
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
                                ? `Legenda para ${attachedDocuments[0].name}...`
                                : `${attachedDocuments.length} documentos anexados. Legenda...`)
                            : pastedImages.length > 0 && attachedDocuments.length === 0
                              ? (pastedImages.length === 1
                                  ? 'Legenda opcional (pressione Enter)...'
                                  : `${pastedImages.length} imagens anexadas. Legenda...`)
                              : `${pastedImages.length + attachedDocuments.length} arquivos anexados. Legenda...`
                          : !activeRecipient.isGroup && activeRecipient.fromGroupJid
                            ? `Mensagem para ${activeRecipient.name}...`
                            : 'Digite uma mensagem...'
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

      {inputContextMenu && (
        <ContextMenu
          x={inputContextMenu.x}
          y={inputContextMenu.y}
          items={[
            {
              id: 'paste',
              label: t('panel.context_paste'),
              onClick: handlePasteFromContextMenu
            },
            {
              id: 'select-all',
              label: t('panel.context_select_all'),
              onClick: handleSelectAll
            }
          ]}
          onClose={() => setInputContextMenu(null)}
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
              onClick: () => handleSelectParticipant(participantContextMenu.participant)
            }
          ]}
          onClose={() => setParticipantContextMenu(null)}
          minWidth={170}
        />
      )}
      {selectedStickerUrl && (
        <ImageViewer
          src={selectedStickerUrl}
          alt="Sticker"
          onClose={() => setSelectedStickerUrl(null)}
        />
      )}
      {selectedImageUrl && (
        <ImageViewer src={selectedImageUrl} alt="Foto" onClose={() => setSelectedImageUrl(null)} />
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
      className="flex flex-col w-[320px] m-4 rounded-xl border border-border bg-card shadow-2xl p-4 select-none animate-in fade-in zoom-in-95 duration-200"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center justify-between pb-3 border-b border-border/40 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
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
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {qrUrl ? (
            <img src={qrUrl} alt="WhatsApp QR Code" className="w-44 h-44 rounded-lg select-none" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-7 h-7 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              <span className="text-[10px] text-text-muted font-medium">{t('notification.waiting_code')}</span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-red-400 mt-2 max-w-[260px] leading-tight select-text">
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
