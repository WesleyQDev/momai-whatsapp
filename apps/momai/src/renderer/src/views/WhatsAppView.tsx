import { useEffect, useState, useCallback, useMemo } from 'react'
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
      isGroup: latestTurn.incoming.isGroup ?? jid.endsWith('@g.us'),
      groupName: latestTurn.incoming.groupName ?? null,
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
  return (
    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">
      {isPhone ? '📱' : '👤'}
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
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [syncing, setSyncing] = useState(false)

  // Paginated contacts state
  const [contactsPage, setContactsPage] = useState(1)
  const [contactsPerPage] = useState(10)
  const [contactSearch, setContactSearch] = useState('')
  const [paginatedContacts, setPaginatedContacts] = useState<WaContact[]>([])
  const [totalFilteredContacts, setTotalFilteredContacts] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [contactsLoading, setContactsLoading] = useState(false)
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
      setConnected(data.connected || false)
      setTotalMessages(data.totalMessages || 0)
      setSyncedContacts(data.syncedContacts || 0)
      setMonitoredCount(data.monitoredCount || 0)
    } catch {}
  }, [])

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
          setTotalPages(data.totalPages || 1)
        }
      } catch {}
      setContactsLoading(false)
    },
    [contactsPerPage]
  )

  const refresh = useCallback(async () => {
    await Promise.all([
      loadStats(),
      loadHistory(),
      loadPaginatedContacts(contactsPage, contactSearch)
    ])
  }, [loadStats, loadHistory, loadPaginatedContacts, contactsPage, contactSearch])

  const handleSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      await fetch(`${API_URL}/extensions/whatsapp/sync`, {
        method: 'POST'
      })
    } catch {}
  }, [syncing])

  const toggleMonitoring = async (contactId: string) => {
    try {
      const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'toggle_monitoring', args: { contact: contactId } })
      })
      const data = await res.json()
      if (data.ok) {
        setPaginatedContacts((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, monitoring: data.monitoring } : c))
        )
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
    try {
      await fetch(`${API_URL}/extensions/whatsapp/disconnect`, { method: 'POST' })
      setConnected(false)
    } catch {}
  }, [])

  const reconnect = useCallback(async () => {
    try {
      setQrUrl(null)
      await fetch(`${API_URL}/extensions/whatsapp/restart`, { method: 'POST' })
    } catch {}
  }, [])

  const openConversationOverlay = useCallback(
    async (convo: ConversationSummary) => {
      const { jid, latestIncoming: contextMsg, turns } = convo
      if (!jid) return

      const { contactJid, isGroup, groupName } = resolveWhatsAppChannel({
        contactJid: jid,
        isGroup: contextMsg.isGroup,
        groupName: contextMsg.groupName
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
      if (!contactAvatar) {
        try {
          const avRes = await fetch(`${API_URL}/extensions/whatsapp/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toolName: 'get_avatars', args: { jids: [jid] } })
          })
          const avData = await avRes.json()
          contactAvatar = avData.avatars?.[jid] || null
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

  // Debounced search / pagination trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      loadPaginatedContacts(contactsPage, contactSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [contactsPage, contactSearch, loadPaginatedContacts])

  // Reset page to 1 when search changes
  useEffect(() => {
    setContactsPage(1)
  }, [contactSearch])

  // Poll connection status periodically when disconnected
  useEffect(() => {
    if (connected) return
    const interval = setInterval(loadStats, 5000)
    return () => clearInterval(interval)
  }, [connected, loadStats])

  useExtensionEvents({
    onEvent: useCallback(
      (event) => {
        if (event.eventType === 'qr_code') {
          import('qrcode').then((QRCode) => {
            QRCode.toDataURL(event.data.qr, { width: 256, margin: 1 }).then(setQrUrl)
          })
        } else if (event.eventType === 'connection_status') {
          setConnected(event.data?.status === 'connected')
        } else if (event.eventType === 'contacts_synced') {
          setSyncedContacts(event.data?.count || 0)
          setSyncing(false)
        } else if (event.eventType === 'contacts_updated' || event.eventType === 'history_loaded') {
          loadHistory()
          return
        } else if (event.eventType === 'authenticated') {
          setConnected(event.data?.status === 'connected')
          setQrUrl(null)
          loadHistory()
          return
        }
        refresh()
      },
      [refresh, loadHistory]
    )
  })

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <WhatsAppIcon className="w-8 h-8 shrink-0" />
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <div className="ml-auto flex items-center gap-2">
          {connected && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-text-muted hover:text-text transition-colors flex items-center justify-center disabled:opacity-50"
              title="Sincronizar contatos"
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

      {connected && (
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
      )}

      {!connected && (
        <div className="rounded-xl border border-white/5 bg-card p-6 text-center space-y-4">
          {qrUrl ? (
            <>
              <p className="text-sm text-text-muted">
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
            <div className="space-y-3">
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
      )}

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
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <span className="text-xs text-text-muted">
                Mostrando {(contactsPage - 1) * contactsPerPage + 1} a{' '}
                {Math.min(contactsPage * contactsPerPage, totalFilteredContacts)} de{' '}
                {totalFilteredContacts} contatos
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setContactsPage((p) => Math.max(1, p - 1))}
                  disabled={contactsPage === 1}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <span className="text-xs self-center px-2 text-text-muted">
                  {contactsPage} / {totalPages}
                </span>
                <button
                  onClick={() => setContactsPage((p) => Math.min(totalPages, p + 1))}
                  disabled={contactsPage === totalPages}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
