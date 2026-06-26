import { useEffect, useState, useCallback, useRef } from 'react'
import { XMarkIcon, MicrophoneIcon } from '@heroicons/react/24/outline'
import { useExtensionEvents } from '../hooks/useExtensionEvents'
import { getTTSServiceRenderer } from '../services/ttsService'
import { fetchExtensions, type Extension } from '../services/api'
import { API_URL } from '../constants'

async function rendererFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = window.api.getSessionToken()
  const headers: Record<string, any> = {
    'Content-Type': 'application/json'
  }
  if (options.headers) {
    const h = options.headers as Record<string, any> | Headers
    if (h instanceof Headers) {
      h.forEach((v, k) => {
        headers[k] = v
      })
    } else {
      Object.assign(headers, h)
    }
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return fetch(path, { ...options, headers })
}

interface VoiceState {
  status: 'idle' | 'listening' | 'detected' | 'complete' | 'error' | 'timeout'
  abortController: AbortController | null
}

interface Notification {
  id: string
  eventType: string
  skillId: string
  data: any
  receivedAt: number
  voice: VoiceState
}

const NOTIFICATION_TIMEOUT = 30000
const VOICE_STATUS_LABELS: Record<string, string> = {
  listening: 'Aguardando "responda"...',
  detected: 'Ouvindo resposta...',
  complete: 'Enviando...',
  error: 'Erro ao ouvir',
  timeout: 'Clique para responder'
}

function sendToSkill(skillId: string, contactJid: string, contact: string, message: string) {
  return rendererFetch(`${API_URL}/extensions/${skillId}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolName: 'send_message',
      args: {
        contact: contactJid || contact,
        message
      }
    })
  })
}

function resolveChannel(data: any) {
  const contactJid = String(data?.contactJid || data?.jid || '').trim()
  const isGroup = typeof data?.isGroup === 'boolean' ? data.isGroup : contactJid.endsWith('@g.us')
  const groupName = isGroup ? String(data?.groupName || 'Grupo') : ''
  return { contactJid, isGroup, groupName }
}

function getPanelType(skill: Extension | undefined, fallback: string) {
  return skill?.ui?.panelType || fallback
}

export default function NotificationOverlay() {
  const [installed, setInstalled] = useState<Extension[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const isShowingMessageNotificationRef = useRef(false)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const voiceAbortRef = useRef<Map<string, AbortController>>(new Map())
  /** Uma geracao por mensagem (evita TTS errado quando varias pessoas mandam no mesmo grupo) */
  const notificationGenByKeyRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    fetchExtensions()
      .then(setInstalled)
      .catch(() => setInstalled([]))
  }, [])

  useEffect(() => {
    if (installed.length > 0) {
      const whatsapp = installed.find((s) => s.id === 'whatsapp' && s.enabled)
      if (whatsapp) {
        const checkInitialStatus = async () => {
          try {
            const res = await rendererFetch(`${API_URL}/extensions/whatsapp/command`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolName: 'get_stats' })
            })
            if (res.ok) {
              const stats = await res.json()
              if (stats && stats.connected === false) {
                const overlayData = {
                  skillId: 'whatsapp',
                  panel: whatsapp.ui?.panel,
                  panelType: whatsapp.ui?.panelType,
                  structuredResponse: {
                    type: 'whatsapp-reconnect',
                    data: {
                      status: 'disconnected',
                      qr: stats.qr || null
                    }
                  }
                }
                if ((window as any).api?.openOverlay) {
                  ;(window as any).api.openOverlay(overlayData)
                }
              }
            }
          } catch (err) {
            console.error('[NotificationOverlay] Failed to check initial WhatsApp status:', err)
          }
        }
        const timer = setTimeout(checkInitialStatus, 1500)
        return () => clearTimeout(timer)
      }
    }
    return undefined
  }, [installed])

  const findSkillForEvent = useCallback(
    (eventType: string) => installed.find((s) => (s.eventTypes || []).includes(eventType)),
    [installed]
  )

  const removeNotification = useCallback((id: string, reinstateSleep = false) => {
    const controller = voiceAbortRef.current.get(id)
    if (controller) {
      controller.abort()
      voiceAbortRef.current.delete(id)
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    if (reinstateSleep) {
      ;(window as any).api?.reinstateEconomySleep?.()
    }
  }, [])

  const startVoiceDetection = useCallback(
    async (id: string, skillId: string, contactJid: string, contactName: string) => {
      const controller = new AbortController()
      voiceAbortRef.current.set(id, controller)

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, voice: { status: 'listening', abortController: controller } } : n
        )
      )

      try {
        const response = await rendererFetch(`${API_URL}/voice/${skillId}/reply/wait`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_jid: contactJid }),
          signal: controller.signal
        })

        if (!response.ok) {
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === id ? { ...n, voice: { status: 'idle', abortController: null } } : n
            )
          )
          return
        }

        const { text, status } = await response.json()

        setNotifications((prev) =>
          prev.map((n) =>
            n.id === id
              ? {
                  ...n,
                  voice: {
                    status:
                      status === 'complete' && text
                        ? 'complete'
                        : status === 'timeout'
                          ? 'timeout'
                          : 'idle',
                    abortController: null
                  }
                }
              : n
          )
        )

        if (text) {
          await sendToSkill(skillId, contactJid, contactName, text)
          removeNotification(id, true)
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === id ? { ...n, voice: { status: 'error', abortController: null } } : n
          )
        )
      }
    },
    [removeNotification]
  )

  const handleEvent = useCallback(
    (event: { eventType: string; data: any }) => {
      console.log(
        '[NotificationOverlay] Event received:',
        event.eventType,
        event.data?.contact,
        event.data?.message
      )
      const skill = findSkillForEvent(event.eventType)
      if (!skill) return

      if (skill.id === 'whatsapp') {
        if (event.eventType === 'connection_status') {
          const status = event.data?.status
          if (status === 'disconnected') {
            if (isShowingMessageNotificationRef.current) {
              console.log('[NotificationOverlay] Skipped disconnected overlay update since a message notification is active')
              return
            }
            // Keep the overlay open, but don't force a reset of QR to null if we already have it.
            // If the overlay is already open, this avoids updating it with qr: null which causes flicker.
            const overlayData = {
              skillId: 'whatsapp',
              panel: skill.ui?.panel,
              panelType: skill.ui?.panelType,
              structuredResponse: {
                type: 'whatsapp-reconnect',
                data: {
                  status: 'disconnected'
                }
              }
            }
            if ((window as any).api?.openOverlay) {
              ;(window as any).api.openOverlay(overlayData)
            }
          } else if (status === 'connected') {
            // Only close or send overlay updates if the overlay is actually showing the reconnect card.
            // If the user has a message notification open, we don't want to close/replace it.
            if (!isShowingMessageNotificationRef.current) {
              if ((window as any).api?.closeOverlay) {
                ;(window as any).api.closeOverlay()
              }
            }
          }
          return
        }

        if (event.eventType === 'qr_code') {
          if (isShowingMessageNotificationRef.current) {
            console.log('[NotificationOverlay] Skipped QR overlay update since a message notification is active')
            return
          }
          const qr = event.data?.qr
          const overlayData = {
            skillId: 'whatsapp',
            panel: skill.ui?.panel,
            panelType: skill.ui?.panelType,
            structuredResponse: {
              type: 'whatsapp-reconnect',
              data: {
                status: 'disconnected',
                qr
              }
            }
          }
          if ((window as any).api?.openOverlay) {
            ;(window as any).api.openOverlay(overlayData)
          }
          return
        }
      }

      // Only message notifications (with text/sender) should open the overlay.
      // Status events like qr_code, connection_status, authenticated,
      // contacts_synced, history_loaded are consumed by the skill's own
      // UI (full-page or side panel) and must NOT open the global overlay.
      if (!event.data?.message && !event.data?.text) return
      const { contactJid, isGroup, groupName } = resolveChannel(event.data)
      const senderJid = event.data.senderJid || ''
      const msgKey = `${contactJid}:${senderJid}:${event.data.timestamp}:${event.data.message}`
      const prevGen = notificationGenByKeyRef.current.get(msgKey) || 0
      const gen = prevGen + 1
      notificationGenByKeyRef.current.set(msgKey, gen)
      const panelType = getPanelType(skill, event.eventType)

      const processMsg = async () => {
        // Open overlay immediately with raw data (don't block on LLM call)
        const openOverlayWithData = (extraData: Record<string, any> = {}) => {
          isShowingMessageNotificationRef.current = true
          const overlayData = {
            skillId: skill.id,
            panel: skill.ui?.panel,
            panelType: skill.ui?.panelType,
            structuredResponse: {
              type: panelType,
              data: {
                ...event.data,
                contactJid,
                isGroup,
                groupName,
                quickReplies: [],
                tts: '',
                ...extraData
              }
            }
          }
          if ((window as any).api?.openOverlay) {
            ;(window as any).api.openOverlay(overlayData)
          }
        }

        if ((window as any).api?.openOverlay) {
          console.log('[NotificationOverlay] Opening overlay immediately')
          openOverlayWithData()
        }

        try {
          const llmRes = await rendererFetch(`${API_URL}/extensions/${skill.id}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolName: 'process_notification',
              args: {
                contact: event.data.contact,
                senderName: event.data.senderName || event.data.contact,
                senderJid,
                message: event.data.message,
                contactJid,
                isGroup,
                isNoteToSelf: !!event.data.isNoteToSelf,
                groupName
              }
            })
          })
          const llmData = await llmRes.json()

          if (notificationGenByKeyRef.current.get(msgKey) !== gen) return

          if (llmData.tts) {
            try {
              const tts = getTTSServiceRenderer()
              await tts.stop()
              await tts.speak(llmData.tts)
            } catch {}
          }

          if (notificationGenByKeyRef.current.get(msgKey) !== gen) return

          // Re-open overlay with quick replies (overlay window will re-render)
          openOverlayWithData({
            quickReplies: llmData.quickReplies || []
          })
        } catch {
          // Overlay already opened with raw data; nothing to do
        }
      }
      processMsg()
    },
    [findSkillForEvent, removeNotification, startVoiceDetection]
  )

  useExtensionEvents({ onEvent: handleEvent })

  useEffect(() => {
    const removeCloseListener = (window as any).momaiAPI?.onOverlayClosed?.(() => {
      console.log('[NotificationOverlay] Overlay closed event received, resetting message ref')
      isShowingMessageNotificationRef.current = false
    })

    return () => {
      if (removeCloseListener) removeCloseListener()
      for (const controller of Array.from(voiceAbortRef.current.values())) {
        controller.abort()
      }
      for (const timer of Array.from(timersRef.current.values())) {
        clearTimeout(timer)
      }
    }
  }, [])

  if (notifications.length === 0) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="pointer-events-auto w-full max-w-md mx-4 animate-fade-in"
        >
          <NotificationCard
            notification={notification}
            onDismiss={() => removeNotification(notification.id, true)}
            onRespond={async (message: string) => {
              if (message === '__open_chat__') {
                removeNotification(notification.id)
                return
              }
              try {
                await sendToSkill(
                  notification.skillId,
                  notification.data.contactJid || notification.data.contact,
                  notification.data.contact,
                  message
                )
              } catch (err) {
                console.error('Failed to send:', err)
              }
              removeNotification(notification.id, true)
            }}
          />
        </div>
      ))}
    </div>
  )
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

function NotificationCard({
  notification,
  onDismiss,
  onRespond
}: {
  notification: Notification
  onDismiss: () => void
  onRespond: (message: string) => void
}) {
  const { data, voice } = notification
  const senderName = data?.senderName || data?.contact || data?.from || 'Desconhecido'
  const contact = data?.contact || data?.from || 'Desconhecido'
  const message = data?.message || data?.text || ''
  const quickReplies = data?.quickReplies || []
  const isGroup = data?.isGroup || false
  const groupName = data?.groupName || ''
  const voiceLabel = VOICE_STATUS_LABELS[voice.status]

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <ContactAvatar
          src={data?.contactAvatar}
          name={isGroup ? groupName : contact}
          id={data?.contactJid || data?.contact || ''}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{isGroup ? groupName : contact}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-text-muted">
              {isGroup ? `${senderName} no WhatsApp` : 'WhatsApp'}
            </span>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#25D366] shrink-0">
              <path d="M12.004 2C6.48 2 2 6.48 2 12.004c0 1.764.46 3.42 1.264 4.888L2 22l5.228-1.372a9.948 9.948 0 0 0 4.776 1.216c5.52 0 10.004-4.484 10.004-10.004C22.008 6.48 17.524 2 12.004 2zm5.728 14.18c-.248.704-1.44 1.284-1.984 1.34-.496.052-1.136.236-3.3-.62-2.764-1.092-4.512-3.904-4.652-4.088-.14-.184-1.12-1.48-1.12-2.824 0-1.344.704-2.008.956-2.272.248-.268.544-.336.728-.336h.548c.18 0 .42.064.64.584l1.112 2.684c.104.24.16.48.02.764-.1.2-.22.424-.36.564-.14.14-.28.3-.12.58.62 1.052 1.38 1.86 2.448 2.492.28.16.46.1.64-.1.18-.2.784-.9 1.004-1.2.22-.3.444-.24.764-.12.32.12 2.016.952 2.356 1.12.34.172.568.252.648.392.08.14.08.82-.168 1.52z" />
            </svg>
          </div>
        </div>
        <button onClick={onDismiss} className="text-text-muted hover:text-white p-1">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-300 mb-4">{message}</p>

      {voiceLabel && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-accent/5 border border-accent/10">
          <MicrophoneIcon
            className={`w-4 h-4 ${voice.status === 'listening' ? 'text-accent animate-pulse' : voice.status === 'detected' ? 'text-green-400' : 'text-text-muted'}`}
          />
          <span className="text-xs text-text-muted">{voiceLabel}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {quickReplies.map((reply: string, i: number) => (
          <button
            key={i}
            onClick={() => onRespond(reply)}
            className="px-3 py-1.5 text-xs rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors border border-accent/20"
          >
            {reply}
          </button>
        ))}
        <button
          onClick={() => onRespond('__open_chat__')}
          className="px-3 py-1.5 text-xs rounded-full bg-white/5 text-text-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          ✏️ Responder
        </button>
      </div>
    </div>
  )
}
