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

      // Handle connection lifecycle events (e.g. connection_status, qr_code)
      // These events open/close the overlay panel for the owning extension.
      if (event.eventType === 'connection_status' || event.eventType === 'qr_code') {
        if (event.eventType === 'connection_status') {
          const status = event.data?.status
          if (status === 'disconnected') {
            const hasConnectedOnce = localStorage.getItem(`${skill.id}_has_connected_once`) === 'true'
            if (!hasConnectedOnce) {
              console.log(
                `[NotificationOverlay] Skipped disconnected overlay update for ${skill.id} because it has not connected once yet`
              )
              return
            }
            if (isShowingMessageNotificationRef.current) {
              console.log(
                '[NotificationOverlay] Skipped disconnected overlay update since a message notification is active'
              )
              return
            }
            const overlayData = {
              skillId: skill.id,
              panel: skill.ui?.panel,
              panelType: skill.ui?.panelType,
              structuredResponse: {
                type: skill.ui?.panelType || 'extension-panel',
                data: {
                  status: 'disconnected'
                }
              }
            }
            if ((window as any).api?.openOverlay) {
              ;(window as any).api.openOverlay(overlayData)
            }
          } else if (status === 'connected') {
            localStorage.setItem(`${skill.id}_has_connected_once`, 'true')
            if (!isShowingMessageNotificationRef.current) {
              if ((window as any).api?.closeOverlay) {
                ;(window as any).api.closeOverlay()
              }
            }
          }
          return
        }

        if (event.eventType === 'qr_code') {
          const hasConnectedOnce = localStorage.getItem(`${skill.id}_has_connected_once`) === 'true'
          if (!hasConnectedOnce) {
            console.log(
              `[NotificationOverlay] Skipped QR overlay update for ${skill.id} because it has not connected once yet`
            )
            return
          }
          if (isShowingMessageNotificationRef.current) {
            console.log(
              '[NotificationOverlay] Skipped QR overlay update since a message notification is active'
            )
            return
          }
          const qr = event.data?.qr
          const overlayData = {
            skillId: skill.id,
            panel: skill.ui?.panel,
            panelType: skill.ui?.panelType,
            structuredResponse: {
              type: skill.ui?.panelType || 'extension-panel',
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
                audio: event.data.audio,
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
              {data?.statusLabel || notification.skillId || 'Extension'}
            </span>
            {data?.statusIcon && (
              <span
                className="w-3.5 h-3.5 shrink-0 inline-block"
                dangerouslySetInnerHTML={{ __html: data.statusIcon }}
              />
            )}
          </div>
        </div>
        <button onClick={onDismiss} className="text-text-muted hover:text-white p-1">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      {data?.statusText ? (
        <p className="text-sm text-gray-300 mb-4 flex items-center gap-2">
          {data?.statusIcon && (
            <span
              className="w-4 h-4 shrink-0 inline-block"
              dangerouslySetInnerHTML={{ __html: data.statusIcon }}
              style={{ display: 'inline-block', verticalAlign: 'middle' }}
            />
          )}
          <span className="font-medium text-white">{data.statusText}</span>
        </p>
      ) : (
        <p className="text-sm text-gray-300 mb-4">{message}</p>
      )}

      {data?.audioUrl && (
        <div className="mt-1.5 mb-3 max-w-[280px]">
          <audio
            src={data.audioUrl}
            controls
            className="w-full h-8 accent-accent"
          />
        </div>
      )}

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
