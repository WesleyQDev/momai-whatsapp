import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import QRCode from 'qrcode'
import { API_URL } from '../constants'
import { useExtensionEvents } from '../hooks/useExtensionEvents'
import { resolveWhatsAppChannel } from '../utils/whatsappChannel'

interface Message {
  from: string
  jid: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  isGroup?: boolean
  groupName?: string | null
  senderJid?: string
  profilePicUrl?: string | null
}

interface ConversationTurn {
  incoming: Message
  replies: Message[]
}

interface ConversationHistoryLine {
  direction: 'incoming' | 'outgoing'
  text: string
  timestamp: number
  from?: string
}

interface ConversationSummary {
  jid: string
  turns: ConversationTurn[]
  latestIncoming: Message
  latestReplies: Message[]
  incomingCount: number
  contactLabel: string
  isGroup: boolean
  groupName: string | null
  profilePicUrl: string | null
}

function normalizeTimestamp(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000
}

function buildTurns(sorted: Message[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  let current: ConversationTurn | null = null

  for (const msg of sorted) {
    if (msg.direction === 'incoming') {
      if (current) turns.push(current)
      current = { incoming: msg, replies: [] }
    } else if (msg.direction === 'outgoing' && current) {
      current.replies.push(msg)
    }
  }
  if (current) turns.push(current)

  return turns
}

function turnsToHistoryLines(turns: ConversationTurn[]): ConversationHistoryLine[] {
  const lines: ConversationHistoryLine[] = []
  for (const turn of turns) {
    lines.push({
      direction: 'incoming',
      text: turn.incoming.text,
      timestamp: turn.incoming.timestamp,
      from: turn.incoming.from
    })
    for (const reply of turn.replies) {
      lines.push({
        direction: 'outgoing',
        text: reply.text,
        timestamp: reply.timestamp
      })
    }
  }
  return lines
}

/** Um card por conversa (jid): preview = última recebida; histórico completo no overlay. */
function buildConversationSummaries(history: Message[]): ConversationSummary[] {
  const byJid = new Map<string, Message[]>()
  for (const msg of history) {
    const list = byJid.get(msg.jid) || []
    list.push(msg)
    byJid.set(msg.jid, list)
  }

  const summaries: ConversationSummary[] = []

  for (const [jid, messages] of byJid) {
    const sorted = [...messages].sort(
      (a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp)
    )
    const turns = buildTurns(sorted)
    if (turns.length === 0) continue

    const latestTurn = turns[turns.length - 1]
    const profilePicUrl =
      [...sorted].reverse().find((m) => m.profilePicUrl)?.profilePicUrl || null

    summaries.push({
      jid,
      turns,
      latestIncoming: latestTurn.incoming,
      latestReplies: latestTurn.replies,
      incomingCount: turns.length,
      contactLabel: latestTurn.incoming.from,
      isGroup: jid.endsWith('@g.us'),
      groupName: jid.endsWith('@g.us') ? latestTurn.incoming.groupName ?? null : null,
      profilePicUrl
    })
  }

  summaries.sort(
    (a, b) =>
      normalizeTimestamp(b.latestIncoming.timestamp) - normalizeTimestamp(a.latestIncoming.timestamp)
  )

  return summaries
}

interface Contact {
  id: string
  name: string
  number: string
}

interface WaContact {
  id: string
  displayName: string
  name: string | null
  notify: string | null
  phone: string
  monitoring: boolean
  profilePicUrl?: string | null
}

const getAvatarColor = (id: string) => {
  let hash = 0
  const str = id || 'default'
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 40%)`
}

const getInitials = (name: string): string => {
  if (!name) return ''
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  if (!clean || /^\d+$/.test(clean)) return ''
  const parts = clean.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0].slice(0, 1).toUpperCase()
}

function WhatsAppIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 2.5C6.753 2.5 2.5 6.753 2.5 12c0 1.7.446 3.296 1.226 4.684L2.5 21.5l4.916-1.29A9.45 9.45 0 0 0 12 21.5c5.247 0 9.5-4.253 9.5-9.5S17.247 2.5 12 2.5z"
        fill="#000000"
        stroke="#25D366"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M16.3 14.66c-.2.56-1.18 1.08-1.64 1.12-.42.04-.96.2-2.78-.52-2.32-.92-3.78-3.28-3.9-3.44-.12-.16-.94-1.24-.94-2.36 0-1.12.58-1.68.8-1.9.2-.22.44-.28.6-.28h.46c.14 0 .34.04.52.48l.92 2.24c.08.2.12.4.02.64-.08.16-.18.36-.3.48-.12.12-.24.26-.1.48.52.88 1.16 1.56 2.06 2.08.22.14.38.08.54-.08.14-.16.66-.76.84-1 .18-.24.36-.2.64-.1.26.1 1.68.8 1.96.94.28.14.48.2.54.32.08.12.08.68-.14 1.28z"
        fill="#25D366"
      />
    </svg>
  )
}

function ContactAvatar({ src, name, id }: { src?: string | null; name: string; id: string }) {
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [src])

  if (src && !error) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setError(true)}
        className="w-10 h-10 rounded-full object-cover shrink-0"
      />
    )
  }

  const initials = getInitials(name)
  if (initials) {
    const color = getAvatarColor(id)
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    )
  }

  const isPhone = /^[+\d\s().-]*$/.test(name)
  const isGroup = id.endsWith('@g.us')
  return (
    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">
      {isGroup ? '👥' : isPhone ? '📱' : '👤'}
    </div>
  )
}

export default function WhatsAppView() {
  const [connected, setConnected] = useState(false)
  const [totalMessages, setTotalMessages] = useState(0)
  const [syncedContacts, setSyncedContacts] = useState(0)
  const [monitoredCount, setMonitoredCount] = useState(0)
  const [history, setHistory] = useState<Message[]>([])
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [hasCredentials, setHasCredentials] = useState(false)
  const [pairingActive, setPairingActive] = useState(false)
  const qrRequestInFlight = useRef(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  useEffect(() => {
    syncingRef.current = syncing
  }, [syncing])

  // Paginated contacts state
  const [contactsPage, setContactsPage] = useState(1)
  const [contactsPerPage] = useState(10)
  const [contactSearch, setContactSearch] = useState('')
  const [paginatedContacts, setPaginatedContacts] = useState<WaContact[]>([])
  const [totalFilteredContacts, setTotalFilteredContacts] = useState(0)
  const [contactsTotalPages, setContactsTotalPages] = useState(1)
  const [contactsLoading, setContactsLoading] = useState(false)

  const [groupsPage, setGroupsPage] = useState(1)
  const [groupsPerPage] = useState(10)
  const [groupSearch, setGroupSearch] = useState('')
  const [paginatedGroups, setPaginatedGroups] = useState<WaContact[]>([])
  const [totalFilteredGroups, setTotalFilteredGroups] = useState(0)
  const [groupsTotalPages, setGroupsTotalPages] = useState(1)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [avatarByJid, setAvatarByJid] = useState<Record<string, string | null>>({})
  const [conversationsPage, setConversationsPage] = useState(1)
  const [conversationsPerPage] = useState(10)

  const allConversations = useMemo(() => {
    return buildConversationSummaries(history).map((c) => ({
      ...c,
      profilePicUrl: avatarByJid[c.jid] ?? c.profilePicUrl ?? null
    }))
  }, [history, avatarByJid])

  const conversationsTotalPages = Math.max(
    1,
    Math.ceil(allConversations.length / conversationsPerPage)
  )

  const conversations = useMemo(() => {
    const start = (conversationsPage - 1) * conversationsPerPage
    return allConversations.slice(start, start + conversationsPerPage)
  }, [allConversations, conversationsPage, conversationsPerPage])

  useEffect(() => {
    if (conversationsPage > conversationsTotalPages) {
      setConversationsPage(conversationsTotalPages)
    }
  }, [conversationsPage, conversationsTotalPages])

  const applyQrString = useCallback((qr: string) => {
    QRCode.toDataURL(qr, { width: 256, margin: 1 }).then(setQrUrl).catch(() => {})
  }, [])

  const beginPairing = useCallback(() => {
    setPairingActive(true)
    setHasCredentials(false)
    setQrUrl(null)
    qrRequestInFlight.current = false
  }, [])

  const requestQr = useCallback(
    async (opts?: { force?: boolean }): Promise<boolean> => {
      if (qrRequestInFlight.current) return false
      qrRequestInFlight.current = true
      try {
        const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: 'request_qr',
            args: { force: opts?.force ?? pairingActive }
          })
        })
        const data = await res.json()
        if (data.qr) {
          applyQrString(data.qr)
          return true
        }
        return false
      } catch {
        return false
      } finally {
        qrRequestInFlight.current = false
      }
    },
    [applyQrString, pairingActive]
  )

  const loadAvatars = useCallback(async (jids: string[]) => {
    const unique = [...new Set(jids.filter((j) => j.includes('@')))]
    if (unique.length === 0) return
    try {
      const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'get_avatars', args: { jids: unique } })
      })
      const data = await res.json()
      if (data.avatars) {
        setAvatarByJid((prev) => ({ ...prev, ...data.avatars }))
      }
    } catch {}
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'get_stats', args: {} })
      })
      const data = await res.json()
      if (data.ok === false) return
      const isConnected = Boolean(data.connected)
      setConnected(isConnected)
      setHasCredentials(Boolean(data.hasCredentials))
      setTotalMessages(data.totalMessages || 0)
      setSyncedContacts(data.syncedContacts || 0)
      setMonitoredCount(data.monitoredCount || 0)
      if (isConnected) {
        setQrUrl(null)
      } else if (data.qr) {
        applyQrString(data.qr)
      }
    } catch {
    } finally {
      setStatsLoaded(true)
    }
  }, [applyQrString])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'get_history', args: {} })
      })
      const data = await res.json()
      if (data.history) {
        setHistory(data.history)
        const jids = [...new Set(data.history.map((m: Message) => m.jid).filter(Boolean))]
        loadAvatars(jids)
      }
    } catch {}
  }, [loadAvatars])

  const loadPaginatedContacts = useCallback(
    async (page: number, search: string) => {
      setContactsLoading(true)
      try {
        const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: 'get_wa_contacts',
            args: {
              page,
              perPage: contactsPerPage,
              search: search.trim()
            }
          })
        })
        const data = await res.json()
        if (data.contacts) {
          setPaginatedContacts(data.contacts)
          setTotalFilteredContacts(data.totalFiltered || 0)
          setContactsTotalPages(data.totalPages || 1)
        }
        return data
      } catch {
        return null
      } finally {
        setContactsLoading(false)
      }
    },
    [contactsPerPage]
  )

  const loadPaginatedGroups = useCallback(
    async (page: number, search: string) => {
      setGroupsLoading(true)
      try {
        const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: 'get_wa_groups',
            args: {
              page,
              perPage: groupsPerPage,
              search: search.trim()
            }
          })
        })
        const data = await res.json()
        if (data.contacts) {
          setPaginatedGroups(data.contacts)
          setTotalFilteredGroups(data.totalFiltered || 0)
          setGroupsTotalPages(data.totalPages || 1)
        }
        return data
      } catch {
        return null
      } finally {
        setGroupsLoading(false)
      }
    },
    [groupsPerPage]
  )

  const tryFinishContactSync = useCallback(
    async (reportedCount?: number) => {
      if (reportedCount === 0) {
        setSyncing(false)
        return
      }
      const [data] = await Promise.all([
        loadPaginatedContacts(contactsPage, contactSearch),
        loadPaginatedGroups(groupsPage, groupSearch)
      ])
      const total = data?.totalFiltered ?? 0
      const pageCount = data?.contacts?.length ?? 0
      if (pageCount > 0 || total === 0) {
        setSyncing(false)
      }
    },
    [
      loadPaginatedContacts,
      loadPaginatedGroups,
      contactsPage,
      contactSearch,
      groupsPage,
      groupSearch
    ]
  )

  const refresh = useCallback(async () => {
    await Promise.all([
      loadStats(),
      loadHistory(),
      loadPaginatedContacts(contactsPage, contactSearch),
      loadPaginatedGroups(groupsPage, groupSearch)
    ])
  }, [
    loadStats,
    loadHistory,
    loadPaginatedContacts,
    loadPaginatedGroups,
    contactsPage,
    contactSearch,
    groupsPage,
    groupSearch
  ])

  const handleSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'sync_contacts', args: {} })
      })
      const data = await res.json()
      if (data.syncedContacts !== undefined) {
        setSyncedContacts(data.syncedContacts)
      }
      await tryFinishContactSync(data.syncedContacts)
    } catch {
      setSyncing(false)
    }
  }, [syncing, tryFinishContactSync])

  const toggleMonitoring = async (contactId: string) => {
    try {
      const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'toggle_monitoring', args: { contact: contactId } })
      })
      const data = await res.json()
      if (data.ok) {
        const updater = (prev: WaContact[]) =>
          prev.map((c) => (c.id === contactId ? { ...c, monitoring: data.monitoring } : c))
        setPaginatedContacts(updater)
        setPaginatedGroups(updater)
        loadStats()
      }
    } catch {}
  }

  const saveContactName = async (contactId: string) => {
    if (!editValue.trim()) return
    try {
      await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'set_contact_name',
          args: { contact: contactId, name: editValue.trim() }
        })
      })
      setEditingName(null)
      refresh()
    } catch {}
  }

  const disconnect = useCallback(async () => {
    beginPairing()
    setConnected(false)
    try {
      await fetch(`${API_URL}/extensions/whatsapp/disconnect`, { method: 'POST' })
    } catch {}
  }, [beginPairing])

  const reconnect = useCallback(async () => {
    try {
      beginPairing()
      setConnected(false)
      await fetch(`${API_URL}/extensions/whatsapp/restart`, { method: 'POST' })
    } catch {}
  }, [beginPairing])

  const openConversationOverlay = useCallback(
    async (convo: ConversationSummary) => {
      const { jid, latestIncoming: contextMsg, turns } = convo
      if (!jid) return

      const isGroupChat = jid.endsWith('@g.us')
      const replyJid =
        !isGroupChat && contextMsg.senderJid && !contextMsg.senderJid.endsWith('@g.us')
          ? contextMsg.senderJid
          : jid
      const { contactJid, isGroup, groupName } = resolveWhatsAppChannel({
        contactJid: replyJid,
        isGroup: isGroupChat,
        groupName: isGroupChat ? contextMsg.groupName : undefined
      })
      const conversationHistory = turnsToHistoryLines(turns)

      const recentIncoming = turns
        .map((t) => t.incoming.text)
        .slice(-5)
        .join(' | ')

      let quickReplies: string[] = []
      try {
        const llmRes = await fetch(`${API_URL}/extensions/whatsapp/process-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact: contextMsg.from,
            message: recentIncoming || contextMsg.text,
            contactJid,
            isGroup,
            groupName
          })
        })
        const llmData = await llmRes.json()
        quickReplies = llmData.quickReplies || []
      } catch {}

      let contactAvatar = convo.profilePicUrl
      const avatarJids = [...new Set([jid, replyJid, contactJid].filter((j) => j?.includes('@')))]
      if (!contactAvatar && avatarJids.length > 0) {
        try {
          const avRes = await fetch(`${API_URL}/extensions/whatsapp/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toolName: 'get_avatars', args: { jids: avatarJids } })
          })
          const avData = await avRes.json()
          contactAvatar =
            avData.avatars?.[jid] ||
            avData.avatars?.[replyJid] ||
            avData.avatars?.[contactJid] ||
            null
          if (contactAvatar) {
            setAvatarByJid((prev) => ({ ...prev, [jid]: contactAvatar }))
          }
        } catch {}
      }

      const overlayData = {
        structuredResponse: {
          type: 'whatsapp_notification',
          data: {
            contact: convo.contactLabel,
            contactJid,
            message: contextMsg.text,
            isGroup,
            groupName,
            contactAvatar,
            quickReplies,
            conversationHistory
          }
        }
      }

      const openOverlay = (window as Window & { api?: { openOverlay?: (data: unknown) => void } })
        .api?.openOverlay
      if (openOverlay) {
        openOverlay(overlayData)
      }
    },
    []
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  // First visit without session: enter pairing mode
  useEffect(() => {
    if (!statsLoaded || connected || qrUrl || pairingActive) return
    if (hasCredentials || syncingRef.current) return
    beginPairing()
  }, [statsLoaded, connected, qrUrl, hasCredentials, pairingActive, beginPairing])

  // After disconnect / logout: poll until QR appears (worker may still be starting)
  useEffect(() => {
    if (!pairingActive || connected || qrUrl || syncingRef.current) return

    let cancelled = false
    const poll = async () => {
      for (let attempt = 0; attempt < 30 && !cancelled; attempt++) {
        await loadStats()
        const gotQr = await requestQr({ force: true })
        if (cancelled || gotQr || qrUrl) return
        await new Promise((r) => setTimeout(r, Math.min(400 + attempt * 80, 1200)))
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [pairingActive, connected, qrUrl, loadStats, requestQr])

  // Debounced search / pagination trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      loadPaginatedContacts(contactsPage, contactSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [contactsPage, contactSearch, loadPaginatedContacts])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPaginatedGroups(groupsPage, groupSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [groupsPage, groupSearch, loadPaginatedGroups])

  // Reset page to 1 when search changes
  useEffect(() => {
    setContactsPage(1)
  }, [contactSearch])

  useEffect(() => {
    setGroupsPage(1)
  }, [groupSearch])

  // Poll faster while waiting for QR after disconnect
  useEffect(() => {
    if (connected) return
    const ms = pairingActive && !qrUrl ? 1500 : 5000
    const interval = setInterval(loadStats, ms)
    return () => clearInterval(interval)
  }, [connected, pairingActive, qrUrl, loadStats])

  // Safety: stop spinner if contacts_synced never arrives
  useEffect(() => {
    if (!syncing) return
    const timeout = setTimeout(() => setSyncing(false), 120_000)
    return () => clearTimeout(timeout)
  }, [syncing])

  useExtensionEvents({
    onEvent: useCallback(
      (event) => {
        if (event.eventType === 'qr_code' && event.data?.qr) {
          applyQrString(event.data.qr)
          setPairingActive(false)
        } else if (event.eventType === 'connection_status') {
          const status = event.data?.status
          if (status === 'connected') setConnected(true)
          else if (status === 'disconnected') setConnected(false)
        } else if (event.eventType === 'contacts_synced') {
          setSyncedContacts(event.data?.count || 0)
          void loadStats()
          void tryFinishContactSync(event.data?.count)
        } else if (event.eventType === 'contacts_updated') {
          void loadStats()
          if (syncingRef.current) void tryFinishContactSync()
          void loadPaginatedContacts(contactsPage, contactSearch)
          void loadPaginatedGroups(groupsPage, groupSearch)
          return
        } else if (event.eventType === 'history_loaded') {
          loadHistory()
          return
        } else if (event.eventType === 'authenticated') {
          const status = event.data?.status
          if (status === 'logged_out') {
            beginPairing()
            setConnected(false)
            setSyncing(false)
          } else if (status === 'connected') {
            setConnected(true)
            setPairingActive(false)
            setQrUrl(null)
            setSyncing(true)
            loadHistory()
          } else {
            setConnected(false)
          }
          return
        }
        refresh()
      },
      [
        refresh,
        loadHistory,
        applyQrString,
        tryFinishContactSync,
        loadStats,
        beginPairing,
        loadPaginatedContacts,
        loadPaginatedGroups,
        contactsPage,
        contactSearch,
        groupsPage,
        groupSearch
      ]
    )
  })

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex-1 h-full flex flex-col min-h-0">
      <div className="shrink-0 px-6 pt-6 pb-4">
      <div className="flex items-center gap-3">
        <WhatsAppIcon className="w-8 h-8 shrink-0" />
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <div className="ml-auto flex items-center gap-2">
          {connected && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center ${
                syncing
                  ? 'bg-accent/10 border-accent/30 text-accent cursor-wait'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-text-muted hover:text-text disabled:opacity-50'
              }`}
              title={syncing ? 'Sincronizando contatos...' : 'Sincronizar contatos'}
              aria-busy={syncing}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={syncing ? 'animate-spin' : ''}
                aria-hidden
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </button>
          )}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
            />
            {connected ? 'Conectado' : 'Desconectado'}
          </div>
        </div>
      </div>
      </div>

      {!connected && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 text-center space-y-5 min-h-0">
          {qrUrl ? (
            <>
              <p className="text-sm text-text-muted max-w-sm">
                Escaneie o QR code com o WhatsApp do celular
              </p>
              <img
                src={qrUrl}
                alt="QR Code"
                className="mx-auto rounded-xl"
                width={256}
                height={256}
              />
            </>
          ) : (
            <div className="space-y-4 flex flex-col items-center">
              <div className="animate-pulse flex justify-center">
                <div className="w-48 h-48 rounded-xl bg-white/5 flex items-center justify-center">
                  <WhatsAppIcon className="w-16 h-16 opacity-30" />
                </div>
              </div>
              <p className="text-sm text-text-muted">Aguardando QR code...</p>
              <button
                onClick={reconnect}
                className="px-4 py-2 text-sm rounded-lg bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-colors"
              >
                Gerar QR
              </button>
            </div>
          )}
        </div>
      )}

      {connected && (
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 min-h-0">
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/5 bg-card p-4">
            <p className="text-2xl font-bold">{totalMessages}</p>
            <p className="text-xs text-text-muted">Mensagens</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-card p-4">
            <p className="text-2xl font-bold">{monitoredCount}</p>
            <p className="text-xs text-text-muted">Monitorados</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-card p-4">
            <p className="text-2xl font-bold">{syncedContacts}</p>
            <p className="text-xs text-text-muted">Contatos Sync</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-card p-4">
            <p className="text-2xl font-bold">Online</p>
            <p className="text-xs text-text-muted">Status</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-card">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-text-muted">Sessão ativa</span>
            <button
              onClick={disconnect}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
            >
              Desconectar
            </button>
          </div>
        </div>

      {(connected || allConversations.length > 0) && (
        <div className="rounded-xl border border-white/5 bg-card">
          <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between">
            <span>Últimas Mensagens</span>
            <span className="text-xs text-text-muted">
              {allConversations.length} conversa{allConversations.length !== 1 ? 's' : ''} · clique
              para responder
            </span>
          </div>
          {allConversations.length === 0 && (
            <div className="p-6 text-center text-sm text-text-muted">
              Nenhuma mensagem recebida ainda
            </div>
          )}
          {conversations.map((convo) => {
            const msg = convo.latestIncoming
            const avatarName = convo.isGroup
              ? convo.groupName || 'Grupo'
              : convo.contactLabel
            return (
              <div
                key={convo.jid}
                role="button"
                tabIndex={0}
                onClick={() => openConversationOverlay(convo)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openConversationOverlay(convo)
                  }
                }}
                className="px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:bg-white/10"
                title="Ver conversa e responder"
              >
                <div className="flex gap-3">
                  <ContactAvatar
                    src={convo.profilePicUrl}
                    name={avatarName}
                    id={convo.jid}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {convo.isGroup && convo.groupName ? (
                        <>
                          <span className="font-medium text-sm truncate">{convo.groupName}</span>
                          <span className="text-xs text-text-muted truncate shrink-0">
                            · {convo.contactLabel}
                          </span>
                        </>
                      ) : (
                        <span className="font-medium text-sm truncate">{convo.contactLabel}</span>
                      )}
                      {convo.incomingCount > 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-text-muted shrink-0">
                          {convo.incomingCount} msgs
                        </span>
                      )}
                      {/^\d+$/.test(convo.contactLabel) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const newName = prompt('Digite o nome para este contato:', '')
                            if (newName?.trim()) {
                              fetch(`${API_URL}/extensions/whatsapp/command`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  toolName: 'set_contact_name',
                                  args: {
                                    contact: convo.jid.split('@')[0],
                                    name: newName.trim()
                                  }
                                })
                              }).then(() => refresh())
                            }
                          }}
                          className="text-xs text-accent hover:text-accent/80 px-1.5 py-0.5 rounded bg-accent/10 hover:bg-accent/20 shrink-0"
                          title="Definir nome para este contato"
                        >
                          ✏️ Nomear
                        </button>
                      )}
                      <span className="ml-auto text-xs text-text-muted shrink-0">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-text-muted mt-0.5 line-clamp-2">{msg.text}</p>
                    {convo.latestReplies.map((reply, ri) => (
                      <div
                        key={`${reply.timestamp}-${ri}`}
                        className="mt-2 pl-3 border-l-2 border-accent/40"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-accent font-medium">Você</span>
                          <span className="text-xs text-text-muted ml-auto">
                            {formatTime(reply.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-text-muted/90 mt-0.5 line-clamp-2">
                          {reply.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}

          {conversationsTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <span className="text-xs text-text-muted">
                Mostrando {(conversationsPage - 1) * conversationsPerPage + 1} a{' '}
                {Math.min(conversationsPage * conversationsPerPage, allConversations.length)} de{' '}
                {allConversations.length} conversas
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConversationsPage((p) => Math.max(1, p - 1))}
                  disabled={conversationsPage === 1}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <span className="text-xs self-center px-2 text-text-muted">
                  {conversationsPage} / {conversationsTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setConversationsPage((p) => Math.min(conversationsTotalPages, p + 1))
                  }
                  disabled={conversationsPage === conversationsTotalPages}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {connected && (
        <>
        <div className="rounded-xl border border-white/5 bg-card">
          <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between flex-wrap gap-2">
            <span>Grupos do WhatsApp</span>
            <div className="relative w-64">
              <input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Buscar grupo..."
                className="w-full bg-white/5 rounded-lg pl-3 pr-8 py-1.5 text-xs border border-white/10 outline-none focus:border-accent/50"
              />
              {groupsLoading && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {paginatedGroups.length === 0 ? (
            <div className="p-6 text-center text-sm text-text-muted">
              {groupsLoading ? 'Carregando grupos...' : 'Nenhum grupo encontrado'}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {paginatedGroups.map((c) => (
                <div
                  key={c.id}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
                >
                  <ContactAvatar src={c.profilePicUrl} name={c.displayName} id={c.id} />
                  <div className="flex-1 min-w-0">
                    {editingName === c.id ? (
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveContactName(c.id)
                          if (e.key === 'Escape') setEditingName(null)
                        }}
                        onBlur={() => saveContactName(c.id)}
                        autoFocus
                        className="w-full max-w-xs bg-white/10 rounded px-2 py-0.5 text-sm border border-accent/50 outline-none"
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{c.displayName}</p>
                          {c.name && c.notify && c.name !== c.notify && (
                            <span className="text-xs text-text-muted opacity-60">({c.notify})</span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted truncate">{c.id.replace('@g.us', '')}</p>
                      </>
                    )}
                  </div>

                  {editingName !== c.id && (
                    <button
                      onClick={() => {
                        setEditingName(c.id)
                        setEditValue(c.displayName)
                      }}
                      className="text-xs text-text-muted hover:text-text px-1.5 py-1 rounded-lg hover:bg-white/5"
                      title="Renomear"
                    >
                      ✏️
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs ${c.monitoring ? 'text-green-400' : 'text-text-muted'}`}
                    >
                      {c.monitoring ? 'Monitorado' : 'Ignorado'}
                    </span>
                    <button
                      onClick={() => toggleMonitoring(c.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        c.monitoring ? 'bg-green-500' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          c.monitoring ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {groupsTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <span className="text-xs text-text-muted">
                Mostrando {(groupsPage - 1) * groupsPerPage + 1} a{' '}
                {Math.min(groupsPage * groupsPerPage, totalFilteredGroups)} de {totalFilteredGroups}{' '}
                grupos
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGroupsPage((p) => Math.max(1, p - 1))}
                  disabled={groupsPage === 1}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <span className="text-xs self-center px-2 text-text-muted">
                  {groupsPage} / {groupsTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setGroupsPage((p) => Math.min(groupsTotalPages, p + 1))}
                  disabled={groupsPage === groupsTotalPages}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/5 bg-card">
          <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between flex-wrap gap-2">
            <span>Contatos do WhatsApp</span>
            <div className="relative w-64">
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Buscar contato..."
                className="w-full bg-white/5 rounded-lg pl-3 pr-8 py-1.5 text-xs border border-white/10 outline-none focus:border-accent/50"
              />
              {contactsLoading && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {paginatedContacts.length === 0 ? (
            <div className="p-6 text-center text-sm text-text-muted">
              {contactsLoading ? 'Carregando contatos...' : 'Nenhum contato encontrado'}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {paginatedContacts.map((c) => (
                <div
                  key={c.id}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
                >
                  <ContactAvatar src={c.profilePicUrl} name={c.displayName} id={c.id} />
                  <div className="flex-1 min-w-0">
                    {editingName === c.id ? (
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveContactName(c.id)
                          if (e.key === 'Escape') setEditingName(null)
                        }}
                        onBlur={() => saveContactName(c.id)}
                        autoFocus
                        className="w-full max-w-xs bg-white/10 rounded px-2 py-0.5 text-sm border border-accent/50 outline-none"
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{c.displayName}</p>
                          {c.name && c.notify && c.name !== c.notify && (
                            <span className="text-xs text-text-muted opacity-60">({c.notify})</span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted truncate">+{c.phone}</p>
                      </>
                    )}
                  </div>

                  {editingName !== c.id && (
                    <button
                      onClick={() => {
                        setEditingName(c.id)
                        setEditValue(c.displayName)
                      }}
                      className="text-xs text-text-muted hover:text-text px-1.5 py-1 rounded-lg hover:bg-white/5"
                      title="Renomear"
                    >
                      ✏️
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs ${c.monitoring ? 'text-green-400' : 'text-text-muted'}`}
                    >
                      {c.monitoring ? 'Monitorado' : 'Ignorado'}
                    </span>
                    <button
                      onClick={() => toggleMonitoring(c.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        c.monitoring ? 'bg-green-500' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          c.monitoring ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {contactsTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <span className="text-xs text-text-muted">
                Mostrando {(contactsPage - 1) * contactsPerPage + 1} a{' '}
                {Math.min(contactsPage * contactsPerPage, totalFilteredContacts)} de{' '}
                {totalFilteredContacts} contatos
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setContactsPage((p) => Math.max(1, p - 1))}
                  disabled={contactsPage === 1}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <span className="text-xs self-center px-2 text-text-muted">
                  {contactsPage} / {contactsTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setContactsPage((p) => Math.min(contactsTotalPages, p + 1))}
                  disabled={contactsPage === contactsTotalPages}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}
        </div>
        </>
      )}
        </div>
      )}
    </div>
  )
}
