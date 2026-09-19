// Minimal stand-in for the host extension-events bridge used by widget tests.
// Mirrors the `momai:events` contract: subscribers receive every event until
// they unmount. Tests push events through `__emitExtensionEvent`.
import { useEffect } from 'react'

type ExtensionEventHandler = (event: any) => void

const listeners = new Set<ExtensionEventHandler>()

export function useExtensionEvents(options: {
  eventType?: string
  onEvent?: (event: any) => void
}): {
  events: any[]
  latestEvent: any | null
  clearEvents: () => void
} {
  const { eventType, onEvent } = options
  useEffect(() => {
    if (!onEvent) return
    const handler: ExtensionEventHandler = (event) => {
      if (eventType && event?.eventType !== eventType) return
      onEvent(event)
    }
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [eventType, onEvent])
  return { events: [], latestEvent: null, clearEvents: () => {} }
}

export function __emitExtensionEvent(event: any): void {
  for (const listener of [...listeners]) {
    listener(event)
  }
}

export function __resetExtensionEvents(): void {
  listeners.clear()
}
