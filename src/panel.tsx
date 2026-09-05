import { useEffect, useRef, useState, useCallback } from 'react'
import {
  XMarkIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid'
import QRCode from 'qrcode'
import ImageViewer from 'momai:image-viewer'
import sdk from 'momai:sdk'
import { useExtensionEvents } from './hooks/useExtensionEvents'
import { useI18n } from './hooks/useI18n'
import ContextMenu from './components/ContextMenu'

const getApiBaseUrl = (): string => {
  const fromHost =
    (window as any)?.momaiAPI?.getApiBaseUrl?.() ||
    (window as any)?.api?.getApiBaseUrl?.()
  if (fromHost) return String(fromHost).replace(/\/+$/, '')
  const fromSdk = (sdk as any)?.API_URL
  if (fromSdk) return String(fromSdk).replace(/\/+$/, '')
  return 'http://127.0.0.1:8050'
}

const getAudioUrl = (filename: string): string => {
  const base = getApiBaseUrl()
  return `${base}/extensions/momai-whatsapp/storage/audio/${encodeURIComponent(filename)}`
}

type HistoryLine = {
  direction: 'incoming' | 'outgoing'
  text: string
  timestamp: number
  from?: string
  audio?: string
}

type Participant = {
  id: string
  name: string
  phone: string
  admin?: string
  avatar?: string | null
}

const formatHistoryTime = (ts: number) => {
  const ms = ts > 1e12 ? ts : ts * 1000
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const formatSeconds = (sec: number) => {
  if (isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function CustomAudioPlayer({ src }: { src: string }) {
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
    <div className="w-full mt-1 flex flex-col gap-1.5 p-2 rounded-lg bg-input border border-border/50 select-none">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          className="p-1 rounded-md text-text hover:text-accent active:scale-95 transition-colors shrink-0 cursor-pointer focus:outline-none"
          title={isPlaying ? 'Pausar áudio' : 'Tocar áudio'}
          aria-label={isPlaying ? 'Pausar áudio' : 'Tocar áudio'}
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
          title="Velocidade de reprodução"
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
  const { t } = useI18n()
  const senderName = data?.senderName
  const contact = data?.contact || data?.from || 'Desconhecido'
  const message = data?.message || data?.text || ''
  const conversationHistory: HistoryLine[] = data?.conversationHistory || []
  const quickReplies = data?.quickReplies || []
  const contactJid = data?.contactJid || data?.contact || ''
  const isGroup = data?.isGroup || false
  const groupName = data?.groupName || ''
  const isAdminsOnly = data?.isAdminsOnly || false
  const onClose = data?.onClose || (() => {})

  console.log('[WhatsAppPanel] data received:', {
    audio: data?.audio,
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
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [minimized, setMinimized] = useState(false)
  const [resolvedAvatar, setResolvedAvatar] = useState<string | null>(null)
  const avatarFetchedRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const historyScrollRef = useRef<HTMLDivElement | null>(null)
  const interactionGenRef = useRef(0)

  const handlePasteImage = useCallback((e: React.ClipboardEvent | ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (loadEv) => {
            const dataUrl = loadEv.target?.result as string
            if (dataUrl) {
              setPastedImages((prev) => [...prev, dataUrl])
              setSendError('')
            }
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }, [])

  const [isDraggingOver, setIsDraggingOver] = useState(false)

  const handleDropImage = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)

    // 1. Check dataTransfer.files
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
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
        }
      }
      return
    }

    // 2. Check dataTransfer.items
    const items = e.dataTransfer?.items
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
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
          }
        }
      }
      return
    }

    // 3. Check dataTransfer text / url (e.g. dragged image URL or dataURL)
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain')
    if (url && (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://'))) {
      setPastedImages((prev) => [...prev, url])
      setSendError('')
      inputRef.current?.focus()
    }
  }, [])

  const [inputContextMenu, setInputContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [participantContextMenu, setParticipantContextMenu] = useState<{
    x: number
    y: number
    participant: Participant
  } | null>(null)

  const handleInputContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setInputContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleExecutePaste = async () => {
    setInputContextMenu(null)
    inputRef.current?.focus()
    try {
      // 1. Try document.execCommand('paste') first (standard Electron command, fires native onPaste event)
      try {
        const success = document.execCommand('paste')
        if (success) return
      } catch {}

      // 2. Try host Electron bridge (if main process registered clipboard:read)
      const hostApi = (window as any)?.momaiAPI || (window as any)?.api
      if (hostApi) {
        let res: any = null
        try {
          if (typeof hostApi.readClipboard === 'function') {
            res = await hostApi.readClipboard()
          } else if (typeof hostApi.invoke === 'function') {
            res = await hostApi.invoke('clipboard:read')
          }
        } catch {}

        if (res?.ok) {
          if (res.type === 'image' && res.dataUrl) {
            setPastedImages((prev) => [...prev, res.dataUrl])
            setSendError('')
            inputRef.current?.focus()
            return
          } else if (res.type === 'text' && res.text) {
            setCustomText((prev) => prev + res.text)
            setSendError('')
            inputRef.current?.focus()
            return
          }
        }
      }

      // 3. Fallback to navigator.clipboard.read() for images
      if (navigator.clipboard?.read) {
        try {
          const items = await navigator.clipboard.read()
          for (const item of items) {
            const imageType = item.types.find((t) => t.startsWith('image/'))
            if (imageType) {
              const blob = await item.getType(imageType)
              const reader = new FileReader()
              reader.onload = (ev) => {
                const dataUrl = ev.target?.result as string
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
        } catch {}
      }

      // 4. Fallback to navigator.clipboard.readText()
      if (navigator.clipboard?.readText) {
        try {
          const text = await navigator.clipboard.readText()
          if (text) {
            setCustomText((prev) => prev + text)
            setSendError('')
            inputRef.current?.focus()
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[WhatsApp] Context menu paste error:', err)
    }
  }

  useEffect(() => {
    if (!inputContextMenu) return
    const handleClickOutside = () => setInputContextMenu(null)
    window.addEventListener('click', handleClickOutside)
    window.addEventListener('contextmenu', handleClickOutside)
    return () => {
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('contextmenu', handleClickOutside)
    }
  }, [inputContextMenu])

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      handlePasteImage(e)
    }
    window.addEventListener('paste', onWindowPaste)
    return () => window.removeEventListener('paste', onWindowPaste)
  }, [handlePasteImage])

  const [activeRecipient, setActiveRecipient] = useState<{
    jid: string
    name: string
    avatar?: string | null
    isGroup: boolean
    fromGroupJid?: string
    fromGroupName?: string
  }>({
    jid: contactJid,
    name: isGroup ? groupName || contact : contact,
    avatar: data?.contactAvatar || null,
    isGroup,
    fromGroupJid: isGroup ? contactJid : undefined,
    fromGroupName: isGroup ? groupName || contact : undefined
  })

  useEffect(() => {
    setActiveRecipient({
      jid: contactJid,
      name: isGroup ? groupName || contact : contact,
      avatar: data?.contactAvatar || resolvedAvatar || null,
      isGroup,
      fromGroupJid: isGroup ? contactJid : undefined,
      fromGroupName: isGroup ? groupName || contact : undefined
    })
    setShowParticipants(false)
    setParticipantSearch('')
  }, [contactJid, contact, isGroup, groupName, data?.contactAvatar, resolvedAvatar])

  const [showParticipants, setShowParticipants] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [participantsError, setParticipantsError] = useState<string | null>(null)
  const [participantSearch, setParticipantSearch] = useState('')

  const handleToggleParticipants = useCallback(async () => {
    if (showParticipants) {
      setShowParticipants(false)
      return
    }
    const groupJidToFetch = activeRecipient.fromGroupJid || (isGroup ? contactJid : '')
    if (!groupJidToFetch) return

    setShowParticipants(true)
    setParticipantSearch('')
    if (participants.length > 0) return

    setLoadingParticipants(true)
    setParticipantsError(null)
    try {
      const { data: res } = await sdk.api.post('/extensions/momai-whatsapp/command', {
        toolName: 'get_group_participants',
        args: { groupJid: groupJidToFetch }
      })
      if (res?.ok && Array.isArray(res.participants)) {
        setParticipants(res.participants)
      } else {
        setParticipantsError(res?.error || 'Não foi possível carregar os membros do grupo.')
      }
    } catch (err: any) {
      setParticipantsError(err?.message || 'Erro ao buscar participantes.')
    } finally {
      setLoadingParticipants(false)
    }
  }, [showParticipants, activeRecipient.fromGroupJid, isGroup, contactJid, participants.length])

  const handleSelectParticipant = (p: Participant) => {
    setActiveRecipient({
      jid: p.id,
      name: p.name,
      avatar: p.avatar,
      isGroup: false,
      fromGroupJid: isGroup ? contactJid : activeRecipient.fromGroupJid,
      fromGroupName: isGroup ? groupName || contact : activeRecipient.fromGroupName
    })
    setShowParticipants(false)
    setCustomText('')
    inputRef.current?.focus()
  }

  const handleReturnToGroup = () => {
    if (activeRecipient.fromGroupJid) {
      setActiveRecipient({
        jid: activeRecipient.fromGroupJid,
        name: activeRecipient.fromGroupName || 'Grupo',
        avatar: data?.contactAvatar || resolvedAvatar || null,
        isGroup: true,
        fromGroupJid: activeRecipient.fromGroupJid,
        fromGroupName: activeRecipient.fromGroupName
      })
    }
    setShowParticipants(false)
    setCustomText('')
  }

  useEffect(() => {
    setCustomText('')
    setSending(false)
    setSendError('')
    interactionGenRef.current += 1
  }, [contactJid, message, conversationHistory.length])

  const avatarSrc = data?.contactAvatar || resolvedAvatar
  useEffect(() => {
    if (!contactJid || data?.contactAvatar || avatarFetchedRef.current === contactJid) return
    avatarFetchedRef.current = contactJid
    let cancelled = false
    ;(async () => {
      try {
        const { data: avData } = await sdk.api.post('/extensions/momai-whatsapp/command', {
          toolName: 'get_avatars',
          args: { jids: [contactJid] }
        })
        if (cancelled) return
        const url = avData?.avatars?.[contactJid]
        if (url) setResolvedAvatar(url)
      } catch {
        // Sem foto disponível: mantém o fallback de letra.
      }
    })()
    return () => {
      cancelled = true
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

    const CARD_WIDTH = 320
    const targetHeight = pastedImages.length > 0 ? 520 : 400
    const MARGIN = 16

    setSize({
      width: CARD_WIDTH + MARGIN * 2,
      height: targetHeight + MARGIN * 2
    })
  }, [pastedImages.length])

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
              `Contato: ${displayContact}`,
              activeRecipient.isGroup ? `Grupo: ${activeRecipient.name}` : '',
              !activeRecipient.isGroup && activeRecipient.fromGroupJid
                ? `Contexto: Contato do grupo ${activeRecipient.fromGroupName}`
                : '',
              conversationHistory.length > 0 && activeRecipient.jid === contactJid
                ? `Historico recente:\n${conversationHistory
                    .map((l) =>
                      l.direction === 'incoming'
                        ? `${l.from || contact}: ${l.text}`
                        : `Voce: ${l.text}`
                    )
                    .join('\n')}`
                : message && activeRecipient.jid === contactJid
                  ? `Mensagem recebida: "${message}"`
                  : '',
              `Intencao: ${intent}`,
              'Resposta curta e natural em portugues, sem aspas nem explicacao.'
            ]
              .filter(Boolean)
              .join('\n')
        })
        const expanded = (data?.text || '').trim()
        return expanded || intent
      } catch {
        return intent
      }
    },
    [contact, senderName, message, activeRecipient, conversationHistory, contactJid]
  )

  const beginUserSend = useCallback(() => {
    stop()
    setVoiceStatus('idle')
    return ++interactionGenRef.current
  }, [stop])

  const sendReply = useCallback(
    async (text: string, gen: number, imagesToSend: string[] = []) => {
      const targetJid = activeRecipient.jid
      const body = text?.trim() || ''
      if ((!body && imagesToSend.length === 0) || gen !== interactionGenRef.current) {
        if (gen === interactionGenRef.current) setSending(false)
        return
      }

      setSending(true)
      setCustomText('')
      setPastedImages([])
      setSendError('')
      try {
        const base = getApiBaseUrl()
        if (!base) {
          setSendError('Não foi possível determinar o servidor da extensão. Tente novamente.')
          setSending(false)
          setMinimized(false)
          return
        }
        const url = `${base}/extensions/momai-whatsapp/command`
        const payload = {
          toolName: 'send_message',
          args: {
            contact: targetJid,
            message: body,
            ...(imagesToSend.length > 0
              ? { images: imagesToSend, image: imagesToSend[0] }
              : {})
          }
        }
        const t0 = Date.now()
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 120000)
        let result: any = null
        let lastError = ''
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
            },
            body: JSON.stringify(payload),
            signal: ctrl.signal
          })
          const resText = await res.text()
          let resData: any = null
          try {
            resData = resText ? JSON.parse(resText) : null
          } catch {}
          if (res.ok && resData?.ok !== false) {
            result = { ok: true, status: res.status, data: resData }
          } else {
            lastError = (resData?.error || resData?.directResponse || `HTTP ${res.status}`).toString()
          }
        } catch (err: any) {
          lastError = err?.name === 'AbortError' ? 'Tempo esgotado' : err?.message || 'Erro'
        } finally {
          clearTimeout(timer)
        }
        if (gen !== interactionGenRef.current) return
        if (!result) {
          const inFlight =
            lastError === 'Tempo esgotado' ||
            /extension execution timeout/i.test(lastError)
          if (inFlight) {
            setSendError(
              'O envio continua em andamento em segundo plano. Aguarde um instante ou tente de novo.'
            )
            setSending(false)
            setMinimized(false)
            return
          }
          setSendError(`Não foi possível enviar: ${lastError}. Tente novamente.`)
          setSending(false)
          setMinimized(false)
          return
        }
        onClose()
      } catch (err: any) {
        if (gen !== interactionGenRef.current) return
        setSendError(
          err?.name === 'AbortError'
            ? 'O envio continua em andamento em segundo plano.'
            : err?.message || 'Erro ao enviar a mensagem.'
        )
        setSending(false)
        setMinimized(false)
      }
    },
    [activeRecipient.jid, onClose]
  )

  const handleQuickReply = useCallback(
    async (label: string) => {
      if (sending) return
      const gen = beginUserSend()
      setSending(true)
      setCustomText('')
      setMinimized(true)
      try {
        const messageToSend = await expandQuickReply(label)
        await sendReply(messageToSend, gen)
      } catch (err) {
        console.error('[WhatsAppNotificationCard] handleQuickReply error:', err)
        if (gen === interactionGenRef.current) {
          setSending(false)
          setMinimized(false)
          setSendError('Não foi possível preparar a resposta. Tente novamente.')
        }
      }
    },
    [beginUserSend, expandQuickReply, sendReply, sending]
  )

  useEffect(() => {
    if (!activeRecipient.jid) return

    const controller = new AbortController()
    abortRef.current = controller
    const voiceGen = interactionGenRef.current
    let cancelled = false

    setVoiceStatus('listening')
    ;(async () => {
      try {
        const result = await sdk.api.post('/voice/momai-whatsapp/reply/wait', {
          contact_jid: activeRecipient.jid
        })

        if (cancelled || voiceGen !== interactionGenRef.current || !result.ok) {
          if (!cancelled && voiceGen === interactionGenRef.current) {
            setVoiceStatus('error')
          }
          return
        }

        if (result.data?.text?.trim()) {
          setVoiceStatus('complete')
          await sendReply(result.data.text.trim(), voiceGen)
        } else if (result.data?.status === 'timeout') {
          setVoiceStatus('timeout')
        } else {
          setVoiceStatus('idle')
        }
      } catch {
        if (!cancelled) {
          setVoiceStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeRecipient.jid, sendReply])

  if (!data || data?.status === 'disconnected' || data?.qr) return null

  const voiceLabel = VOICE_LABEL_KEYS[voiceStatus] ? t(VOICE_LABEL_KEYS[voiceStatus]) : ''
  const isSelectedMember = Boolean(!activeRecipient.isGroup && activeRecipient.fromGroupJid)

  const contactName = activeRecipient.name || senderName || contact || 'Contato'
  const fallbackQuickReplies = [
    `Olá, ${contactName}!`,
    'Como posso te ajudar hoje?'
  ]
  const resolvedQuickReplies =
    !activeRecipient.isGroup && activeRecipient.fromGroupJid
      ? [`Olá, ${activeRecipient.name}!`, 'Como posso te ajudar?']
      : Array.isArray(quickReplies) && quickReplies.length > 0
        ? quickReplies
        : message
          ? [`Obrigado pela mensagem, ${contactName}!`, 'Vou verificar e respondo em breve.']
          : fallbackQuickReplies

  const filteredParticipants = participants.filter((p) => {
    if (!participantSearch.trim()) return true
    const q = participantSearch.toLowerCase().trim()
    return p.name.toLowerCase().includes(q) || p.phone.includes(q)
  })

  return (
    <div
      ref={cardRef}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={handleDropImage}
      className={`flex flex-col w-[320px] min-h-[200px] m-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden ${
        minimized ? 'hidden' : ''
      }`}
      style={{ WebkitAppRegion: 'drag', maxHeight: pastedImages.length > 0 ? '520px' : '400px' } as any}
    >
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-3 border-b border-border/40 bg-sidebar/30"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <ContactAvatar
            src={activeRecipient.avatar || (activeRecipient.isGroup ? avatarSrc : null)}
            name={activeRecipient.name}
            id={activeRecipient.jid}
          />
        </div>
        <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          {activeRecipient.isGroup ? (
            <button
              type="button"
              onClick={handleToggleParticipants}
              className="flex items-center gap-2 text-left group/btn focus:outline-none w-full max-w-full cursor-pointer"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              title="Clique para ver os contatos do grupo"
            >
              <p className="text-xs font-semibold text-text truncate group-hover/btn:text-accent transition-colors">
                {activeRecipient.name}
              </p>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-input/60 border border-border/60 text-text font-semibold shrink-0 flex items-center gap-1 shadow-sm hover:bg-input transition-all">
                👥 Membros
              </span>
            </button>
          ) : activeRecipient.fromGroupJid ? (
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-semibold text-text truncate">
                {activeRecipient.name}
              </p>
              <button
                type="button"
                onClick={handleReturnToGroup}
                className="text-[10px] text-accent hover:underline font-medium shrink-0 cursor-pointer"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                title="Voltar para a conversa em grupo"
              >
                ← Grupo
              </button>
            </div>
          ) : (
            <p className="text-xs font-semibold text-text truncate">
              {activeRecipient.name}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-text-muted font-medium truncate">
              {activeRecipient.isGroup
                ? `${senderName || contact} no WhatsApp`
                : activeRecipient.fromGroupJid
                  ? `Mensagem direta (via ${activeRecipient.fromGroupName})`
                  : 'WhatsApp'}
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
        </div>
        <button
          type="button"
          onClick={() => {
            stop()
            onClose()
          }}
          className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors shrink-0 cursor-pointer"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          aria-label={t('panel.close')}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div
        className="flex flex-col flex-1 min-h-0 gap-3 p-4 overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {showParticipants ? (
          <div className="flex flex-col flex-1 min-h-[15rem] max-h-72 gap-2.5">
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/40">
              <button
                type="button"
                onClick={() => setShowParticipants(false)}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors p-1 rounded-md hover:bg-input/50 cursor-pointer"
              >
                <ArrowLeftIcon className="w-3.5 h-3.5" />
                <span>Voltar à conversa</span>
              </button>
              <span className="text-[11px] font-medium text-text-muted">
                {participants.length > 0 ? t('panel.members_count', { count: participants.length }) : t('panel.members')}
              </span>
            </div>

            <div className="relative flex items-center px-2.5 py-1.5 rounded-lg bg-input border border-border focus-within:border-accent/40 transition-colors">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-muted shrink-0 mr-1.5" />
              <input
                type="text"
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                placeholder={t('panel.search_group')}
                className="flex-1 min-w-0 bg-transparent text-xs text-text placeholder:text-text-muted/50 focus:outline-none"
              />
              {participantSearch && (
                <button
                  type="button"
                  onClick={() => setParticipantSearch('')}
                  className="text-text-muted hover:text-text text-xs p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar space-y-1 pr-0.5">
              {loadingParticipants ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                  <span className="text-xs text-text-muted">Carregando participantes...</span>
                </div>
              ) : participantsError ? (
                <div className="flex flex-col items-center justify-center py-6 px-3 text-center">
                  <p className="text-xs text-text-muted mb-2">{participantsError}</p>
                  <button
                    type="button"
                    onClick={handleToggleParticipants}
                    className="text-xs text-accent hover:underline font-medium cursor-pointer"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : filteredParticipants.length === 0 ? (
                <div className="py-6 text-center text-xs text-text-muted">
                  Nenhum membro encontrado
                </div>
              ) : (
                filteredParticipants.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectParticipant(p)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setParticipantContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        participant: p
                      })
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-input/60 border border-transparent hover:border-border/40 transition-all text-left group/item cursor-pointer"
                  >
                    <ContactAvatar src={p.avatar} name={p.name} id={p.id} />
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
                      Enviar
                      <PaperAirplaneIcon className="w-3 h-3" />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 justify-between">
            {/* Upper scrollable section: conversation history / message + image previews */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar overscroll-contain pr-0.5 space-y-2">
              {!isSelectedMember && conversationHistory.length > 0 ? (
                <div
                  ref={historyScrollRef}
                  className="min-h-0 max-h-36 overflow-y-auto overscroll-contain custom-scrollbar rounded-lg bg-input/40 border border-border/30 scroll-pt-3 scroll-pb-3"
                >
                  <div className="px-3 py-2 space-y-3 select-text">
                    {conversationHistory.map((line, i) => (
                      <div
                        key={`${line.timestamp}-${i}`}
                        className={
                          line.direction === 'outgoing' ? 'pl-3 border-l-2 border-accent/40' : 'pl-0.5'
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-medium select-text ${
                              line.direction === 'outgoing' ? 'text-accent' : 'text-text-muted'
                            }`}
                          >
                            {line.direction === 'outgoing' ? 'Você' : line.from || contact}
                          </span>
                          <span className="text-[10px] text-text-muted ml-auto shrink-0 select-none">
                            {formatHistoryTime(line.timestamp)}
                          </span>
                        </div>
                        {line.text && line.text !== '🎙️ Áudio' && (
                          <p className="text-sm text-text/90 mt-0.5 whitespace-pre-wrap break-words select-text">
                            {line.text}
                          </p>
                        )}
                        {(line.audio || (line.text === '🎙️ Áudio' && data?.audio)) && (
                          <CustomAudioPlayer src={getAudioUrl(line.audio || data?.audio)} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : !isSelectedMember && message ? (
                <div className="min-h-[4.5rem] rounded-lg bg-input/40 border border-border/30 p-2.5 select-text flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-muted select-text">
                      {senderName || contact}
                    </span>
                    {data?.timestamp && (
                      <span className="text-[10px] text-text-muted ml-auto shrink-0 select-none">
                        {formatHistoryTime(data.timestamp)}
                      </span>
                    )}
                  </div>
                  {message && message !== '🎙️ Áudio' && (
                    <p className="text-sm text-text/90 mt-1 whitespace-pre-wrap break-words select-text">
                      {message}
                    </p>
                  )}
                  {data?.audio && (
                    <CustomAudioPlayer src={getAudioUrl(data.audio)} />
                  )}
                </div>
              ) : (
                <div className="min-h-[4.5rem] rounded-lg bg-input/40 border border-border/30 p-3 flex items-center justify-center select-none">
                  <p className="text-xs text-text-muted/60 font-normal">
                    {activeRecipient.fromGroupJid && !activeRecipient.isGroup
                      ? t('panel.start_direct', { name: activeRecipient.name })
                      : t('panel.no_recent')}
                  </p>
                </div>
              )}

              {pastedImages.length > 0 && (
                <div
                  className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-0.5 shrink-0 select-none custom-scrollbar overscroll-contain"
                  style={{
                    WebkitAppRegion: 'no-drag',
                    scrollbarWidth: 'thin'
                  } as any}
                  onWheel={(e) => e.stopPropagation()}
                >
                  {pastedImages.map((imgSrc, index) => (
                    <div
                      key={index}
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
                        title={t('panel.remove_image')}
                        aria-label={t('panel.remove_image')}
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Anchored Bar: Always 100% visible */}
            <div className="shrink-0 flex flex-col gap-2 pt-2 border-t border-border/30 mt-1">
              {sendError && (
                <div className="shrink-0 flex items-start gap-2 px-3 py-1.5 rounded-lg bg-input border border-border/80 text-text">
                  <span className="text-[11px] text-text-muted leading-snug flex-1 select-text">
                    {sendError}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSendError('')}
                    className="text-text-muted hover:text-text text-xs shrink-0 cursor-pointer"
                    aria-label={t('panel.close_error')}
                  >
                    ✕
                  </button>
                </div>
              )}

              {isAdminsOnly && activeRecipient.isGroup ? (
                <div className="flex items-center justify-center py-2 px-3 rounded-lg bg-input/40 border border-border/30">
                  <p className="text-[11px] text-text-muted">
                    Somente <span className="text-accent font-bold">admins</span> podem enviar
                    mensagens
                  </p>
                </div>
              ) : (
                <div
                  className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg bg-input border transition-all ${
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
                  <MicrophoneIcon
                    className={`w-4 h-4 shrink-0 pointer-events-none ${
                      voiceStatus === 'listening'
                        ? 'text-accent animate-pulse'
                        : voiceStatus === 'detected' || voiceStatus === 'complete'
                          ? 'text-accent'
                          : 'text-text-muted'
                    }`}
                    title={voiceLabel}
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
                      if (e.key === 'Enter' && (customText.trim() || pastedImages.length > 0) && !sending) {
                        e.preventDefault()
                        const gen = beginUserSend()
                        sendReply(customText.trim(), gen, pastedImages)
                      }
                    }}
                    readOnly={sending}
                    placeholder={
                      pastedImages.length > 0
                        ? (pastedImages.length === 1
                            ? 'Legenda opcional (pressione Enter)...'
                            : `${pastedImages.length} imagens anexadas. Legenda...`)
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
                      if ((customText.trim() || pastedImages.length > 0) && !sending) {
                        const gen = beginUserSend()
                        sendReply(customText.trim(), gen, pastedImages)
                      }
                    }}
                    disabled={(!customText.trim() && pastedImages.length === 0) || sending}
                    className={`p-1 rounded-md text-text-muted hover:text-text transition-colors disabled:opacity-40 shrink-0 ${
                      (!customText.trim() && pastedImages.length === 0) || sending ? 'cursor-default' : 'cursor-pointer'
                    }`}
                    aria-label={t('panel.send_message')}
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </div>
              )}

              {resolvedQuickReplies.length > 0 && (!isAdminsOnly || !activeRecipient.isGroup) && (
                <div className="flex shrink-0 flex-col gap-1.5">
                  {resolvedQuickReplies.slice(0, 2).map((reply: string, i: number) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleQuickReply(reply)}
                      disabled={sending}
                      className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-input/40 text-text hover:text-text hover:bg-input/80 transition-all disabled:opacity-40 truncate ${
                        sending ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {inputContextMenu && (
        <ContextMenu
          x={inputContextMenu.x}
          y={inputContextMenu.y}
          onClose={() => setInputContextMenu(null)}
          items={[
            {
              id: 'paste',
              label: 'Colar',
              shortcut: 'Ctrl+V',
              onClick: handleExecutePaste
            }
          ]}
          minWidth={120}
        />
      )}

      {participantContextMenu && (
        <ContextMenu
          x={participantContextMenu.x}
          y={participantContextMenu.y}
          onClose={() => setParticipantContextMenu(null)}
          items={[
            {
              id: 'direct-msg',
              label: 'Enviar mensagem direta',
              onClick: () => handleSelectParticipant(participantContextMenu.participant)
            },
            {
              id: 'copy-phone',
              label: 'Copiar telefone',
              shortcut: 'Ctrl+C',
              onClick: () => {
                void navigator.clipboard?.writeText?.('+' + participantContextMenu.participant.phone)
              }
            },
            {
              id: 'copy-name',
              label: 'Copiar nome',
              onClick: () => {
                void navigator.clipboard?.writeText?.(participantContextMenu.participant.name)
              }
            }
          ]}
          minWidth={170}
        />
      )}
    </div>
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

  useEffect(() => {
    if (status === 'connected') {
      onClose()
    }
  }, [status, onClose])

  const [qrCodeString, setQrCodeString] = useState<string | null>(qr || null)

  useExtensionEvents({
    onEvent: useCallback(
      (event: any) => {
        const status =
          event.eventType === 'connection_status' || event.eventType === 'authenticated'
            ? event.data?.status
            : null
        if (status === 'connected') onClose()
        if (event.eventType === 'qr_code' && event.data?.qr) {
          setQrCodeString(event.data.qr)
        }
      },
      [onClose]
    )
  })

  useEffect(() => {
    const targetQr = qrCodeString || qr
    if (targetQr) {
      QRCode.toDataURL(targetQr, { width: 220, margin: 1 })
        .then((url) => setQrUrl(url))
        .catch((err) => {
          console.error('Failed to generate QR code data URL:', err)
          setError('Falha ao processar o código QR.')
        })
    }
  }, [qrCodeString, qr])

  const handleReconnect = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await sdk.api.post('/extensions/momai-whatsapp/restart', { force: true })
      if (!result.ok) {
        throw new Error(result.error || `HTTP error`)
      }
    } catch (err: any) {
      console.error('Failed to reconnect/restart WhatsApp:', err)
      setError('Falha ao solicitar novo código. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex flex-col w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden px-5 py-4 select-none"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div className="bg-accent/10 border border-accent/20 p-1.5 rounded-lg">
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2.5C6.753 2.5 2.5 6.753 2.5 12c0 1.7.446 3.296 1.226 4.684L2.5 21.5l4.916-1.29A9.45 9.45 0 0 0 12 21.5c5.247 0 9.5-4.253 9.5-9.5S17.247 2.5 12 2.5z" />
              <path
                d="M16.3 14.66c-.2.56-1.18 1.08-1.64 1.12-.42.04-.96.2-2.78-.52-2.32-.92-3.78-3.28-3.9-3.44-.12-.16-.94-1.24-.94-2.36 0-1.12.58-1.68.8-1.9.2-.22.44-.28.6-.28h.46c.14 0 .34.04.52.48l.92 2.24c.08.2.12.4.02.64-.08.16-.18.36-.3.48-.12.12-.24.26-.1.48.52.88 1.16 1.56 2.06 2.08.22.14.38.08.54-.08.14-.16.66-.76.84-1 .18-.24.36-.2.64-.1.26.1 1.68.8 1.96.94.28.14.48.2.54.32.08.12.08.68-.14 1.28z"
                fill="currentColor"
                stroke="none"
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
          Escaneie o código QR abaixo com o WhatsApp no seu celular para reconectar.
        </p>

        <div
          className="relative w-44 h-44 flex items-center justify-center bg-white rounded-xl p-2.5 border border-border/20 shadow-inner"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {qrUrl ? (
            <img src={qrUrl} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-7 h-7 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              <span className="text-[10px] text-text-muted font-medium">Aguardando código...</span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-[10px] text-text-muted mt-2 bg-input border border-border/80 px-3 py-1.5 rounded-lg max-w-[260px]">
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

sdk.registry.registerRenderer('whatsapp-panel', WhatsAppNotificationCard)
sdk.registry.registerRenderer('whatsapp-reconnect', WhatsAppReconnectCard)
