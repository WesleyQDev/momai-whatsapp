import { useEffect, useRef, useState, useCallback } from 'react'
import { XMarkIcon, MicrophoneIcon } from '@heroicons/react/24/outline'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const VOICE_LABELS: Record<string, string> = {
  listening: 'Aguardando "responda"...',
  detected: 'Ouvindo resposta...',
  complete: 'Enviando...',
  error: 'Erro ao ouvir',
  timeout: 'Fale "responda" + mensagem'
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
  if (!name) return ''
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  if (!clean || /^\d+$/.test(clean)) return ''
  const parts = clean.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0].slice(0, 1).toUpperCase()
}

function ContactAvatar({ src, name, id }: { src?: string | null; name: string; id: string }) {
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [src])

  if (src && !error) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setError(true)}
        className="w-10 h-10 rounded-full object-cover shrink-0"
      />
    )
  }

  const initials = getInitials(name)
  if (initials) {
    const color = getAvatarColor(id)
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    )
  }

  const isPhone = /^[+\d\s().-]*$/.test(name)
  return (
    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">
      {isPhone ? '📱' : '👤'}
    </div>
  )
}

export default function WhatsAppNotificationCard({ data }: { data: any }) {
  if (!data) return null

  const contact = data?.contact || data?.from || 'Desconhecido'
  const message = data?.message || data?.text || ''
  const quickReplies = data?.quickReplies || []
  const contactJid = data?.contactJid || data?.contact || ''
  const isGroup = data?.isGroup || false
  const groupName = data?.groupName || ''
  const onClose = data?.onClose || (() => {})

  const [voiceStatus, setVoiceStatus] = useState<
    'idle' | 'listening' | 'detected' | 'complete' | 'error' | 'timeout'
  >('idle')
  const abortRef = useRef<AbortController | null>(null)
  const hasReplied = useRef(false)

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const sendReply = useCallback(
    async (text: string) => {
      if (hasReplied.current) return
      hasReplied.current = true

      try {
        await fetch(`${API_URL}/extensions/whatsapp/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: 'send_message',
            args: { contact: contactJid, message: text }
          })
        })
      } catch {}
      onClose()
    },
    [contactJid, onClose]
  )

  const handleQuickReply = useCallback(
    async (label: string) => {
      if (hasReplied.current) return
      hasReplied.current = true
      stop()

      try {
        await fetch(`${API_URL}/extensions/whatsapp/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: 'send_message',
            args: { contact: contactJid, message: label }
          })
        })
      } catch {}
      onClose()
    },
    [contactJid, onClose, stop]
  )

  useEffect(() => {
    if (!contactJid) return

    const controller = new AbortController()
    abortRef.current = controller
    let cancelled = false

    setVoiceStatus('listening')
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/voice/whatsapp-reply/wait`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_jid: contactJid }),
          signal: controller.signal
        })

        if (cancelled || !res.ok) return

        const result = await res.json()
        if (cancelled) return

        if (result.text) {
          setVoiceStatus('complete')
          await sendReply(result.text)
        } else if (result.status === 'timeout') {
          setVoiceStatus('timeout')
        } else {
          setVoiceStatus('idle')
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== 'AbortError') {
          setVoiceStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [contactJid, sendReply])

  const voiceLabel = VOICE_LABELS[voiceStatus]

  return (
    <div
      className="rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-5 w-full max-w-md mx-4"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center gap-3 mb-3">
        <ContactAvatar
          src={data?.contactAvatar}
          name={isGroup ? groupName : contact}
          id={contactJid}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{isGroup ? groupName : contact}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-text-muted">
              {isGroup ? `${contact} no WhatsApp` : 'WhatsApp'}
            </span>
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              stroke="#25D366"
              strokeWidth="1.4"
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
          onClick={() => {
            stop()
            onClose()
          }}
          className="text-text-muted hover:text-white p-1"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-300 mb-4">{message}</p>

      {voiceLabel && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-accent/5 border border-accent/10">
          <MicrophoneIcon
            className={`w-4 h-4 ${voiceStatus === 'listening' ? 'text-accent animate-pulse' : voiceStatus === 'detected' || voiceStatus === 'complete' ? 'text-green-400' : 'text-text-muted'}`}
          />
          <span className="text-xs text-text-muted">{voiceLabel}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {quickReplies.map((reply: string, i: number) => (
          <button
            key={i}
            onClick={() => handleQuickReply(reply)}
            className="px-3 py-1.5 text-xs rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors border border-accent/20"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            {reply}
          </button>
        ))}
      </div>
    </div>
  )
}
