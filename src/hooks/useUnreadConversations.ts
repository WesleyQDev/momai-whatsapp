import { useCallback, useEffect, useState } from 'react'
import sdk from 'momai:sdk'
import { isSameChat } from '../utils/chatJid'

const STORAGE_KEY = 'momai_whatsapp_unread_jids'
const EXTENSION_ID = 'momai-whatsapp'

function loadStored(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

function clearSidebarBadge(): void {
  try {
    ;(sdk as any)?.badge?.clear?.(EXTENSION_ID)
  } catch {}
}

/**
 * Tracks conversations with unseen incoming messages.
 * Persisted in localStorage so the "nova" badge survives reloads.
 * The sidebar dot is cleared through the host badge contract once read.
 */
export function useUnreadConversations() {
  const [unreadJids, setUnreadJids] = useState<string[]>(loadStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(unreadJids))
    } catch {}
    if (unreadJids.length === 0) {
      clearSidebarBadge()
    }
  }, [unreadJids])

  const markUnread = useCallback((jid: string) => {
    if (!jid || typeof jid !== 'string' || !jid.includes('@')) return
    setUnreadJids((prev) => (prev.includes(jid) ? prev : [...prev, jid]))
  }, [])

  const markRead = useCallback((jid: string) => {
    if (!jid) return
    setUnreadJids((prev) =>
      prev.some((item) => isSameChat(item, jid))
        ? prev.filter((item) => !isSameChat(item, jid))
        : prev
    )
  }, [])

  const isUnread = useCallback(
    (jid: string) => unreadJids.some((item) => isSameChat(item, jid)),
    [unreadJids]
  )

  return { unreadJids, markUnread, markRead, isUnread }
}
