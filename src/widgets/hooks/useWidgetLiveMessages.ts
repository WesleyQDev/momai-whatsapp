import { useCallback, useState } from 'react'
import { useExtensionEvents } from '../../hooks/useExtensionEvents'
import { mapEventToWidgetMessage, type WidgetHistoryMessage } from '../services/widgetApi'

const LIVE_MESSAGE_EVENT_TYPES = new Set([
  'message_received',
  'whatsapp_message',
  'whatsapp_notification'
])

/**
 * Collects realtime arrivals straight from worker event payloads, the same
 * way the main page appends them. Covers the case where the server history
 * answer is stale or empty: the widget still shows what just arrived.
 * Always live, even in edit mode (edit mode only adds handles around
 * the widget; the container owns all drag/resize interaction).
 */
export function useWidgetLiveMessages(): WidgetHistoryMessage[] {
  const [live, setLive] = useState<WidgetHistoryMessage[]>([])
  const handleEvent = useCallback(
    (event: any) => {
      const type = String(event?.eventType || '')
      if (!LIVE_MESSAGE_EVENT_TYPES.has(type)) return
      const message = mapEventToWidgetMessage(type, event?.data)
      if (!message) return
      setLive((prev) => {
        if (prev.some((item) => item.jid === message.jid && item.timestamp === message.timestamp && item.text === message.text)) {
          return prev
        }
        return [message, ...prev].slice(0, 20)
      })
    },
    []
  )
  useExtensionEvents({ onEvent: handleEvent })
  return live
}
