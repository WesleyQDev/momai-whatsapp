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

export default function WhatsAppNotificationCard({ data }: { data: any }) {
  if (!data) return null

  const contact = data?.contact || data?.from || 'Desconhecido'
  const message = data?.message || data?.text || ''
  const quickReplies = data?.quickReplies || []
  const contactJid = data?.contactJid || data?.contact || ''
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
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-lg">
          {voiceStatus === 'listening' || voiceStatus === 'detected'
            ? '🎤'
            : data?.contactAvatar || '👤'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{contact}</p>
          <p className="text-xs text-text-muted">WhatsApp</p>
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
