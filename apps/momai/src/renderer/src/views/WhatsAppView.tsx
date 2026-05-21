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
  const [refreshing, setRefreshing] = useState(false)

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

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadStats(), loadHistory()])
    setRefreshing(false)
  }, [loadStats, loadHistory])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

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
        <button
          onClick={refresh}
          disabled={refreshing}
          className="ml-2 px-2 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-text-muted disabled:opacity-50"
        >
          {refreshing ? '...' : 'Atualizar'}
        </button>
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

      {!connected && qrUrl && (
        <div className="rounded-xl border border-white/5 bg-card p-6 text-center space-y-3">
          <p className="text-sm text-text-muted">Escaneie o QR code com o WhatsApp do celular</p>
          <img src={qrUrl} alt="QR Code" className="mx-auto rounded-xl" width={256} height={256} />
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
              <span className="ml-auto text-xs text-text-muted">{formatTime(msg.timestamp)}</span>
            </div>
            <p className="text-sm text-text-muted mt-0.5 ml-5 truncate">{msg.text}</p>
          </div>
        ))}
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
