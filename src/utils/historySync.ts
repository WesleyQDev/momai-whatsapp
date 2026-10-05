export interface SyncableMessage {
  jid: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  text: string
  audio?: string
  image?: string
  document?: string
  documentName?: string
  video?: string
  sticker?: string
  gif?: string
  isGif?: boolean
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
  return `${msg.jid}|${Math.floor(Number(msg.timestamp) || 0)}|${msg.direction}|${msg.text || ''}|${msg.audio || ''}|${msg.image || ''}|${msg.document || ''}|${msg.video || ''}|${msg.sticker || ''}|${msg.gif || ''}|${msg.isGif ? '1' : ''}`
}

// Keep optimistic realtime messages that the server response does not include yet,
// so a stale get_history cannot erase a just-received realtime message.
// Stale messages absent from the server (e.g. deleted conversations or deleted messages) are discarded.
export function mergeHistoryWithServer<T extends SyncableMessage>(prev: T[], server: T[]): T[] {
  if (prev.length === 0) return server
  if (server.length === 0) return prev
  const serverKeys = new Set(server.map(getHistoryMessageKey))
  const newestServerTs = Math.max(...server.map((m) => Number(m.timestamp) || 0))
  const optimisticMissing = prev.filter((msg) => {
    if (serverKeys.has(getHistoryMessageKey(msg))) return false
    const msgTs = Number(msg.timestamp) || 0
    return msgTs >= newestServerTs
  })
  if (optimisticMissing.length === 0) return server
  return [...optimisticMissing, ...server].slice(0, 100)
}

export const DELETED_NAMES_STORAGE_KEY = 'momai_whatsapp_deleted_names'

/** Normaliza nome de conversa para comparar tombstones (acentos/emoji/case). */
export function normalizeDeletedName(value: unknown): string {
  try {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[😀-🫿☀-➿️‍]/gu, '')
      .trim()
  } catch {
    return String(value ?? '').toLowerCase().trim()
  }
}

export function getDeletedNamesMap(): Record<string, number> {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(DELETED_NAMES_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    }
  } catch {}
  return {}
}

export function rememberDeletedNames(names: Array<string | null | undefined>) {
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(DELETED_NAMES_STORAGE_KEY)
    const map: Record<string, number> = raw ? JSON.parse(raw) || {} : {}
    const now = Date.now()
    for (const n of names) {
      const norm = normalizeDeletedName(n || '')
      if (norm && norm.length >= 3) map[norm] = now
    }
    localStorage.setItem(DELETED_NAMES_STORAGE_KEY, JSON.stringify(map))
  } catch {}
}

/** Normaliza timestamp (segundos ou ms, number ou string) para ms. */
export function toMs(ts: unknown): number {
  const n = Number(ts) || 0
  if (!n) return 0
  return n > 1e12 ? n : n * 1e3
}

function msgTimeMs(ts: unknown): number {
  return toMs(ts)
}

/**
 * Nome apagado esconde a mensagem antiga; mensagem nova (timestamp após o
 * delete) reaparece. Cobre divergência de formato de JID (@lid vs
 * @s.whatsapp.net) entre o delete e o reload.
 */
export function isDeletedByName(
  msg: { from?: string; groupName?: string | null; senderName?: string; timestamp?: number },
  deletedNames: Record<string, number>
): boolean {
  const t = msgTimeMs((msg as any)?.timestamp)
  const names = [(msg as any).from, (msg as any).groupName, (msg as any).senderName].filter(Boolean) as string[]
  for (const n of names) {
    const delAt = deletedNames[normalizeDeletedName(n)]
    if (delAt && (!t || t <= Number(delAt))) return true
  }
  return false
}


