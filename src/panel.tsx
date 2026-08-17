import { useEffect, useRef, useState, useCallback } from 'react'
import {
  XMarkIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import QRCode from 'qrcode'
import ImageViewer from 'momai:image-viewer'
import sdk from 'momai:sdk'
import { useExtensionEvents } from './hooks/useExtensionEvents'

const getApiBaseUrl = (): string => {
  const fromHost = (window as any)?.api?.getApiBaseUrl?.()
  if (fromHost) return String(fromHost).replace(/\/+$/, '')
  const fromSdk = (sdk as any)?.API_URL
  if (fromSdk) return String(fromSdk).replace(/\/+$/, '')
  return ''
}

const API_URL = getApiBaseUrl()

type HistoryLine = {
  direction: 'incoming' | 'outgoing'
  text: string
  timestamp: number
  from?: string
  audio?: string
}

type Participant = {
  id: string
  name: string
  phone: string
  admin?: string
  avatar?: string | null
}

const formatHistoryTime = (ts: number) => {
  const ms = ts > 1e12 ? ts : ts * 1000
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const VOICE_LABELS: Record<string, string> = {
  listening: 'Aguardando "responda"...',
  detected: 'Ouvindo resposta...',
  complete: 'Enviando...',
  error: 'Erro ao ouvir',
  timeout: 'Fale "responda" + mensagem'
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
  const [showViewer, setShowViewer] = useState(false)
  // Guarda o último src que a imagem já mostrou e o segura mesmo que o host
  // re-renderize o overlay com src alternando entre valor e undefined — assim o
  // avatar não fica piscando entre foto e letra. Só troca de foto quando o valor
  // do src muda, e só volta para o fallback quando muda o contato (id).
  const [stableSrc, setStableSrc] = useState<string | null>(src || null)
  const prevIdRef = useRef<string>(id)

  useEffect(() => {
    // Muda o contato: volta ao fallback de letra até a foto do novo contato chegar
    // (recomeça do zero).
    if (id !== prevIdRef.current) {
      prevIdRef.current = id
      setStableSrc(src || null)
      return
    }
    // Mesmo contato: só sobe para a foto quando um src real chegar; não volta para
    // a letra quando o host passa src indefinido momentaneamente (evita o piscar).
    if (src) setStableSrc(src)
  }, [src, id])

  if (stableSrc) {
    return (
      <>
        <img
          key={stableSrc}
          src={stableSrc}
          alt={name}
          onError={() => setStableSrc((prev) => (prev === src ? null : prev))}
          className="w-10 h-10 rounded-full object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            setShowViewer(true)
          }}
        />
        {showViewer && <ImageViewer src={stableSrc} alt={name} onClose={() => setShowViewer(false)} />}
      </>
    )
  }

  const initials = getInitials(name)
  if (initials) {
    const color = getAvatarColor(id)
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-text font-semibold text-sm shrink-0"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    )
  }

  const isPhone = /^[+\d\s().-]*$/.test(name)
  return (
    <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-border/40 flex items-center justify-center text-lg shrink-0">
      {isPhone ? '📱' : '👤'}
    </div>
  )
}

export default function WhatsAppNotificationCard({ data }: { data: any }) {
  const senderName = data?.senderName
  const contact = data?.contact || data?.from || 'Desconhecido'
  const message = data?.message || data?.text || ''
  const conversationHistory: HistoryLine[] = data?.conversationHistory || []
  const quickReplies = data?.quickReplies || []
  const contactJid = data?.contactJid || data?.contact || ''
  const isGroup = data?.isGroup || false
  const groupName = data?.groupName || ''
  const isAdminsOnly = data?.isAdminsOnly || false
  const onClose = data?.onClose || (() => {})

  const [voiceStatus, setVoiceStatus] = useState<
    'idle' | 'listening' | 'detected' | 'complete' | 'error' | 'timeout'
  >('idle')
  const [customText, setCustomText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  // Esconde o card na hora do envio sem destruir a janela (a geração via LLM e o
  // envio rodam em background, já que destruir a janela agora cancelaria o fetch).
  const [minimized, setMinimized] = useState(false)
  // Avatar autônomo: quando o host não mandou contactAvatar (a foto ainda não
  // estava pronta na abertura), o painel busca por conta própria via get_avatars
  // em vez de ficar mostrando a letra até chegar um novo render.
  const [resolvedAvatar, setResolvedAvatar] = useState<string | null>(null)
  const avatarFetchedRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const historyScrollRef = useRef<HTMLDivElement | null>(null)
  /** Bumped on manual/quick-reply send so in-flight voice sends are ignored */
  const interactionGenRef = useRef(0)

  // Destinatário ativo (pode ser o grupo original ou um contato selecionado da lista de membros)
  const [activeRecipient, setActiveRecipient] = useState<{
    jid: string
    name: string
    avatar?: string | null
    isGroup: boolean
    fromGroupJid?: string
    fromGroupName?: string
  }>({
    jid: contactJid,
    name: isGroup ? groupName || contact : contact,
    avatar: data?.contactAvatar || null,
    isGroup,
    fromGroupJid: isGroup ? contactJid : undefined,
    fromGroupName: isGroup ? groupName || contact : undefined
  })

  // Sincroniza activeRecipient quando data muda
  useEffect(() => {
    setActiveRecipient({
      jid: contactJid,
      name: isGroup ? groupName || contact : contact,
      avatar: data?.contactAvatar || resolvedAvatar || null,
      isGroup,
      fromGroupJid: isGroup ? contactJid : undefined,
      fromGroupName: isGroup ? groupName || contact : undefined
    })
    setShowParticipants(false)
    setParticipantSearch('')
  }, [contactJid, contact, isGroup, groupName, data?.contactAvatar, resolvedAvatar])

  // Gerenciamento de participantes do grupo
  const [showParticipants, setShowParticipants] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [participantsError, setParticipantsError] = useState<string | null>(null)
  const [participantSearch, setParticipantSearch] = useState('')

  const handleToggleParticipants = useCallback(async () => {
    if (showParticipants) {
      setShowParticipants(false)
      return
    }
    const groupJidToFetch = activeRecipient.fromGroupJid || (isGroup ? contactJid : '')
    if (!groupJidToFetch) return

    setShowParticipants(true)
    setParticipantSearch('')
    if (participants.length > 0) return

    setLoadingParticipants(true)
    setParticipantsError(null)
    try {
      const { data: res } = await sdk.api.post('/extensions/whatsapp/command', {
        toolName: 'get_group_participants',
        args: { groupJid: groupJidToFetch }
      })
      if (res?.ok && Array.isArray(res.participants)) {
        setParticipants(res.participants)
      } else {
        setParticipantsError(res?.error || 'Não foi possível carregar os membros do grupo.')
      }
    } catch (err: any) {
      setParticipantsError(err?.message || 'Erro ao buscar participantes.')
    } finally {
      setLoadingParticipants(false)
    }
  }, [showParticipants, activeRecipient.fromGroupJid, isGroup, contactJid, participants.length])

  const handleSelectParticipant = (p: Participant) => {
    setActiveRecipient({
      jid: p.id,
      name: p.name,
      avatar: p.avatar,
      isGroup: false,
      fromGroupJid: isGroup ? contactJid : activeRecipient.fromGroupJid,
      fromGroupName: isGroup ? groupName || contact : activeRecipient.fromGroupName
    })
    setShowParticipants(false)
    setCustomText('')
    inputRef.current?.focus()
  }

  const handleReturnToGroup = () => {
    if (activeRecipient.fromGroupJid) {
      setActiveRecipient({
        jid: activeRecipient.fromGroupJid,
        name: activeRecipient.fromGroupName || 'Grupo',
        avatar: data?.contactAvatar || resolvedAvatar || null,
        isGroup: true,
        fromGroupJid: activeRecipient.fromGroupJid,
        fromGroupName: activeRecipient.fromGroupName
      })
    }
    setShowParticipants(false)
    setCustomText('')
  }

  useEffect(() => {
    setCustomText('')
    setSending(false)
    setSendError('')
    interactionGenRef.current += 1
  }, [contactJid, message, conversationHistory.length])

  // Se o host não entregou a foto do contato, busca o avatar por conta própria.
  const avatarSrc = data?.contactAvatar || resolvedAvatar
  useEffect(() => {
    if (!contactJid || data?.contactAvatar || avatarFetchedRef.current === contactJid) return
    avatarFetchedRef.current = contactJid
    let cancelled = false
    ;(async () => {
      try {
        const { data: avData } = await sdk.api.post('/extensions/whatsapp/command', {
          toolName: 'get_avatars',
          args: { jids: [contactJid] }
        })
        if (cancelled) return
        const url = avData?.avatars?.[contactJid]
        if (url) setResolvedAvatar(url)
      } catch {
        // Sem foto disponível: mantém o fallback de letra.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [contactJid, data?.contactAvatar])

  useEffect(() => {
    const el = historyScrollRef.current
    if (!el || conversationHistory.length === 0) return
    el.scrollTop = el.scrollHeight
  }, [contactJid, conversationHistory.length])

  // Autosize: define o tamanho da janela overlay.
  // A largura é fixa (CARD_WIDTH) e a altura é limitada a MAX_HEIGHT.
  // O card usa min-h/max-h para ser responsivo, mas a janela sempre
  // respeita o MAX_HEIGHT para não crescer infinitamente.
  useEffect(() => {
    const el = cardRef.current
    const setSize = (window as any).api?.setOverlaySize
    if (!el || typeof setSize !== 'function') return

    const CARD_WIDTH = 320
    const MAX_HEIGHT = 400 // altura máxima do card (px)
    const MARGIN = 16 // m-4 no card; janela precisa incluir as duas margens

    // Define o tamanho uma vez quando o card é montado
    setSize({
      width: CARD_WIDTH + MARGIN * 2,
      height: MAX_HEIGHT + MARGIN * 2
    })
  }, [])

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const expandQuickReply = useCallback(
    async (intent: string) => {
      const displayContact = activeRecipient.name || senderName || contact
      try {
        const { data } = await sdk.api.post('/extensions/llm/complete', {
          prompt: [
              'Escreva APENAS o texto de uma mensagem de WhatsApp a ser enviada.',
              `Contato: ${displayContact}`,
              activeRecipient.isGroup ? `Grupo: ${activeRecipient.name}` : '',
              !activeRecipient.isGroup && activeRecipient.fromGroupJid
                ? `Contexto: Contato do grupo ${activeRecipient.fromGroupName}`
                : '',
              conversationHistory.length > 0 && activeRecipient.jid === contactJid
                ? `Historico recente:\n${conversationHistory
                    .map((l) =>
                      l.direction === 'incoming'
                        ? `${l.from || contact}: ${l.text}`
                        : `Voce: ${l.text}`
                    )
                    .join('\n')}`
                : message && activeRecipient.jid === contactJid
                  ? `Mensagem recebida: "${message}"`
                  : '',
              `Intencao: ${intent}`,
              'Resposta curta e natural em portugues, sem aspas nem explicacao.'
            ]
              .filter(Boolean)
              .join('\n')
        })
        const expanded = (data?.text || '').trim()
        return expanded || intent
      } catch {
        return intent
      }
    },
    [contact, senderName, message, activeRecipient, conversationHistory, contactJid]
  )

  const beginUserSend = useCallback(() => {
    stop()
    setVoiceStatus('idle')
    return ++interactionGenRef.current
  }, [stop])

  const sendReply = useCallback(
    async (text: string, gen: number) => {
      const targetJid = activeRecipient.jid
      const body = text?.trim()
      if (!body || gen !== interactionGenRef.current) {
        if (gen === interactionGenRef.current) setSending(false)
        return
      }

      setSending(true)
      setCustomText('')
      setSendError('')
      try {
        // O worker pode demorar em casos legítimos (sync de contatos pós-conexão,
        // reconexão do WebSocket, retries do Baileys, envio de mídia grande). O
        // timeout único de 60s cobre toda a janela de sync (~30-60s) sem retry:
        // retry aqui DUPLICARIA o envio, pois o worker segue processando o comando
        // original mesmo quando o fetch é abortado. Antes eram 15s/3 tentativas, e
        // qualquer envio que passasse de 15s estourava com "Tempo esgotado" mesmo
        // com o worker ainda enviando. A base URL vem do host
        // (window.api.getApiBaseUrl), nunca hardcoded.
        const base = getApiBaseUrl()
        if (!base) {
          setSendError('Não foi possível determinar o servidor da extensão. Tente novamente.')
          setSending(false)
          setMinimized(false)
          return
        }
        const url = `${base}/extensions/whatsapp/command`
        const payload = {
          toolName: 'send_message',
          args: { contact: targetJid, message: body }
        }
        console.log('[WhatsAppNotificationCard] sendReply fetch →', url, 'jid=', targetJid)
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 60000)
        let result: any = null
        let lastError = ''
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
            },
            body: JSON.stringify(payload),
            signal: ctrl.signal
          })
          const text = await res.text()
          console.log('[WhatsAppNotificationCard] sendReply fetch RES', res.status, text.slice(0, 200))
          let data: any = null
          try {
            data = text ? JSON.parse(text) : null
          } catch {}
          if (res.ok && data?.ok !== false) {
            result = { ok: true, status: res.status, data }
          } else {
            lastError = (data?.error || data?.directResponse || `HTTP ${res.status}`).toString()
          }
        } catch (err: any) {
          lastError = err?.name === 'AbortError' ? 'Tempo esgotado' : err?.message || 'Erro'
        } finally {
          clearTimeout(timer)
        }
        console.log('[WhatsAppNotificationCard] sendReply result', JSON.stringify(result))
        if (gen !== interactionGenRef.current) return
        if (!result) {
          // Só é "envio em andamento" quando o comando pode ainda estar rodando
          // no worker: (a) o fetch do painel foi abortado aos 60s (AbortError) e
          // o worker pode ter continuado o envio; (b) o host abortou a chamada
          // IPC aos 30s ("Extension execution timeout") e o worker segue
          // processando. Nesses casos não mostramos "Tempo esgotado. Tente
          // novamente" para um envio que pode concluir.
          // Um erro RÁPIDO do worker ({ok:false, error}) é falha real — mesmo
          // que a mensagem contenha "timeout" (ex.: "demorou demais (timeout de
          // rede)") — e mostra o erro de verdade, não a mensagem de "em
          // andamento".
          const inFlight =
            lastError === 'Tempo esgotado' ||
            /extension execution timeout/i.test(lastError)
          if (inFlight) {
            console.warn(
              '[WhatsAppNotificationCard] sendReply in-flight (timeout); keeping overlay open:',
              lastError
            )
            setSendError(
              'O envio continua em andamento em segundo plano. Aguarde um instante ou tente de novo.'
            )
            setSending(false)
            setMinimized(false)
            return
          }
          console.error('[WhatsAppNotificationCard] sendReply failed:', lastError)
          setSendError(`Não foi possível enviar: ${lastError}. Tente novamente.`)
          setSending(false)
          setMinimized(false)
          return
        }
        onClose()
      } catch (err: any) {
        if (gen !== interactionGenRef.current) return
        console.error('[WhatsAppNotificationCard] sendReply error:', err?.name, err?.message)
        setSendError(
          err?.name === 'AbortError'
            ? 'O envio continua em andamento em segundo plano.'
            : err?.message || 'Erro ao enviar a mensagem.'
        )
        setSending(false)
        setMinimized(false)
      }
    },
    [activeRecipient.jid, onClose]
  )

  const handleQuickReply = useCallback(
    async (label: string) => {
      if (sending) return
      const gen = beginUserSend()
      setSending(true)
      // Esconde o card imediatamente no clique (sem destruir a janela): a
      // expansão via LLM e o envio seguem em background, e o sendReply fecha de
      // verdade ao terminar. Destruir a janela agora cancelaria o fetch pendente.
      setCustomText('')
      setMinimized(true)
      try {
        const messageToSend = await expandQuickReply(label)
        await sendReply(messageToSend, gen)
      } catch (err) {
        console.error('[WhatsAppNotificationCard] handleQuickReply error:', err)
        if (gen === interactionGenRef.current) {
          setSending(false)
          setMinimized(false)
          setSendError('Não foi possível preparar a resposta. Tente novamente.')
        }
      }
    },
    [beginUserSend, expandQuickReply, sendReply, sending]
  )

  useEffect(() => {
    if (!activeRecipient.jid) return

    const controller = new AbortController()
    abortRef.current = controller
    const voiceGen = interactionGenRef.current
    let cancelled = false

    setVoiceStatus('listening')
    ;(async () => {
      try {
        const result = await sdk.api.post('/voice/whatsapp/reply/wait', {
          contact_jid: activeRecipient.jid
        })

        if (cancelled || voiceGen !== interactionGenRef.current || !result.ok) {
          if (!cancelled && voiceGen === interactionGenRef.current) {
            setVoiceStatus('error')
          }
          return
        }

        if (result.data?.text?.trim()) {
          setVoiceStatus('complete')
          await sendReply(result.data.text.trim(), voiceGen)
        } else if (result.data?.status === 'timeout') {
          setVoiceStatus('timeout')
        } else {
          setVoiceStatus('idle')
        }
      } catch {
        if (!cancelled) {
          setVoiceStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeRecipient.jid, sendReply])

  if (!data) return null

  if (data?.qr || data?.status === 'disconnected') {
    // Overlay do QR removido (bugava muito). Mostra só um aviso discreto —
    // a reconexão é feita pela página da extensão.
    return (
      <div className="w-[320px] max-w-[calc(100vw-32px)] mx-4 my-4 rounded-xl card border-border/60 overflow-hidden shadow-xl bg-bg/95 backdrop-blur-xl">
        <div className="flex items-start gap-3 p-4">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <span className="text-accent text-sm">!</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text">WhatsApp desconectado</p>
            <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
              Abra a página da extensão do WhatsApp para reconectar. As mensagens recebidas
              continuam chegando quando a conexão voltar.
            </p>
          </div>
          <button
            type="button"
            onClick={data?.onClose || (() => {})}
            className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors shrink-0"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            aria-label="Fechar"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  const voiceLabel = VOICE_LABELS[voiceStatus]

  const contactName = activeRecipient.name || senderName || contact || 'Contato'
  const fallbackQuickReplies = [
    `Olá, ${contactName}!`,
    'Como posso te ajudar hoje?'
  ]
  const resolvedQuickReplies =
    !activeRecipient.isGroup && activeRecipient.fromGroupJid
      ? [`Olá, ${activeRecipient.name}!`, 'Como posso te ajudar?']
      : Array.isArray(quickReplies) && quickReplies.length > 0
        ? quickReplies
        : message
          ? [`Obrigado pela mensagem, ${contactName}!`, 'Vou verificar e respondo em breve.']
          : fallbackQuickReplies

  const filteredParticipants = participants.filter((p) => {
    if (!participantSearch.trim()) return true
    const q = participantSearch.toLowerCase().trim()
    return p.name.toLowerCase().includes(q) || p.phone.includes(q)
  })

  return (
    <div
      ref={cardRef}
      className={`flex flex-col w-[320px] min-h-[200px] m-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden ${
        minimized ? 'hidden' : ''
      }`}
      style={{ WebkitAppRegion: 'drag', maxHeight: '400px' } as any}
    >
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-3 border-b border-border/40 bg-sidebar/30"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <ContactAvatar
            src={activeRecipient.avatar || (activeRecipient.isGroup ? avatarSrc : null)}
            name={activeRecipient.name}
            id={activeRecipient.jid}
          />
        </div>
        <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          {activeRecipient.isGroup ? (
            <button
              type="button"
              onClick={handleToggleParticipants}
              className="flex items-center gap-2 text-left group/btn focus:outline-none w-full max-w-full cursor-pointer"
              style={{ WebkitAppRegion: 'no-drag' } as any}
              title="Clique para ver os contatos do grupo"
            >
              <p className="text-xs font-semibold text-text truncate group-hover/btn:text-accent transition-colors">
                {activeRecipient.name}
              </p>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-text font-bold shrink-0 flex items-center gap-1 shadow-sm hover:bg-white/20 transition-all">
                👥 Membros
              </span>
            </button>
          ) : activeRecipient.fromGroupJid ? (
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-semibold text-text truncate">
                {activeRecipient.name}
              </p>
              <button
                type="button"
                onClick={handleReturnToGroup}
                className="text-[10px] text-accent hover:underline font-medium shrink-0 cursor-pointer"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                title="Voltar para a conversa em grupo"
              >
                ← Grupo
              </button>
            </div>
          ) : (
            <p className="text-xs font-semibold text-text truncate">
              {activeRecipient.name}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-text-muted font-medium truncate">
              {activeRecipient.isGroup
                ? `${senderName || contact} no WhatsApp`
                : activeRecipient.fromGroupJid
                  ? `Mensagem direta (via ${activeRecipient.fromGroupName})`
                  : 'WhatsApp'}
            </span>
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              stroke="#25D366"
              strokeWidth="1.4"
              aria-hidden
            >
              <path d="M12 2.5C6.753 2.5 2.5 6.753 2.5 12c0 1.7.446 3.296 1.226 4.684L2.5 21.5l4.916-1.29A9.45 9.45 0 0 0 12 21.5c5.247 0 9.5-4.253 9.5-9.5S17.247 2.5 12 2.5z" />
              <path
                d="M16.3 14.66c-.2.56-1.18 1.08-1.64 1.12-.42.04-.96.2-2.78-.52-2.32-.92-3.78-3.28-3.9-3.44-.12-.16-.94-1.24-.94-2.36 0-1.12.58-1.68.8-1.9.2-.22.44-.28.6-.28h.46c.14 0 .34.04.52.48l.92 2.24c.08.2.12.4.02.64-.08.16-.18.36-.3.48-.12.12-.24.26-.1.48.52.88 1.16 1.56 2.06 2.08.22.14.38.08.54-.08.14-.16.66-.76.84-1 .18-.24.36-.2.64-.1.26.1 1.68.8 1.96.94.28.14.48.2.54.32.08.12.08.68-.14 1.28z"
                fill="#25D366"
                stroke="none"
              />
            </svg>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            stop()
            onClose()
          }}
          className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          aria-label="Fechar"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div
        className="flex flex-col flex-1 min-h-0 gap-3 p-4 overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {showParticipants ? (
          <div className="flex flex-col flex-1 min-h-[15rem] max-h-72 gap-2.5">
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/40">
              <button
                type="button"
                onClick={() => setShowParticipants(false)}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors p-1 rounded-md hover:bg-white/5 cursor-pointer"
              >
                <ArrowLeftIcon className="w-3.5 h-3.5" />
                <span>Voltar à conversa</span>
              </button>
              <span className="text-[11px] font-medium text-text-muted">
                {participants.length > 0 ? `${participants.length} membros` : 'Membros'}
              </span>
            </div>

            <div className="relative flex items-center px-2.5 py-1.5 rounded-lg bg-input border border-border focus-within:border-accent/40 transition-colors">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-muted shrink-0 mr-1.5" />
              <input
                type="text"
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                placeholder="Buscar membro do grupo..."
                className="flex-1 min-w-0 bg-transparent text-xs text-text placeholder:text-text-muted/50 focus:outline-none"
              />
              {participantSearch && (
                <button
                  type="button"
                  onClick={() => setParticipantSearch('')}
                  className="text-text-muted hover:text-text text-xs p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar space-y-1 pr-0.5">
              {loadingParticipants ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                  <span className="text-xs text-text-muted">Carregando participantes...</span>
                </div>
              ) : participantsError ? (
                <div className="flex flex-col items-center justify-center py-6 px-3 text-center">
                  <p className="text-xs text-text-muted mb-2">{participantsError}</p>
                  <button
                    type="button"
                    onClick={handleToggleParticipants}
                    className="text-xs text-accent hover:underline font-medium cursor-pointer"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : filteredParticipants.length === 0 ? (
                <div className="py-6 text-center text-xs text-text-muted">
                  Nenhum membro encontrado
                </div>
              ) : (
                filteredParticipants.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectParticipant(p)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-border/40 transition-all text-left group/item cursor-pointer"
                  >
                    <ContactAvatar src={p.avatar} name={p.name} id={p.id} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-text truncate group-hover/item:text-accent transition-colors">
                          {p.name}
                        </p>
                        {p.admin && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-accent/20 text-accent font-semibold shrink-0">
                            {p.admin}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-text-muted truncate">+{p.phone}</p>
                    </div>
                    <span className="text-[10px] text-text-muted/60 group-hover/item:text-accent font-medium shrink-0 flex items-center gap-1">
                      Enviar
                      <PaperAirplaneIcon className="w-3 h-3" />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {activeRecipient.jid === contactJid && conversationHistory.length > 0 ? (
              <div
                ref={historyScrollRef}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar rounded-lg bg-black/20 scroll-pt-3 scroll-pb-3"
              >
                <div className="px-3 py-2 space-y-3 select-text">
                  {conversationHistory.map((line, i) => (
                    <div
                      key={`${line.timestamp}-${i}`}
                      className={
                        line.direction === 'outgoing' ? 'pl-3 border-l-2 border-accent/40' : 'pl-0.5'
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium select-text ${
                            line.direction === 'outgoing' ? 'text-accent' : 'text-text-muted'
                          }`}
                        >
                          {line.direction === 'outgoing' ? 'Você' : line.from || contact}
                        </span>
                        <span className="text-[10px] text-text-muted ml-auto shrink-0 select-none">
                          {formatHistoryTime(line.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-text/80 mt-0.5 whitespace-pre-wrap break-words select-text">
                        {line.text}
                      </p>
                      {line.audio && (
                        <div className="mt-1.5 mb-1 max-w-[280px]">
                          <audio
                            src={`${API_URL}/extensions/whatsapp/storage/audio/${line.audio}`}
                            controls
                            className="w-full h-8 accent-accent"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : activeRecipient.jid === contactJid && message ? (
              <div className="min-h-[5.5rem] rounded-lg bg-black/20 p-3 select-text flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-muted select-text">
                    {senderName || contact}
                  </span>
                  {data?.timestamp && (
                    <span className="text-[10px] text-text-muted ml-auto shrink-0 select-none">
                      {formatHistoryTime(data.timestamp)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-text/80 mt-1 whitespace-pre-wrap break-words select-text">
                  {message}
                </p>
              </div>
            ) : (
              <div className="min-h-[5.5rem] rounded-lg bg-black/20 p-3 flex items-center justify-center select-none border border-white/[0.02]">
                <p className="text-xs text-text-muted/40 font-normal">
                  {activeRecipient.fromGroupJid && !activeRecipient.isGroup
                    ? `Inicie uma conversa direta com ${activeRecipient.name}`
                    : 'Nenhuma mensagem recente'}
                </p>
              </div>
            )}

            {data?.audio && activeRecipient.jid === contactJid && (
              <div className="mt-1.5 mb-2 max-w-[280px] shrink-0">
                <audio
                  src={`${API_URL}/extensions/whatsapp/storage/audio/${data.audio}`}
                  controls
                  className="w-full h-8 accent-accent"
                />
              </div>
            )}

            {sendError && (
              <div className="shrink-0 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <span className="text-[11px] text-red-400 leading-snug flex-1 select-text">
                  {sendError}
                </span>
                <button
                  type="button"
                  onClick={() => setSendError('')}
                  className="text-red-400/70 hover:text-red-300 text-xs shrink-0 cursor-pointer"
                  aria-label="Fechar erro"
                >
                  ✕
                </button>
              </div>
            )}

            {isAdminsOnly && activeRecipient.isGroup ? (
              <div className="flex items-center justify-center py-2 px-3 rounded-lg bg-black/10 border border-white/5">
                <p className="text-[11px] text-text-muted">
                  Somente <span className="text-accent font-bold">admins</span> podem enviar
                  mensagens
                </p>
              </div>
            ) : (
              <div
                className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg bg-input border border-border focus-within:border-accent/40 transition-colors ${
                  sending ? 'cursor-default' : 'cursor-text'
                }`}
                onMouseDown={(e) => {
                  if (sending) return
                  const target = e.target as HTMLElement
                  if (target.closest('button') || target.tagName === 'INPUT') return
                  e.preventDefault()
                  inputRef.current?.focus()
                }}
              >
                <MicrophoneIcon
                  className={`w-4 h-4 shrink-0 pointer-events-none ${
                    voiceStatus === 'listening'
                      ? 'text-accent animate-pulse'
                      : voiceStatus === 'detected' || voiceStatus === 'complete'
                        ? 'text-accent'
                        : 'text-text-muted'
                  }`}
                  title={voiceLabel}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={customText}
                  onChange={(e) => {
                    setCustomText(e.target.value)
                    if (sendError) setSendError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customText.trim() && !sending) {
                      e.preventDefault()
                      const gen = beginUserSend()
                      sendReply(customText.trim(), gen)
                    }
                  }}
                  readOnly={sending}
                  placeholder={
                    !activeRecipient.isGroup && activeRecipient.fromGroupJid
                      ? `Mensagem para ${activeRecipient.name}...`
                      : 'Digite uma mensagem...'
                  }
                  className={`flex-1 min-w-0 bg-transparent text-xs text-text placeholder:text-text-muted/50 focus:outline-none ${
                    sending ? 'opacity-50 cursor-default' : 'cursor-text'
                  }`}
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    if (customText.trim() && !sending) {
                      const gen = beginUserSend()
                      sendReply(customText.trim(), gen)
                    }
                  }}
                  disabled={!customText.trim() || sending}
                  className={`p-1 rounded-md text-text-muted hover:text-text transition-colors disabled:opacity-40 shrink-0 ${
                    !customText.trim() || sending ? 'cursor-default' : 'cursor-pointer'
                  }`}
                  aria-label="Enviar"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {resolvedQuickReplies.length > 0 && (!isAdminsOnly || !activeRecipient.isGroup) && (
              <div className="flex shrink-0 flex-col gap-2 pt-0.5 pb-0.5">
                {resolvedQuickReplies.slice(0, 2).map((reply: string, i: number) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleQuickReply(reply)}
                    disabled={sending}
                    className={`w-full text-left px-3 py-2 text-xs font-medium rounded-lg border border-border bg-white/[0.03] text-text hover:text-text hover:bg-white/5 transition-all disabled:opacity-40 truncate ${
                      sending ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function WhatsAppReconnectCard({ data }: { data: any }) {
  const onClose = data?.onClose || (() => {})
  const qr = data?.qr
  const status = data?.status || 'disconnected'
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'connected') {
      onClose()
    }
  }, [status, onClose])

  const [qrCodeString, setQrCodeString] = useState<string | null>(qr || null)

  // O host não reenvia dados novos ao overlay após abrir, então o card escuta
  // os eventos da própria extensão e fecha sozinho quando a conexão volta, ou atualiza o QR.
  useExtensionEvents({
    onEvent: useCallback(
      (event) => {
        const status =
          event.eventType === 'connection_status' || event.eventType === 'authenticated'
            ? event.data?.status
            : null
        if (status === 'connected') onClose()
        if (event.eventType === 'qr_code' && event.data?.qr) {
          setQrCodeString(event.data.qr)
        }
      },
      [onClose]
    )
  })

  useEffect(() => {
    const targetQr = qrCodeString || qr
    if (targetQr) {
      QRCode.toDataURL(targetQr, { width: 220, margin: 1 })
        .then((url) => setQrUrl(url))
        .catch((err) => {
          console.error('Failed to generate QR code data URL:', err)
          setError('Falha ao processar o código QR.')
        })
    }
  }, [qrCodeString, qr])

  const handleReconnect = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await sdk.api.post('/extensions/whatsapp/restart', { force: true })
      if (!result.ok) {
        throw new Error(result.error || `HTTP error`)
      }
    } catch (err: any) {
      console.error('Failed to reconnect/restart WhatsApp:', err)
      setError('Falha ao solicitar novo código. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex flex-col w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden px-5 py-4 select-none"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-1.5 rounded-lg shadow-[0_0_10px_rgba(16,185,129,0.1)]">
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="#10B981"
              strokeWidth="2"
            >
              <path d="M12 2.5C6.753 2.5 2.5 6.753 2.5 12c0 1.7.446 3.296 1.226 4.684L2.5 21.5l4.916-1.29A9.45 9.45 0 0 0 12 21.5c5.247 0 9.5-4.253 9.5-9.5S17.247 2.5 12 2.5z" />
              <path
                d="M16.3 14.66c-.2.56-1.18 1.08-1.64 1.12-.42.04-.96.2-2.78-.52-2.32-.92-3.78-3.28-3.9-3.44-.12-.16-.94-1.24-.94-2.36 0-1.12.58-1.68.8-1.9.2-.22.44-.28.6-.28h.46c.14 0 .34.04.52.48l.92 2.24c.08.2.12.4.02.64-.08.16-.18.36-.3.48-.12.12-.24.26-.1.48.52.88 1.16 1.56 2.06 2.08.22.14.38.08.54-.08.14-.16.66-.76.84-1 .18-.24.36-.2.64-.1.26.1 1.68.8 1.96.94.28.14.48.2.54.32.08.12.08.68-.14 1.28z"
                fill="#10B981"
                stroke="none"
              />
            </svg>
          </div>
          <span className="text-xs font-bold text-text">WhatsApp Desconectado</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-text/10 text-text-muted hover:text-text transition-colors shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          aria-label="Fechar"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center text-center">
        <p className="text-[11px] text-text-muted mb-3 max-w-[280px]">
          Escaneie o código QR abaixo com o WhatsApp no seu celular para reconectar.
        </p>

        <div
          className="relative w-44 h-44 flex items-center justify-center bg-white rounded-xl p-2.5 border border-border/10 shadow-inner"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {qrUrl ? (
            <img src={qrUrl} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-7 h-7 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              <span className="text-[10px] text-zinc-500 font-medium">Aguardando código...</span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-[10px] text-red-400 mt-2 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg max-w-[260px]">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleReconnect}
          disabled={loading}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="mt-3 w-full max-w-[200px] py-2 px-4 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 border border-emerald-500/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? 'Solicitando...' : 'Gerar Novo QR Code'}
        </button>
      </div>
    </div>
  )
}

sdk.registry.registerRenderer('whatsapp-panel', WhatsAppNotificationCard)
sdk.registry.registerRenderer('whatsapp-reconnect', WhatsAppReconnectCard)
