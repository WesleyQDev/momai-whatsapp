import { useEffect, useState, useCallback, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useExtensionEvents } from '../hooks/useExtensionEvents'
import { getTTSServiceRenderer } from '../services/ttsService'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Notification {
  id: string
  eventType: string
  data: any
  receivedAt: number
}

const NOTIFICATION_TIMEOUT = 30000

export default function NotificationOverlay() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const handleEvent = useCallback(
    (event: { eventType: string; data: any }) => {
      if (event.eventType === 'whatsapp_notification' || event.eventType === 'notification') {
        const processMsg = async () => {
          try {
            // Get LLM-generated TTS + quick replies
            const llmRes = await fetch(`${API_URL}/extensions/whatsapp/process-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contact: event.data.contact, message: event.data.message })
            })
            const llmData = await llmRes.json()

            // Play TTS using configured engine
            if (llmData.tts) {
              try {
                getTTSServiceRenderer().speak(llmData.tts)
              } catch {}
            }

            const overlayData = {
              structuredResponse: {
                type: 'whatsapp_notification',
                data: {
                  ...event.data,
                  quickReplies: llmData.quickReplies || [],
                  tts: llmData.tts || ''
                }
              }
            }

            // Show overlay
            if ((window as any).api?.openOverlay) {
              ;(window as any).api.openOverlay(overlayData)
            } else {
              const id = `${event.eventType}-${Date.now()}`
              setNotifications((prev) => [...prev, { id, eventType: event.eventType, data: overlayData, receivedAt: Date.now() }])
              const timer = setTimeout(() => removeNotification(id), NOTIFICATION_TIMEOUT)
              timersRef.current.set(id, timer)
            }
          } catch {
            // Fallback: show raw notification
            const rawData = { structuredResponse: { type: 'whatsapp_notification', data: { ...event.data, quickReplies: [] } } }
            if ((window as any).api?.openOverlay) {
              ;(window as any).api.openOverlay(rawData)
            }
          }
        }
        processMsg()
      }
    },
    [removeNotification]
  )

  useExtensionEvents({ onEvent: handleEvent })

  useEffect(() => {
    return () => {
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
            onDismiss={() => removeNotification(notification.id)}
            onRespond={async (message: string) => {
              try {
                await fetch(
                  `${API_URL}/extensions/${(notification.data.contactJid || '').includes('@') ? 'whatsapp' : 'whatsapp'}/command`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      toolName: 'send_message',
                      args: {
                        contact: notification.data.contactJid || notification.data.contact,
                        message
                      }
                    })
                  }
                )
              } catch (err) {
                console.error('Failed to send:', err)
              }
              removeNotification(notification.id)
            }}
          />
        </div>
      ))}
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
  const { data } = notification
  const contact = data?.contact || data?.from || 'Desconhecido'
  const message = data?.message || data?.text || ''
  const quickReplies = data?.quickReplies || []

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-lg">
          {data?.contactAvatar || '👤'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{contact}</p>
          <p className="text-xs text-text-muted">WhatsApp</p>
        </div>
        <button onClick={onDismiss} className="text-text-muted hover:text-white p-1">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-300 mb-4">{message}</p>
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
