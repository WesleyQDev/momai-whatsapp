import { api } from '../../services/api'
import { resolveUnreadJid } from '../../utils/chatJid'
import { mergeHistoryWithServer, toUnixSeconds } from '../../utils/historySync'

export interface WidgetHistoryMessage {
  jid: string
  replyJid?: string
  from: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  isGroup: boolean
  groupName: string | null
  profilePicUrl: string | null
  hasMedia: boolean
}

interface HistoryResponse {
  history?: Array<{
    jid?: string
    from?: string
    contact?: string
    message?: string
    text?: string
    timestamp?: number
    direction?: string
    isGroup?: boolean
    groupName?: string
    senderJid?: string
    replyJid?: string
    profilePicUrl?: string
    imageDataUri?: string
  }>
}

interface StatsResponse {
  ok?: boolean
  connected?: boolean
  totalMessages?: number
}

function normalizeDirection(value: unknown): 'incoming' | 'outgoing' {
  return value === 'outgoing' ? 'outgoing' : 'incoming'
}

/**
 * Compares timestamps that may arrive in seconds (worker events) or
 * milliseconds (cached/server history), newest first.
 */
export function compareWidgetTs(a: number, b: number): number {
  const normalize = (ts: number): number => (ts > 1e12 ? ts : ts * 1000)
  return normalize(b) - normalize(a)
}

/**
 * Same local cache the main page reads first, so widgets show exactly what
 * the extension page shows even when the worker answers empty or is slow.
 * Read-only: only the page writes this key.
 */
const WIDGET_HISTORY_CACHE_KEY = 'momai_whatsapp_cached_history'

/** Widget refresh cadence while visible, mirroring the page poll. */
export const WIDGET_HISTORY_POLL_MS = 10_000

export function readCachedWidgetHistory(): WidgetHistoryMessage[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(WIDGET_HISTORY_CACHE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof (item as any).jid === 'string')
      .map((item: any) => mapHistoryItem(item))
  } catch {
    return []
  }
}

function mapHistoryItem(item: NonNullable<HistoryResponse['history']>[number]): WidgetHistoryMessage {
  const jid = String(item.jid ?? '')
  return {
    jid,
    replyJid: item.replyJid ? String(item.replyJid) : undefined,
    from: String(item.from ?? item.contact ?? ''),
    text: String(item.message ?? item.text ?? ''),
    timestamp: Number(item.timestamp ?? 0),
    direction: normalizeDirection(item.direction),
    isGroup: Boolean(item.isGroup || jid.endsWith('@g.us')),
    groupName: item.groupName ? String(item.groupName) : null,
    profilePicUrl: item.profilePicUrl ? String(item.profilePicUrl) : null,
    hasMedia: Boolean(item.imageDataUri)
  } satisfies WidgetHistoryMessage
}
/**
 * Loads recent history through the existing command channel.
 * Field mapping mirrors the main page (`Message.from`, `profilePicUrl`)
 * so widgets show the same contact names and photos as the extension.
 */
export async function fetchRecentHistory(limit = 20): Promise<WidgetHistoryMessage[]> {
  const res = await api.post('/extensions/whatsapp/command', {
    toolName: 'get_history',
    args: {}
  })
  const data = (res as any)?.data ?? res
  const history = (data?.history ?? []) as NonNullable<HistoryResponse['history']>
  return history
    .map((item) => mapHistoryItem(item))
    .filter((item) => item.jid !== '')
    .sort((a, b) => compareWidgetTs(a.timestamp, b.timestamp))
    .slice(0, limit)
}

/**
 * Loads what the extension page shows: local cache first, merged with the
 * live server history. A stale or empty server answer never wipes what the
 * page already displayed. Throws only when both sources are unavailable.
 */
export async function fetchWidgetHistory(limit = 20): Promise<WidgetHistoryMessage[]> {
  const cached = readCachedWidgetHistory()
  let server: WidgetHistoryMessage[]
  try {
    server = await fetchRecentHistory(50)
  } catch (err) {
    if (cached.length === 0) throw err
    server = []
  }
  return mergeHistoryWithServer(cached, server)
    .sort((a, b) => compareWidgetTs(a.timestamp, b.timestamp))
    .slice(0, limit)
}

/**
 * Resolves the label shown next to the avatar, using the same precedence
 * as the conversation list: push name, group name, phone, generic label.
 * A raw JID is never returned for display.
 */
export function resolveWidgetLabel(
  message: Pick<WidgetHistoryMessage, 'from' | 'jid' | 'isGroup' | 'groupName'>,
  unknownLabel: string,
  groupsLabel: string
): string {
  const from = message.from.trim()
  if (from !== '') return from
  if (message.isGroup) return message.groupName || groupsLabel
  const user = message.jid.split('@')[0] || ''
  const digits = user.split(':')[0].replace(/\D/g, '')
  if (digits !== '' && !message.jid.endsWith('@lid')) return `+${digits}`
  return unknownLabel
}

/**
 * Groups messages by conversation (unifying @lid / @s.whatsapp.net variants
 * of the same 1:1 chat) and returns the latest message of each group,
 * newest groups first.
 */
export function groupLatestByConversation(
  messages: WidgetHistoryMessage[],
  limit: number
): WidgetHistoryMessage[] {
  const latestByKey = new Map<string, WidgetHistoryMessage>()
  for (const message of messages) {
    const key = resolveUnreadJid(message)
    if (key === '') continue
    const current = latestByKey.get(key)
    if (!current || message.timestamp >= current.timestamp) {
      latestByKey.set(key, message)
    }
  }
  return [...latestByKey.values()].sort((a, b) => compareWidgetTs(a.timestamp, b.timestamp)).slice(0, limit)
}

/**
 * Maps a realtime worker event payload to a widget message, using the same
 * fields the main page consumes (`contact`, `contactJid`, `message`,
 * `contactAvatar`). Lets widgets display arrivals immediately, even when
 * the server history answer is stale or empty. Returns null when the
 * payload carries nothing renderable (e.g. `message_sent` has no text).
 */
export function mapEventToWidgetMessage(eventType: string, data: any): WidgetHistoryMessage | null {
  if (!data || typeof data !== 'object') return null
  if (eventType === 'message_sent') return null
  const jid = String(data.contactJid || data.senderJid || data.contact || '')
  if (!jid.includes('@')) return null
  const text = String(data.message ?? data.text ?? '')
  const hasMedia = Boolean(data.audio || data.image || data.document || data.video)
  if (text === '' && !hasMedia) return null
  const isGroup = Boolean(data.isGroup)
  return {
    jid,
    replyJid: jid,
    from: String((isGroup ? data.senderName || data.contact : data.contact || data.senderName) || ''),
    text,
    timestamp: toUnixSeconds(data.timestamp),
    direction: 'incoming',
    isGroup,
    groupName: data.groupName ? String(data.groupName) : null,
    profilePicUrl: data.contactAvatar ? String(data.contactAvatar) : null,
    hasMedia
  }
}

/**
 * Fetches avatar URLs for conversations without a photo yet,
 * using the same `get_avatars` tool as the main page.
 */
export async function fetchAvatars(jids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(jids.filter((jid) => typeof jid === 'string' && jid.includes('@')))]
  if (unique.length === 0) return {}
  const res = await api.post('/extensions/whatsapp/command', {
    toolName: 'get_avatars',
    args: { jids: unique }
  })
  const data = (res as any)?.data ?? res
  const avatars = data?.avatars
  if (!avatars || typeof avatars !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [jid, url] of Object.entries(avatars)) {
    if (typeof url === 'string' && url !== '') result[jid] = url
  }
  return result
}

export async function fetchConnection(): Promise<{ connected: boolean; totalMessages: number }> {
  const res = await api.post('/extensions/whatsapp/command', {
    toolName: 'get_stats',
    args: {}
  })
  const data = (res as any)?.data ?? res
  const stats = data as StatsResponse
  return {
    connected: Boolean((stats as any)?.connected ?? true),
    totalMessages: Number((stats as any)?.totalMessages ?? 0)
  }
}
