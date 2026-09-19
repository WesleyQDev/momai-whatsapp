import { useCallback, useState } from 'react'
import { useExtensionEvents } from '../../hooks/useExtensionEvents'

// Same message-arrival events the main page reloads history on.
// Widgets always stay live, including while the Home is in edit mode:
// edit mode only frames the widget with handles, it must not freeze
// its content (the container owns all drag/resize interaction).
const RELOAD_EVENT_TYPES = new Set([
  'message_sent',
  'message_received',
  'whatsapp_message',
  'whatsapp_notification',
  'history_loaded',
  'connection_status',
  'authenticated'
])

/**
 * Returns a counter that increments whenever a message-arrival event
 * fires. Widget data hooks consume it as an effect dependency so the
 * widget refreshes right after sending or receiving, like the page does.
 */
export function useWidgetLiveSignal(): number {
  const [signal, setSignal] = useState(0)
  const handleEvent = useCallback((event: any) => {
    if (event?.eventType && RELOAD_EVENT_TYPES.has(String(event.eventType))) {
      setSignal((prev) => prev + 1)
    }
  }, [])
  useExtensionEvents({ onEvent: handleEvent })
  return signal
}
