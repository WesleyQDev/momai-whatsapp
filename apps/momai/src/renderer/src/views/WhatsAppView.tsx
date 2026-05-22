import { useEffect, useState, useCallback } from 'react'
import { API_URL } from '../constants'
import { useExtensionEvents } from '../hooks/useExtensionEvents'

interface Message {
  from: string
  jid: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
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
  const [quickReplies, setQuickReplies] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  // Paginated contacts state
  const [contactsPage, setContactsPage] = useState(1)
  const [contactsPerPage] = useState(10)
  const [contactSearch, setContactSearch] = useState('')
  const [paginatedContacts, setPaginatedContacts] = useState<WaContact[]>([])
  const [totalFilteredContacts, setTotalFilteredContacts] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [contactsLoading, setContactsLoading] = useState(false)

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
      if (data.history) setHistory(data.history)
    } catch {}
  }, [])

  const loadPaginatedContacts = useCallback(async (page: number, search: string) => {
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
  }, [contactsPerPage])

  const refresh = useCallback(async () => {
    await Promise.all([
      loadStats(),
      loadHistory(),
      loadPaginatedContacts(contactsPage, contactSearch)
    ])
  }, [loadStats, loadHistory, loadPaginatedContacts, contactsPage, contactSearch])

  const toggleMonitoring = async (contactId: string) => {
    try {
      const res = await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'toggle_monitoring', args: { contact: contactId } })
      })
      const data = await res.json()
      if (data.ok) {
        setPaginatedContacts(prev =>
          prev.map(c => c.id === contactId ? { ...c, monitoring: data.monitoring } : c)
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

  // Generate quick replies when history changes
  useEffect(() => {
    const lastIncoming = [...history].reverse().find((m) => m.direction === 'incoming')
    if (lastIncoming) {
      fetch(`${API_URL}/extensions/whatsapp/process-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: lastIncoming.from, message: lastIncoming.text })
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.quickReplies?.length) setQuickReplies(d.quickReplies)
        })
        .catch(() => {})
    }
  }, [history])

  const sendQuickReply = useCallback(
    async (label: string) => {
      setSending(true)
      try {
        // Expand via LLM
        const llmRes = await fetch(`${API_URL}/extensions/llm/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `Mensagem recebida: "..." Intencao: ${label}. Gere a resposta.`
          })
        })
        const llmData = await llmRes.json()
        const lastMsg = [...history].reverse().find((m) => m.direction === 'incoming')
        const finalMsg = (llmData?.text || '').trim() || label
        await fetch(`${API_URL}/extensions/whatsapp/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: 'send_message',
            args: { contact: lastMsg?.jid || '', message: finalMsg }
          })
        })
      } catch {}
      setSending(false)
    },
    [history]
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

  // Auto-restart worker when disconnected with no QR
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    if (!connected && !qrUrl) {
      timer = setTimeout(reconnect, 2000)
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [connected, qrUrl, reconnect])

  useExtensionEvents({
    onEvent: useCallback(
      (event) => {
        if (event.eventType === 'qr_code') {
          import('qrcode').then((QRCode) => {
            QRCode.toDataURL(event.data.qr, { width: 256, margin: 1 }).then(setQrUrl)
          })
        } else if (event.eventType === 'authenticated') {
          setConnected(event.data?.status === 'connected')
          setQrUrl(null)
        } else if (event.eventType === 'connection_status') {
          setConnected(event.data?.status === 'connected')
        } else if (event.eventType === 'contacts_synced') {
          setSyncedContacts(event.data?.count || 0)
        }
        refresh()
      },
      [refresh]
    )
  })

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">💚</span>
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <div
          className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
          />
          {connected ? 'Conectado' : 'Desconectado'}
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
                  <span className="text-4xl opacity-20">💚</span>
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

      {connected && (
        <div className="rounded-xl border border-white/5 bg-card">
          <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between">
            <span>Últimas Mensagens</span>
            <span className="text-xs text-text-muted">{history.length} msgs</span>
          </div>
          {history.length === 0 && (
            <div className="p-6 text-center text-sm text-text-muted">Nenhuma mensagem ainda</div>
          )}
          {history.map((msg, i) => (
            <div
              key={i}
              className="px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">{msg.direction === 'incoming' ? '🟢' : '🔵'}</span>
                <span className="font-medium text-sm">{msg.from}</span>
                {/^\d+$/.test(msg.from) && (
                  <button
                    onClick={() => {
                      const newName = prompt('Digite o nome para este contato:', '')
                      if (newName?.trim()) {
                        fetch(`${API_URL}/extensions/whatsapp/command`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            toolName: 'set_contact_name',
                            args: { contact: msg.jid.split('@')[0], name: newName.trim() }
                          })
                        }).then(() => refresh())
                      }
                    }}
                    className="text-xs text-accent hover:text-accent/80 px-1.5 py-0.5 rounded bg-accent/10 hover:bg-accent/20"
                    title="Definir nome para este contato"
                  >
                    ✏️ Nomear
                  </button>
                )}
                <span className="ml-auto text-xs text-text-muted">{formatTime(msg.timestamp)}</span>
              </div>
              <p className="text-sm text-text-muted mt-0.5 ml-5 truncate">{msg.text}</p>
            </div>
          ))}

          {/* Quick reply buttons on latest incoming message */}
          {quickReplies.length > 0 &&
            history.filter((m) => m.direction === 'incoming').length > 0 && (
              <div className="px-4 py-3 border-t border-white/5 flex flex-wrap gap-2">
                {quickReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => sendQuickReply(reply)}
                    disabled={sending}
                    className="px-3 py-1.5 text-xs rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors border border-accent/20 disabled:opacity-50"
                  >
                    {sending ? '...' : reply}
                  </button>
                ))}
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
                    <span className={`text-xs ${c.monitoring ? 'text-green-400' : 'text-text-muted'}`}>
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
                Mostrando {((contactsPage - 1) * contactsPerPage) + 1} a {Math.min(contactsPage * contactsPerPage, totalFilteredContacts)} de {totalFilteredContacts} contatos
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setContactsPage(p => Math.max(1, p - 1))}
                  disabled={contactsPage === 1}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text hover:bg-white/10 border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <span className="text-xs self-center px-2 text-text-muted">
                  {contactsPage} / {totalPages}
                </span>
                <button
                  onClick={() => setContactsPage(p => Math.min(totalPages, p + 1))}
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
