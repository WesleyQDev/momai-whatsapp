import { isSameChat } from './chatJid'

/**
 * Extension-owned ledger for the "Últimas Mensagens" list.
 *
 * The recent-conversations list must not be rebuilt from WhatsApp history
 * sync: re-syncing after a restart would resurrect conversations the user
 * deleted. This ledger is the extension's internal source of truth. It keeps
 * a tombstone (`deletedAt`) per conversation and only lets a genuinely newer
 * message (timestamp after the deletion) revive it.
 *
 * Matching is done through JID aliases (phone digits, @s.whatsapp.net, @lid
 * and device suffixes), so a re-sync that returns the same chat under another
 * JID format still respects the deletion.
 */

export interface RecentConversationEntry {
  key: string
  jid: string
  aliases: string[]
  label: string
  groupName: string | null
  isGroup: boolean
  /** Newest known message timestamp, in unix seconds. */
  lastMessageAt: number
  /** Epoch ms when the user deleted the conversation; null when active. */
  deletedAt: number | null
  /** Epoch ms of the last mutation, used for pruning. */
  updatedAt: number
}

export interface RecentConversationsStore {
  version: 1
  entries: RecentConversationEntry[]
}

/** Input used to upsert/delete a conversation in the ledger. */
export interface RecentConversationItem {
  jid: string
  aliases?: Array<string | null | undefined>
  label?: string
  groupName?: string | null
  isGroup?: boolean
  /** Newest known message timestamp, in unix seconds. */
  lastMessageAt: number
}

export const RECENT_CONVERSATIONS_STORAGE_KEY = 'momai_whatsapp_recent_conversations_v1'

const MAX_ACTIVE_ENTRIES = 300
const MAX_ALIASES_PER_ENTRY = 16

export function emptyRecentConversations(): RecentConversationsStore {
  return { version: 1, entries: [] }
}

/** Normalizes a timestamp that may arrive in seconds or milliseconds to ms. */
function toMs(ts: unknown): number {
  const n = Number(ts) || 0
  if (!n) return 0
  return n > 1e12 ? n : n * 1000
}

/**
 * Builds the alias set used to recognize the same conversation across JID
 * formats. Groups stay isolated to their own JID: a group participant's
 * @s.whatsapp.net address must never match a 1:1 conversation.
 */
export function buildConversationAliases(
  jids: Array<string | null | undefined>,
  isGroup = false
): string[] {
  const out = new Set<string>()
  for (const raw of jids) {
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (!value) continue
    const at = value.indexOf('@')
    if (at < 0) {
      const digits = value.replace(/\D/g, '')
      if (digits.length >= 7) out.add(digits)
      continue
    }
    const user = value.slice(0, at).split(':')[0]
    const domain = value.slice(at + 1)
    if (!user || !domain) continue
    out.add(`${user}@${domain}`)
    if (isGroup || domain === 'g.us') continue
    const digits = user.replace(/\D/g, '')
    if (digits.length >= 7) out.add(digits)
  }
  return [...out].slice(0, MAX_ALIASES_PER_ENTRY)
}

function aliasesOverlap(a: string, b: string): boolean {
  if (a === b) return true
  return isSameChat(a, b)
}

function entryMatchesAliases(entry: RecentConversationEntry, aliases: string[]): boolean {
  return entry.aliases.some((entryAlias) =>
    aliases.some((alias) => aliasesOverlap(entryAlias, alias))
  )
}

export function findRecentConversation(
  store: RecentConversationsStore,
  aliases: string[]
): RecentConversationEntry | null {
  if (aliases.length === 0) return null
  for (const entry of store.entries) {
    if (entryMatchesAliases(entry, aliases)) return entry
  }
  return null
}

/** A tombstoned conversation is visible again only after a newer message. */
export function isConversationVisible(
  store: RecentConversationsStore,
  item: Pick<RecentConversationItem, 'jid' | 'aliases' | 'isGroup' | 'lastMessageAt'>
): boolean {
  const aliases = buildConversationAliases([item.jid, ...(item.aliases || [])], item.isGroup)
  const entry = findRecentConversation(store, aliases)
  if (!entry || !entry.deletedAt) return true
  return toMs(item.lastMessageAt) > entry.deletedAt
}

/** True when a history/sync message belongs to a conversation deleted by the user. */
export function isMessageHiddenByLedger(
  store: RecentConversationsStore,
  msg: {
    jid?: string
    senderJid?: string
    replyJid?: string
    isGroup?: boolean
    timestamp?: number
  }
): boolean {
  const ts = toMs(msg?.timestamp)
  if (!ts) return false
  // Group messages match only on the group itself: a deleted 1:1 conversation
  // must never hide a group just because the member is the same contact.
  const aliases = msg.isGroup
    ? buildConversationAliases([msg.jid, msg.replyJid], true)
    : buildConversationAliases([msg.jid, msg.senderJid, msg.replyJid], false)
  const entry = findRecentConversation(store, aliases)
  return Boolean(entry?.deletedAt && ts <= entry.deletedAt)
}

function mergeAliases(current: string[], incoming: string[]): string[] {
  const out = new Set(current)
  for (const alias of incoming) out.add(alias)
  return [...out].slice(0, MAX_ALIASES_PER_ENTRY)
}

function pruneEntries(entries: RecentConversationEntry[]): RecentConversationEntry[] {
  const tombstones = entries.filter((entry) => Boolean(entry.deletedAt))
  const active = entries
    .filter((entry) => !entry.deletedAt)
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt || b.updatedAt - a.updatedAt)
    .slice(0, MAX_ACTIVE_ENTRIES)
  if (tombstones.length + active.length === entries.length) return entries
  return [...tombstones, ...active]
}

/**
 * Feeds the ledger with the conversations currently known by the extension.
 * Tombstoned conversations only accept an item when it carries a message
 * newer than the deletion; stale sync data is ignored and never revives.
 * Returns the same store reference when nothing changed, so React effects can
 * bail out cheaply.
 */
export function applyRecentConversations(
  store: RecentConversationsStore,
  items: RecentConversationItem[],
  now: number = Date.now()
): RecentConversationsStore {
  if (items.length === 0) return store
  let entries = store.entries
  let changed = false

  for (const item of items) {
    if (!item || typeof item.jid !== 'string' || !item.jid) continue
    const aliases = buildConversationAliases([item.jid, ...(item.aliases || [])], item.isGroup)
    if (aliases.length === 0) continue
    const lastMessageAt = Math.max(0, Math.round(toMs(item.lastMessageAt) / 1000))

    if (!changed && entries === store.entries) entries = [...entries]
    const index = entries.findIndex((entry) => entryMatchesAliases(entry, aliases))

    if (index < 0) {
      entries.push({
        key: aliases[0],
        jid: item.jid,
        aliases,
        label: item.label || '',
        groupName: item.groupName ?? null,
        isGroup: Boolean(item.isGroup),
        lastMessageAt,
        deletedAt: null,
        updatedAt: now
      })
      changed = true
      continue
    }

    const entry = entries[index]
    const entryDeletedAt = entry.deletedAt
    if (entryDeletedAt !== null && toMs(lastMessageAt) <= entryDeletedAt) {
      // Stale message from the deleted conversation: keep the tombstone intact.
      continue
    }

    const revived = entryDeletedAt !== null && toMs(lastMessageAt) > entryDeletedAt
    const mergedAliases = mergeAliases(entry.aliases, aliases)
    const nextLabel = item.label || entry.label
    const nextGroupName = item.groupName ?? entry.groupName
    const nextLastMessageAt = Math.max(entry.lastMessageAt, lastMessageAt)
    const metadataChanged =
      mergedAliases.length !== entry.aliases.length ||
      nextLabel !== entry.label ||
      nextGroupName !== entry.groupName ||
      nextLastMessageAt !== entry.lastMessageAt ||
      revived

    if (!metadataChanged) continue
    entries[index] = {
      ...entry,
      jid: entry.jid || item.jid,
      aliases: mergedAliases,
      label: nextLabel,
      groupName: nextGroupName,
      isGroup: Boolean(item.isGroup) || entry.isGroup,
      lastMessageAt: nextLastMessageAt,
      deletedAt: revived ? null : entry.deletedAt,
      updatedAt: now
    }
    changed = true
  }

  if (!changed) return store
  return { version: 1, entries: pruneEntries(entries) }
}

/**
 * Records the user deletion. The tombstone is durable: no amount of WhatsApp
 * history re-sync brings the conversation back, only a newer live message does.
 */
export function markConversationDeleted(
  store: RecentConversationsStore,
  item: RecentConversationItem,
  now: number = Date.now()
): RecentConversationsStore {
  const aliases = buildConversationAliases([item.jid, ...(item.aliases || [])], item.isGroup)
  if (aliases.length === 0) return store
  const lastMessageAt = Math.max(0, Math.round(toMs(item.lastMessageAt) / 1000))
  const index = store.entries.findIndex((entry) => entryMatchesAliases(entry, aliases))
  const entries = [...store.entries]

  if (index >= 0) {
    const entry = entries[index]
    entries[index] = {
      ...entry,
      jid: entry.jid || item.jid,
      aliases: mergeAliases(entry.aliases, aliases),
      label: item.label || entry.label,
      groupName: item.groupName ?? entry.groupName,
      isGroup: Boolean(item.isGroup) || entry.isGroup,
      lastMessageAt: Math.max(entry.lastMessageAt, lastMessageAt),
      deletedAt: now,
      updatedAt: now
    }
  } else {
    entries.push({
      key: aliases[0],
      jid: item.jid,
      aliases,
      label: item.label || '',
      groupName: item.groupName ?? null,
      isGroup: Boolean(item.isGroup),
      lastMessageAt,
      deletedAt: now,
      updatedAt: now
    })
  }

  return { version: 1, entries: pruneEntries(entries) }
}

/**
 * Backfills tombstones persisted by the extension worker (sent alongside
 * `get_history`). The worker tombstones are the same source that filters the
 * synced history, so they heal the ledger when the page storage is empty or
 * was reset. An existing entry only accepts the tombstone when no newer
 * message revived it.
 */
export function seedDeletedConversations(
  store: RecentConversationsStore,
  tombstones: Array<{ jid?: string; deletedAt?: number }>,
  now: number = Date.now()
): RecentConversationsStore {
  if (tombstones.length === 0) return store
  let entries = store.entries
  let changed = false

  for (const tombstone of tombstones) {
    const jid = typeof tombstone?.jid === 'string' ? tombstone.jid : ''
    const deletedAtMs = toMs(tombstone?.deletedAt)
    if (!jid || !deletedAtMs) continue
    const aliases = buildConversationAliases([jid], jid.endsWith('@g.us'))
    if (aliases.length === 0) continue
    const index = entries.findIndex((entry) => entryMatchesAliases(entry, aliases))

    if (index < 0) {
      if (!changed && entries === store.entries) entries = [...entries]
      entries.push({
        key: aliases[0],
        jid,
        aliases,
        label: '',
        groupName: null,
        isGroup: jid.endsWith('@g.us'),
        lastMessageAt: 0,
        deletedAt: deletedAtMs,
        updatedAt: now
      })
      changed = true
      continue
    }

    const entry = entries[index]
    const entryDeletedAt = entry.deletedAt
    if (entryDeletedAt === null) {
      // Keep a conversation that was revived by a message newer than the
      // worker deletion.
      if (toMs(entry.lastMessageAt) > deletedAtMs) continue
      if (!changed && entries === store.entries) entries = [...entries]
      entries[index] = { ...entry, deletedAt: deletedAtMs, updatedAt: now }
      changed = true
      continue
    }

    if (deletedAtMs > entryDeletedAt) {
      if (!changed && entries === store.entries) entries = [...entries]
      entries[index] = { ...entry, deletedAt: deletedAtMs, updatedAt: now }
      changed = true
    }
  }

  if (!changed) return store
  return { version: 1, entries: pruneEntries(entries) }
}

function parseStore(raw: unknown): RecentConversationsStore | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as { version?: unknown; entries?: unknown }
  if (!Array.isArray(candidate.entries)) return null
  const entries: RecentConversationEntry[] = []
  for (const value of candidate.entries) {
    if (!value || typeof value !== 'object') continue
    const entry = value as Partial<RecentConversationEntry>
    if (typeof entry.jid !== 'string' && typeof entry.key !== 'string') continue
    let aliases = Array.isArray(entry.aliases)
      ? entry.aliases.filter((alias): alias is string => typeof alias === 'string')
      : []
    const jid = typeof entry.jid === 'string' ? entry.jid : aliases[0] || ''
    if (aliases.length === 0 && jid) aliases = buildConversationAliases([jid], jid.endsWith('@g.us'))
    if (aliases.length === 0) continue
    entries.push({
      key: typeof entry.key === 'string' ? entry.key : aliases[0],
      jid,
      aliases,
      label: typeof entry.label === 'string' ? entry.label : '',
      groupName: typeof entry.groupName === 'string' ? entry.groupName : null,
      isGroup: Boolean(entry.isGroup) || jid.endsWith('@g.us'),
      lastMessageAt: Number(entry.lastMessageAt) || 0,
      deletedAt: Number(entry.deletedAt) || null,
      updatedAt: Number(entry.updatedAt) || 0
    })
  }
  return { version: 1, entries }
}

function readRecentConversations(): RecentConversationsStore {
  try {
    if (typeof localStorage === 'undefined') return emptyRecentConversations()
    const raw = localStorage.getItem(RECENT_CONVERSATIONS_STORAGE_KEY)
    if (!raw) return emptyRecentConversations()
    return parseStore(JSON.parse(raw)) || emptyRecentConversations()
  } catch {
    return emptyRecentConversations()
  }
}

export function persistRecentConversations(store: RecentConversationsStore): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(RECENT_CONVERSATIONS_STORAGE_KEY, JSON.stringify(store))
  } catch {}
}

/**
 * Loads the ledger and, on first run after this feature ships, seeds durable
 * tombstones from the legacy `momai_whatsapp_deleted_jids` entries so
 * conversations deleted before the ledger existed stay hidden.
 */
export function loadRecentConversations(
  legacyDeletedJids: Array<string | null | undefined> = []
): RecentConversationsStore {
  const store = readRecentConversations()
  if (legacyDeletedJids.length === 0) return store

  let next = store
  const now = Date.now()
  for (const jid of legacyDeletedJids) {
    if (typeof jid !== 'string' || !jid.includes('@')) continue
    const aliases = buildConversationAliases([jid], jid.endsWith('@g.us'))
    if (aliases.length === 0) continue
    if (findRecentConversation(next, aliases)) continue
    if (next === store) next = { version: 1, entries: [...store.entries] }
    next.entries.push({
      key: aliases[0],
      jid,
      aliases,
      label: '',
      groupName: null,
      isGroup: jid.endsWith('@g.us'),
      lastMessageAt: 0,
      deletedAt: now,
      updatedAt: now
    })
  }

  if (next !== store) persistRecentConversations(next)
  return next
}

export function clearRecentConversations(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(RECENT_CONVERSATIONS_STORAGE_KEY)
  } catch {}
}
