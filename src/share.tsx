import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  PaperAirplaneIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  UserIcon,
  DocumentDuplicateIcon,
  ArrowPathIcon,
  XMarkIcon,
  PlusIcon,
  CheckIcon
} from '@heroicons/react/24/outline'
import ContactAvatar from './components/ContactAvatar'
import { getApiBaseUrl } from './utils/apiBase'

interface ShareProps {
  payload: {
    title?: string
    text?: string
    url?: string
    files?: Array<{ name: string; path?: string; dataUrl?: string; mimeType?: string }>
    [key: string]: any
  }
  onClose: () => void
  onBack: () => void
  onSuccess?: () => void
}

interface ContactItem {
  id: string
  jid?: string
  name?: string
  phone?: string | null
  profilePicUrl?: string | null
  isGroup?: boolean
  canSend?: boolean
}

export default function WhatsAppShareCard({
  payload,
  onClose,
  onBack,
  onSuccess
}: ShareProps): React.JSX.Element {
  const initialText = useMemo(() => {
    const parts: string[] = []
    if (payload.title) parts.push(`*${payload.title}*`)
    if (payload.text) parts.push(payload.text)
    if (payload.url) parts.push(payload.url)
    return parts.join('\n\n')
  }, [payload])

  const [contactQuery, setContactQuery] = useState('')
  const [selectedContact, setSelectedContact] = useState<ContactItem | null>(null)
  const [showAllContacts, setShowAllContacts] = useState(false)
  const [message, setMessage] = useState(initialText)
  const [contacts, setContacts] = useState<ContactItem[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollH = textareaRef.current.scrollHeight
      const targetHeight = Math.min(Math.max(scrollH, 130), 280)
      textareaRef.current.style.height = `${targetHeight}px`
    }
  }, [message])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingContacts(true)
      try {
        const base = getApiBaseUrl()
        if (!base) return

        const token = (window as any)?.api?.getSessionToken?.() || ''
        const [contactsRes, historyRes] = await Promise.all([
          fetch(`${base}/extensions/momai-whatsapp/command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Token': token
            },
            body: JSON.stringify({ toolName: 'list_contacts', args: {} })
          })
            .then((r) => r.json())
            .catch(() => null),
          fetch(`${base}/extensions/momai-whatsapp/command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Token': token
            },
            body: JSON.stringify({ toolName: 'get_history', args: {} })
          })
            .then((r) => r.json())
            .catch(() => null)
        ])

        if (cancelled) return

        const isExcludedJid = (jid: string) => {
          if (!jid) return true
          const lower = jid.toLowerCase()
          return (
            lower.endsWith('@newsletter') ||
            lower.endsWith('@broadcast') ||
            lower === 'status@broadcast' ||
            lower.endsWith('@call') ||
            lower.endsWith('@lid')
          )
        }

        const rawContacts = Array.isArray(contactsRes?.contacts) ? contactsRes.contacts : []
        const rawGroups = Array.isArray(contactsRes?.groups) ? contactsRes.groups : []
        const combined: ContactItem[] = [...rawContacts, ...rawGroups].filter((c: any) => {
          if (!c?.id || isExcludedJid(c.id)) return false
          if (c.canSend === false) return false
          return true
        })

        // Map recent conversations order from history
        const recentOrder = new Map<string, number>()
        let rank = 0
        for (const msg of historyRes?.history || []) {
          const jid = msg.replyJid || msg.jid
          if (jid && !recentOrder.has(jid)) {
            recentOrder.set(jid, rank)
            const clean = jid.includes(':')
              ? `${jid.split('@')[0].split(':')[0]}@${jid.split('@')[1]}`
              : jid
            if (!recentOrder.has(clean)) recentOrder.set(clean, rank)
            const digits = jid.split('@')[0].replace(/\D/g, '')
            if (digits && !recentOrder.has(digits)) recentOrder.set(digits, rank)
            rank++
          }
        }

        // Sort: recent message contacts first, then alphabetically
        const sorted = combined.sort((a, b) => {
          const rankA = recentOrder.get(a.id) ?? recentOrder.get(a.phone || '') ?? 99999
          const rankB = recentOrder.get(b.id) ?? recentOrder.get(b.phone || '') ?? 99999
          if (rankA !== rankB) return rankA - rankB
          const nameA = a.name || a.phone || a.id
          const nameB = b.name || b.phone || b.id
          return nameA.localeCompare(nameB)
        })

        setContacts(sorted)

        // Hydrate missing avatars for visible contacts in background
        const missing = sorted
          .filter(
            (c) =>
              !c.profilePicUrl &&
              c.id &&
              (c.id.endsWith('@s.whatsapp.net') || c.id.endsWith('@g.us'))
          )
          .map((c) => c.id)
          .slice(0, 20)

        if (missing.length > 0) {
          fetch(`${base}/extensions/momai-whatsapp/command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Token': token
            },
            body: JSON.stringify({
              toolName: 'get_avatars',
              args: { jids: missing }
            })
          })
            .then((r) => r.json())
            .then((avData) => {
              if (cancelled || !avData?.avatars) return
              const map = avData.avatars
              setContacts((prev) =>
                prev.map((item) =>
                  item.id && map[item.id] ? { ...item, profilePicUrl: map[item.id] } : item
                )
              )
            })
            .catch(() => {})
        }
      } catch {
        // Fallback or offline
      } finally {
        if (!cancelled) setLoadingContacts(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Top 3 contatos mais recentes (sem scroll)
  const recentContacts = useMemo(() => {
    return contacts.slice(0, 3)
  }, [contacts])

  // Filtered contacts for the search / "Ver todos" modal
  const filteredAllContacts = useMemo(() => {
    if (!contactQuery.trim()) return contacts
    const q = contactQuery.toLowerCase().trim()
    return contacts.filter((c) => {
      const name = (c.name || '').toLowerCase()
      const jid = (c.jid || c.phone || c.id || '').toLowerCase()
      return name.includes(q) || jid.includes(q)
    })
  }, [contacts, contactQuery])

  const handleSend = async () => {
    const target = (selectedContact?.id || selectedContact?.jid || contactQuery).trim()
    if (!target) {
      setErrorMessage('Informe ou selecione um contato ou grupo.')
      return
    }
    if (!message.trim() && (!payload.files || payload.files.length === 0)) {
      setErrorMessage('Digite uma mensagem para enviar.')
      return
    }

    setSending(true)
    setErrorMessage(null)

    try {
      const base = getApiBaseUrl()
      if (!base) throw new Error('Servidor da extensão não encontrado.')

      const args: Record<string, any> = {
        contact: target,
        message: message.trim()
      }

      // If payload has image / dataUrl attachment
      const firstFile = payload.files?.[0]
      if (firstFile?.dataUrl) {
        args.image = firstFile.dataUrl
      } else if (firstFile?.path) {
        args.image = firstFile.path
      }

      const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
        },
        body: JSON.stringify({
          toolName: 'send_message',
          args
        })
      })

      const resData = await res.json().catch(() => null)
      if (res.ok && resData?.ok !== false) {
        setSentSuccess(true)
        setTimeout(() => {
          onSuccess?.()
        }, 1200)
      } else {
        setErrorMessage(resData?.error || 'Não foi possível enviar a mensagem no WhatsApp.')
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao comunicar com o WhatsApp.')
    } finally {
      setSending(false)
    }
  }

  if (sentSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 animate-zoom-in">
        <div className="w-14 h-14 rounded-full bg-success/15 text-success flex items-center justify-center">
          <CheckCircleIcon className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-text">Enviado no WhatsApp!</h3>
        <p className="text-xs text-text-muted">Sua mensagem foi enviada com sucesso.</p>
      </div>
    )
  }

  const isSelectedInRecent =
    selectedContact && recentContacts.some((c) => c.id === selectedContact.id)

  return (
    <div className="flex-1 flex flex-col justify-between space-y-4 min-h-[380px]">
      {/* Seletor de Contatos: Top 3 + Botão Mais (Grid fixo sem scroll) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-muted">Para quem enviar:</label>
          {selectedContact && (
            <span className="text-[11px] text-[#25D366] font-medium flex items-center gap-1">
              <CheckIcon className="w-3.5 h-3.5" />
              Destinatário selecionado
            </span>
          )}
        </div>

        {/* Grid de 4 colunas perfeitamente distribuídas na HORIZONTAL (3 contatos + botão mais) */}
        <div
          className="w-full py-1"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '0.5rem',
            width: '100%'
          }}
        >
          {loadingContacts ? (
            <div
              className="py-3 text-xs text-text-muted flex items-center justify-center gap-2"
              style={{ gridColumn: 'span 4' }}
            >
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              <span>Carregando contatos recentes...</span>
            </div>
          ) : (
            <>
              {recentContacts.map((c) => {
                const name = c.name || c.phone || c.id || 'Contato'
                const isSelected = selectedContact?.id === c.id

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedContact(isSelected ? null : c)
                      setContactQuery('')
                    }}
                    className="flex flex-col items-center gap-1.5 group cursor-pointer focus:outline-none"
                    style={{ minWidth: 0, width: '100%' }}
                    title={name}
                  >
                    <div
                      className={`relative rounded-full transition-all duration-150 shrink-0 ${
                        isSelected
                          ? 'ring-2 ring-[#25D366] ring-offset-2 ring-offset-background scale-105'
                          : 'group-hover:scale-105'
                      }`}
                    >
                      <ContactAvatar
                        src={c.profilePicUrl}
                        name={name}
                        id={c.id}
                        size="md"
                        className="w-12 h-12 text-sm"
                        disableViewer
                      />
                      {isSelected && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow">
                          <CheckIcon className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[11px] leading-tight text-center transition-colors ${
                        isSelected
                          ? 'text-[#25D366] font-semibold'
                          : 'text-text group-hover:text-text'
                      }`}
                      style={{
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block'
                      }}
                    >
                      {name}
                    </span>
                  </button>
                )
              })}

              {/* Botão [+] para ver todos os números / contatos */}
              <button
                type="button"
                onClick={() => setShowAllContacts(!showAllContacts)}
                className="flex flex-col items-center gap-1.5 group cursor-pointer focus:outline-none"
                style={{ minWidth: 0, width: '100%' }}
                title={showAllContacts ? 'Recolher contatos' : 'Ver todos os contatos'}
              >
                <div
                  className={`w-12 h-12 rounded-full border border-dashed flex items-center justify-center shrink-0 transition-all ${
                    showAllContacts
                      ? 'border-[#25D366] bg-[#25D366]/10 text-[#25D366]'
                      : 'border-border hover:border-text-muted/60 bg-input/40 text-text-muted hover:text-text'
                  }`}
                >
                  {showAllContacts ? (
                    <XMarkIcon className="w-5 h-5" />
                  ) : (
                    <PlusIcon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className="text-[11px] leading-tight text-center text-text-muted group-hover:text-text"
                  style={{
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'block'
                  }}
                >
                  {showAllContacts ? 'Fechar' : 'Mais'}
                </span>
              </button>
            </>
          )}
        </div>

        {/* Card de seleção caso o contato selecionado venha da busca expandida */}
        {selectedContact && !isSelectedInRecent && (
          <div className="flex items-center justify-between p-2.5 bg-input border border-border rounded-lg animate-zoom-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <ContactAvatar
                src={selectedContact.profilePicUrl}
                name={selectedContact.name || selectedContact.phone || selectedContact.id}
                id={selectedContact.id}
                size="sm"
                disableViewer
              />
              <div className="min-w-0 text-left">
                <div className="text-xs font-semibold text-text truncate">
                  {selectedContact.name || selectedContact.phone || selectedContact.id}
                </div>
                <div className="text-[10px] text-text-muted truncate">
                  {selectedContact.isGroup
                    ? 'Grupo'
                    : selectedContact.phone || selectedContact.id.split('@')[0]}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedContact(null)}
              className="p-1 text-text-muted hover:text-text rounded transition-colors cursor-pointer"
              title="Trocar contato"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Painel expandido "Ver todos os números / contatos" ao clicar no [+] */}
        {showAllContacts && (
          <div className="p-3 bg-sidebar/70 border border-border rounded-xl space-y-2 animate-zoom-in">
            <div className="relative">
              <input
                type="text"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Buscar contato ou digitar número..."
                className="w-full pl-8 pr-8 py-1.5 bg-input border border-border rounded-lg text-xs text-text placeholder:text-text-muted/60 focus:outline-none focus:border-border-hover transition-colors"
                autoFocus
              />
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2" />
              {contactQuery && (
                <button
                  type="button"
                  onClick={() => setContactQuery('')}
                  className="absolute right-2.5 top-2 text-text-muted hover:text-text cursor-pointer"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {filteredAllContacts.length > 0 ? (
                filteredAllContacts.map((c) => {
                  const name = c.name || c.phone || c.id || 'Contato'
                  const isSelected = selectedContact?.id === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedContact(c)
                        setContactQuery('')
                        setShowAllContacts(false)
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left cursor-pointer ${
                        isSelected
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-input border border-transparent hover:border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ContactAvatar
                          src={c.profilePicUrl}
                          name={name}
                          id={c.id}
                          size="sm"
                          disableViewer
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-text truncate">
                            {name}
                          </div>
                          <div className="text-[10px] text-text-muted truncate">
                            {c.isGroup ? 'Grupo' : c.phone || c.id.split('@')[0]}
                          </div>
                        </div>
                      </div>
                      {c.isGroup && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-muted shrink-0">
                          Grupo
                        </span>
                      )}
                    </button>
                  )
                })
              ) : contactQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContact({ id: contactQuery.trim(), name: contactQuery.trim() })
                    setContactQuery('')
                    setShowAllContacts(false)
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-input border border-dashed border-border text-xs text-text text-left cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 text-text-muted" />
                  <span>Enviar para "{contactQuery.trim()}"</span>
                </button>
              ) : (
                <div className="py-3 text-center text-xs text-text-muted">
                  Nenhum contato encontrado
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mensagem / Conteúdo */}
      <div className="space-y-1.5 flex-1 flex flex-col">
        <label className="text-xs font-medium text-text-muted">Mensagem:</label>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Digite a mensagem para compartilhar..."
          className="w-full p-3 bg-input border border-border rounded-lg text-xs text-text placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 leading-relaxed overflow-y-auto"
          style={{ minHeight: '130px', maxHeight: '280px', resize: 'none' }}
        />
      </div>

      {/* Anexos de arquivo se houver */}
      {payload.files && payload.files.length > 0 && (
        <div className="p-2 bg-sidebar border border-border rounded-lg flex items-center gap-2">
          <DocumentDuplicateIcon className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-xs text-text truncate">
            {payload.files.length === 1
              ? payload.files[0].name
              : `${payload.files.length} arquivos anexados`}
          </span>
        </div>
      )}

      {/* Erro */}
      {errorMessage && (
        <div className="p-2 bg-error/10 border border-error/20 rounded-lg text-xs text-error">
          {errorMessage}
        </div>
      )}

      {/* Botões de Ação - sem linha divisória */}
      <div className="flex items-center justify-between gap-3 pt-2 mt-auto">
        <button
          type="button"
          onClick={onBack}
          disabled={sending}
          className="px-4 py-2 text-xs font-medium text-text-muted hover:text-text hover:bg-input border border-border rounded-lg transition-colors cursor-pointer"
        >
          Voltar
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={sending || (!selectedContact && !contactQuery.trim())}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 font-medium text-xs rounded-lg transition-all ${
            !selectedContact && !contactQuery.trim()
              ? 'bg-input border border-border text-text-muted/60 cursor-not-allowed opacity-70'
              : 'text-white cursor-pointer shadow-sm hover:opacity-95 active:scale-[0.98]'
          }`}
          style={
            selectedContact || contactQuery.trim()
              ? { backgroundColor: '#25D366', color: '#ffffff' }
              : undefined
          }
        >
          {sending ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              <span>Enviando...</span>
            </>
          ) : (
            <>
              <PaperAirplaneIcon className="w-4 h-4" />
              <span>Enviar no WhatsApp</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
