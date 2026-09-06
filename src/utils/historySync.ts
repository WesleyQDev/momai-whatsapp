export interface SyncableMessage {
  jid: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  text: string
  audio?: string
  image?: string
  document?: string
  video?: string
}

// Baileys timestamps arrive as number, numeric string, or Long-like objects.
// Normalize to unix seconds so realtime events deduplicate against get_history.
export function toUnixSeconds(ts: unknown): number {
  const fallback = Math.floor(Date.now() / 1000)
  if (typeof ts === 'number' && Number.isFinite(ts)) return Math.floor(ts)
  if (typeof ts === 'string' && ts.trim() !== '') {
    const parsed = Number(ts)
    if (Number.isFinite(parsed)) return Math.floor(parsed)
  }
  if (ts && typeof ts === 'object') {
    const maybe = ts as { toNumber?: unknown; seconds?: unknown }
    if (typeof maybe.toNumber === 'function') {
      try {
        const parsed = Number((maybe.toNumber as () => unknown)())
        if (Number.isFinite(parsed)) return Math.floor(parsed)
      } catch {}
    }
    if (typeof maybe.seconds === 'number' && Number.isFinite(maybe.seconds)) {
      return Math.floor(maybe.seconds)
    }
  }
  return fallback
}

export function getHistoryMessageKey(msg: SyncableMessage): string {
  return `${msg.jid}|${Math.floor(Number(msg.timestamp) || 0)}|${msg.direction}|${msg.text || ''}|${msg.audio || ''}|${msg.image || ''}|${msg.document || ''}|${msg.video || ''}`
}

// Keep optimistic realtime messages that the server response does not include yet,
// so a stale get_history cannot erase the just-received message.
export function mergeHistoryWithServer<T extends SyncableMessage>(prev: T[], server: T[]): T[] {
  if (prev.length === 0) return server
  if (server.length === 0) return prev
  const serverKeys = new Set(server.map(getHistoryMessageKey))
  const missing = prev.filter((msg) => !serverKeys.has(getHistoryMessageKey(msg)))
  if (missing.length === 0) return server
  return [...missing, ...server].slice(0, 100)
}
