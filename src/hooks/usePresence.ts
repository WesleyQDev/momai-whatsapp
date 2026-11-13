import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { useExtensionEvents } from './useExtensionEvents'

/** Presence fields exposed by the worker after the privacy rules are applied. */
export interface PresenceInfo {
  online?: boolean
  lastSeen?: number | null
}

export interface UsePresenceResult {
  presences: Record<string, PresenceInfo>
  refresh: () => void
}

export interface GroupPresenceSummary {
  total: number
  online: number
}

export interface UseGroupPresenceResult {
  group: GroupPresenceSummary | null
  participants: Record<string, PresenceInfo>
  refresh: () => void
}

const REFRESH_INTERVAL_MS = 30 * 1000

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/**
 * Online / last-seen for direct chats.
 *
 * The worker is the only source of truth: it drops every field the presence
 * privacy rules deny, so this hook never has to decide visibility itself. It
 * refreshes periodically (subscriptions are session-bound) and reacts to the
 * live `presence_update` stream.
 */
export function usePresence(jids: string[]): UsePresenceResult {
  const [presences, setPresences] = useState<Record<string, PresenceInfo>>({})

  const jidsKey = useMemo(() => {
    const unique = [
      ...new Set(
        (jids || []).filter(
          (jid): jid is string =>
            typeof jid === 'string' && jid.includes('@') && !jid.endsWith('@g.us')
        )
      )
    ]
    return unique.sort().join(',')
  }, [jids])

  const refresh = useCallback(async () => {
    const list = jidsKey ? jidsKey.split(',') : []
    if (list.length === 0) return
    try {
      const { data } = await api.post('/extensions/whatsapp/command', {
        toolName: 'get_presence',
        args: { jids: list }
      })
      const received = data?.presences
      if (!received || typeof received !== 'object') return
      setPresences((prev) => {
        const next = { ...prev }
        for (const jid of list) {
          if (received[jid]) next[jid] = received[jid]
          else delete next[jid]
        }
        return next
      })
    } catch { }
  }, [jidsKey])

  useEffect(() => {
    void refresh()
    const t1 = setTimeout(() => {
      if (!isDocumentHidden()) void refresh()
    }, 1500)
    return () => {
      clearTimeout(t1)
    }
  }, [refresh])

  useEffect(() => {
    if (!jidsKey) return
    const timer = setInterval(() => {
      if (!isDocumentHidden()) void refresh()
    }, REFRESH_INTERVAL_MS)
    const handleVisibility = () => {
      if (!isDocumentHidden()) void refresh()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
    return () => {
      clearInterval(timer)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }
  }, [jidsKey, refresh])

  useExtensionEvents({
    onEvent: useCallback(
      (event: any) => {
        if (event?.eventType === 'presence_privacy_updated') {
          // As regras mudaram: o worker reavalia o cache, então limpamos o
          // estado local e pedimos o recorte novo.
          setPresences({})
          void refresh()
          return
        }
        if (
          (event?.eventType === 'connection_status' && event?.data?.status === 'connected') ||
          (event?.eventType === 'authenticated' && event?.data?.status === 'connected')
        ) {
          void refresh()
          return
        }
        if (event?.eventType !== 'presence_update') return
        const eventJid = typeof event.data?.jid === 'string' ? event.data.jid : ''
        if (!eventJid) return
        const eventDigits = eventJid.replace(/\D/g, '')
        setPresences((prev) => {
          const next = { ...prev }
          const targetKeys = new Set<string>([eventJid])
          const list = jidsKey ? jidsKey.split(',') : []
          for (const k of list) {
            if (k === eventJid || (eventDigits && k.replace(/\D/g, '') === eventDigits)) {
              targetKeys.add(k)
            }
          }
          for (const key of targetKeys) {
            const current: PresenceInfo = { ...next[key] }
            if (typeof event.data.online === 'boolean') current.online = event.data.online
            if (typeof event.data.lastSeen === 'number' || event.data.lastSeen === null) {
              current.lastSeen = event.data.lastSeen
            }
            next[key] = current
          }
          return next
        })
      },
      [refresh, jidsKey]
    )
  })

  return { presences, refresh }
}

/**
 * Online count for a group, as WhatsApp shows in the conversation header.
 *
 * The worker subscribes to the participants it is allowed to see and returns
 * the gated per-participant presence, so the header count and the member list
 * never disagree with the privacy rules.
 */
export function useGroupPresence(groupJid: string | null): UseGroupPresenceResult {
  const [group, setGroup] = useState<GroupPresenceSummary | null>(null)
  const [participants, setParticipants] = useState<Record<string, PresenceInfo>>({})

  const jid = typeof groupJid === 'string' && groupJid.endsWith('@g.us') ? groupJid : ''

  const refresh = useCallback(async () => {
    if (!jid) {
      setGroup(null)
      setParticipants({})
      return
    }
    try {
      const { data } = await api.post('/extensions/whatsapp/command', {
        toolName: 'get_group_presence',
        args: { jid }
      })
      if (!data?.ok) return
      setGroup({
        total: Number(data.total) || 0,
        online: Number(data.online) || 0
      })
      setParticipants(data.participants && typeof data.participants === 'object' ? data.participants : {})
    } catch { }
  }, [jid])

  useEffect(() => {
    void refresh()
    const t1 = setTimeout(() => {
      if (!isDocumentHidden()) void refresh()
    }, 1500)
    return () => {
      clearTimeout(t1)
    }
  }, [refresh])

  useEffect(() => {
    if (!jid) return
    const timer = setInterval(() => {
      if (!isDocumentHidden()) void refresh()
    }, REFRESH_INTERVAL_MS)
    const handleVisibility = () => {
      if (!isDocumentHidden()) void refresh()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
    return () => {
      clearInterval(timer)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }
  }, [jid, refresh])

  useExtensionEvents({
    onEvent: useCallback(
      (event: any) => {
        if (event?.eventType === 'presence_privacy_updated') {
          setParticipants({})
          void refresh()
          return
        }
        if (
          (event?.eventType === 'connection_status' && event?.data?.status === 'connected') ||
          (event?.eventType === 'authenticated' && event?.data?.status === 'connected')
        ) {
          void refresh()
        }
      },
      [refresh]
    )
  })

  return { group, participants, refresh }
}
