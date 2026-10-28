// Resolução do cabeçalho do bloco de citação (quote) dentro dos balões,
// no padrão do WhatsApp Web: em cima o nome de quem enviou a mensagem
// citada ("Você" quando é sua), abaixo o texto citado.

/** Rosa do nome "Você" no balão de saída, como no WhatsApp Web. */
export const WHATSAPP_QUOTE_SELF_COLOR_OUTGOING = '#ff5b8f'
/** Rosa do nome "Você" no balão de entrada, como no WhatsApp Web. */
export const WHATSAPP_QUOTE_SELF_COLOR_INCOMING = '#ff5b8f'

export type QuotedMessageInfo = {
  id?: string | null
  from?: string | null
  senderJid?: string | null
  timestamp?: number | null
  text?: string | null
  image?: string | boolean | null
  video?: string | boolean | null
  audio?: string | boolean | null
  sticker?: string | boolean | null
  document?: string | boolean | null
  documentName?: string | null
  gif?: string | boolean | null
  isGif?: boolean | null
}

export type QuoteLineRef = {
  direction: 'incoming' | 'outgoing'
  from?: string | null
}

export type ResolveQuoteSenderOptions = {
  /** Rótulo traduzido de "Você" (page.you_label). */
  youLabel?: string | null
  /** Nome do contato da conversa (usado como último recurso em 1:1). */
  contactName?: string | null
  /** Localiza a mensagem citada pelo id (stanzaId) no histórico local. */
  findLine?: (id: string) => QuoteLineRef | undefined
  /** Retorna true quando o jid é o do próprio usuário. */
  isOwnJid?: (jid: string) => boolean
}

export type ResolvedQuoteSender = {
  name: string
  isFromMe: boolean
}

const stripTrailingColon = (value: string): string => value.replace(/:\s*$/, '')

/**
 * Resolve o nome exibido no topo do bloco de citação, como no WhatsApp Web.
 *
 * Ordem de resolução:
 * 1. `quoted.from` quando é "Você" (citação própria já identificada);
 * 2. `quoted.senderJid` comparado via `isOwnJid`;
 * 3. busca da mensagem citada no histórico pelo `id` (stanzaId): a direção da
 *    mensagem original é a fonte confiável de autoria — `outgoing` => "Você".
 *    Isso cobre citações sem `participant` e entradas antigas onde o `from`
 *    da própria mensagem foi gravado com o nome do contato;
 * 4. `quoted.from` quando presente;
 * 5. `contactName` como último recurso (string vazia quando desconhecido).
 */
export function resolveQuoteSenderName(
  quoted: QuotedMessageInfo | null | undefined,
  opts: ResolveQuoteSenderOptions = {}
): ResolvedQuoteSender {
  const fallbackContact = typeof opts.contactName === 'string' ? opts.contactName.trim() : ''
  const rawYou = typeof opts.youLabel === 'string' ? opts.youLabel.trim() : ''
  // Algumas etiquetas localizadas vêm com dois-pontos ("Você:"); no balão o
  // padrão WhatsApp Web é sem. A comparação ignora o sufixo nas duas pontas
  // para casar entradas antigas gravadas com ou sem os dois-pontos.
  const youLabel = stripTrailingColon(rawYou) || 'Você'

  const from = typeof quoted?.from === 'string' ? quoted.from.trim() : ''
  const fromBare = stripTrailingColon(from)
  if (fromBare === youLabel || fromBare === 'Você') return { name: youLabel, isFromMe: true }

  const senderJid = typeof quoted?.senderJid === 'string' ? quoted.senderJid.trim() : ''
  if (senderJid && typeof opts.isOwnJid === 'function') {
    try {
      if (opts.isOwnJid(senderJid)) return { name: youLabel, isFromMe: true }
    } catch {
      // ignora e segue para as próximas estratégias
    }
  }

  const quotedId =
    typeof quoted?.id === 'string'
      ? quoted.id.trim()
      : quoted?.id !== undefined && quoted?.id !== null
        ? String(quoted.id).trim()
        : ''
  if (quotedId && typeof opts.findLine === 'function') {
    const line = opts.findLine(quotedId)
    if (line) {
      if (line.direction === 'outgoing') return { name: youLabel, isFromMe: true }
      const lineFrom = typeof line.from === 'string' ? line.from.trim() : ''
      return { name: lineFrom || from || fallbackContact, isFromMe: false }
    }
  }

  if (from) return { name: from, isFromMe: false }
  return { name: fallbackContact, isFromMe: false }
}
