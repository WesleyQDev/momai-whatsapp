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

export default function WhatsAppView() {
  const [connected, setConnected] = useState(false)
  const [totalMessages, setTotalMessages] = useState(0)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [history, setHistory] = useState<Message[]>([])
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [newContact, setNewContact] = useState('')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [quickReplies, setQuickReplies] = useState<string[]>([])
  const [sending, setSending] = useState(false)

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
      setContacts(data.whitelist || [])
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

  const refresh = useCallback(async () => {
    await Promise.all([loadStats(), loadHistory()])
  }, [loadStats, loadHistory])

  // Generate quick replies when history changes
  useEffect(() => {
    const lastIncoming = [...history].reverse().find(m => m.direction === 'incoming')
    if (lastIncoming) {
      fetch(`${API_URL}/extensions/whatsapp/process-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: lastIncoming.from, message: lastIncoming.text })
      })
        .then(r => r.json())
        .then(d => { if (d.quickReplies?.length) setQuickReplies(d.quickReplies) })
        .catch(() => {})
    }
  }, [history])

  const sendQuickReply = useCallback(async (label: string) => {
    setSending(true)
    try {
      // Expand via LLM
      const llmRes = await fetch(`${API_URL}/extensions/llm/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `Mensagem recebida: "..." Intencao: ${label}. Gere a resposta.` })
      })
      const llmData = await llmRes.json()
      const lastMsg = [...history].reverse().find(m => m.direction === 'incoming')
      const finalMsg = (llmData?.text || '').trim() || label
      await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'send_message', args: { contact: lastMsg?.jid || '', message: finalMsg } })
      })
    } catch {}
    setSending(false)
  }, [history])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-restart worker when disconnected with no QR
  useEffect(() => {
    if (!connected && !qrUrl) {
      const timer = setTimeout(reconnect, 2000)
      return () => clearTimeout(timer)
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
        }
        refresh()
      },
      [refresh]
    )
  })

  const addContact = async () => {
    if (!newContact.trim()) return
    try {
      await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'add_contact', args: { contact: newContact.trim() } })
      })
      setNewContact('')
      refresh()
    } catch {}
  }

  const removeContact = async (id: string) => {
    try {
      await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'remove_contact', args: { contact: id } })
      })
      refresh()
    } catch {}
  }

  const addUnknownContact = async (jid: string) => {
    const raw = jid.split('@')[0] || jid
    await fetch(`${API_URL}/extensions/whatsapp/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName: 'add_contact', args: { contact: raw } })
    })
    refresh()
  }

  const saveContactName = async (contactId: string) => {
    if (!editValue.trim()) return
    try {
      await fetch(`${API_URL}/extensions/whatsapp/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: 'set_contact_name', args: { contact: contactId, name: editValue.trim() } })
      })
      setEditingName(null)
      refresh()
    } catch {}
  }

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

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/5 bg-card p-4">
          <p className="text-2xl font-bold">{totalMessages}</p>
          <p className="text-xs text-text-muted">Mensagens</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-card p-4">
          <p className="text-2xl font-bold">{contacts.length}</p>
          <p className="text-xs text-text-muted">Contatos</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-card p-4">
          <p className="text-2xl font-bold">{connected ? 'Online' : 'Offline'}</p>
          <p className="text-xs text-text-muted">Status</p>
        </div>
      </div>

      {!connected && (
        <div className="rounded-xl border border-white/5 bg-card p-6 text-center space-y-4">
          {qrUrl ? (
            <>
              <p className="text-sm text-text-muted">Escaneie o QR code com o WhatsApp do celular</p>
              <img src={qrUrl} alt="QR Code" className="mx-auto rounded-xl" width={256} height={256} />
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

      <div className="rounded-xl border border-white/5 bg-card">
        <div className="px-4 py-3 border-b border-white/5 font-medium text-sm flex items-center justify-between">
          <span>Ultimas Mensagens</span>
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
              {(() => {
                if (msg.direction !== 'incoming' || !/^\d+$/.test(msg.from)) return null
                const msgJid = msg.jid.split('@')[0]
                if (contacts.find(c => c.id === msgJid)) return null
                const jidDigits = msgJid.replace(/\D/g, '')
                const match = contacts.find(c => {
                  const cDigits = String(c.id || c.number).replace(/\D/g, '')
                  return cDigits && (jidDigits.endsWith(cDigits) || cDigits.endsWith(jidDigits))
                })
                return (
                  <button
                    onClick={() => {
                      if (match) {
                        fetch(`${API_URL}/extensions/whatsapp/command`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ toolName: 'set_contact_name', args: { contact: msgJid, name: match.name } })
                        }).then(() => refresh())
                      } else {
                        addUnknownContact(msg.jid)
                      }
                    }}
                    className="text-xs text-accent hover:text-accent/80 px-1.5 py-0.5 rounded bg-accent/10 hover:bg-accent/20"
                    title={match ? `Associar a ${match.name}` : 'Adicionar aos contatos'}
                  >
                    {match ? `Associar a ${match.name}` : '+ Contato'}
                  </button>
                )
              })()}
              <span className="ml-auto text-xs text-text-muted">{formatTime(msg.timestamp)}</span>
            </div>
            <p className="text-sm text-text-muted mt-0.5 ml-5 truncate">{msg.text}</p>
          </div>
        ))}

        {/* Quick reply buttons on latest incoming message */}
        {quickReplies.length > 0 && history.filter(m => m.direction === 'incoming').length > 0 && (
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

      <div className="rounded-xl border border-white/5 bg-card">
        <div className="px-4 py-3 border-b border-white/5 font-medium text-sm">
          Contatos Monitorados
        </div>
        {contacts.length === 0 && (
          <div className="p-6 text-center text-sm text-text-muted">Nenhum contato na whitelist</div>
        )}
        {contacts.map((c) => (
          <div
            key={c.id}
            className="px-4 py-3 border-b border-white/5 last:border-0 flex items-center gap-3 hover:bg-white/5 transition-colors"
          >
            <span className="text-lg">📱</span>
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
                  className="w-full bg-white/10 rounded px-2 py-0.5 text-sm border border-accent/50 outline-none"
                />
              ) : (
                <>
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-text-muted truncate">{c.number}</p>
                </>
              )}
            </div>
            <button
              onClick={() => {
                setEditingName(c.id)
                setEditValue(c.name)
              }}
              className="text-xs text-text-muted hover:text-text px-1.5 py-1 rounded-lg hover:bg-white/5"
              title="Renomear"
            >
              ✏️
            </button>
            <button
              onClick={() => removeContact(c.id)}
              className="text-xs text-red-400 hover:text-red-300 px-1.5 py-1 rounded-lg hover:bg-red-500/10"
              title="Remover"
            >
              🗑️
            </button>
          </div>
        ))}
        <div className="px-4 py-3 border-t border-white/5">
          <div className="flex gap-2">
            <input
              value={newContact}
              onChange={(e) => setNewContact(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addContact()}
              placeholder="+5511999999999"
              className="flex-1 bg-white/5 rounded-lg px-3 py-1.5 text-sm border border-white/10 outline-none focus:border-accent/50"
            />
            <button
              onClick={addContact}
              className="px-3 py-1.5 text-sm rounded-lg bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20"
            >
              Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
