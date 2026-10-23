import { isLightAppTheme } from '../utils/chatBubble'
import {
  resolveQuoteSenderName,
  WHATSAPP_QUOTE_SELF_COLOR_INCOMING,
  WHATSAPP_QUOTE_SELF_COLOR_OUTGOING,
  type QuotedMessageInfo,
  type QuoteLineRef
} from '../utils/quoteDisplay'

export type QuotedMessageProps = {
  /** Mensagem citada (nunca nula — o chamador condiciona a renderização). */
  quoted: QuotedMessageInfo
  /** Tom do balão que contém a citação. */
  isOutgoing: boolean
  /** Rótulo traduzido de "Você" (sem dois-pontos). */
  youLabel: string
  /** Nome do contato 1:1 (último recurso quando o autor é desconhecido). */
  contactName?: string
  /** Localiza a citada pelo id no histórico (direção = autoria confiável). */
  findLine?: (id: string) => QuoteLineRef | undefined
  /** Rótulo genérico ("Responder") quando o autor é totalmente desconhecido. */
  replyLabel: string
  /** Navega até a mensagem citada (rola o histórico). */
  onOpenQuote?: (timestamp?: number | null) => void
  /** Resolve miniatura da mídia citada. */
  getImageUrl?: (filename: string) => string
}

/**
 * Bloco de citação no padrão do WhatsApp Web, idêntico nos dois overlays
 * (contato e notificação): em cima o nome de quem enviou a citada
 * ("Você" em rosa quando é sua, nome do contato na cor de destaque),
 * abaixo o trecho citado, com miniatura quando há imagem.
 */
export function QuotedMessage({
  quoted,
  isOutgoing,
  youLabel,
  contactName,
  findLine,
  replyLabel,
  onOpenQuote,
  getImageUrl
}: QuotedMessageProps) {
  const { name: quoteName, isFromMe } = resolveQuoteSenderName(quoted, {
    youLabel,
    contactName,
    findLine
  })
  const selfColor = isOutgoing
    ? WHATSAPP_QUOTE_SELF_COLOR_OUTGOING
    : WHATSAPP_QUOTE_SELF_COLOR_INCOMING
  // Barra lateral: vermelha/rosa para citação própria, cor de destaque do tema
  // para os demais — via inline style porque o utilitário `border-l-[3.5px]`
  // não é gerado pelo host e a barra sumia. `rgb(var(--accent))` acompanha o
  // tema atual (claro/escuro/custom).
  const barColor = isFromMe ? selfColor : 'rgb(var(--accent))'
  // Tonalização própria do bloco citado (como no WhatsApp Web): escurece o
  // balão de saída; no de entrada tinge na direção da cor do texto, o que
  // funciona em temas claros e escuros. As classes `bg-black/*` ficam como
  // fallback caso o motor ignore `color-mix`. On the light outgoing green a
  // softer shade keeps the quoted text readable.
  const boxBackground = isOutgoing
    ? isLightAppTheme()
      ? 'rgba(0, 0, 0, 0.08)'
      : 'rgba(0, 0, 0, 0.22)'
    : 'color-mix(in srgb, currentColor 8%, transparent)'
  const snippet =
    quoted.text ||
    quoted.documentName ||
    (quoted.gif || quoted.isGif
      ? '🎞️ GIF'
      : quoted.image
        ? '📷 Foto'
        : quoted.video
          ? '🎥 Vídeo'
          : quoted.audio
            ? '🎙️ Áudio'
            : quoted.sticker
              ? '🏷️ Figurinha'
              : 'Mensagem')

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onOpenQuote?.(quoted.timestamp)
      }}
      className={`rounded-md px-2.5 py-1.5 mb-1.5 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
        isOutgoing ? 'bg-black/25 text-text' : 'bg-black/10 text-text'
      }`}
      style={{
        borderLeft: `4px solid ${barColor}`,
        backgroundColor: boxBackground
      }}
    >
      <div className="flex-1 min-w-0 pr-1">
        <p
          className={`text-[11px] font-bold truncate ${!isFromMe ? 'text-accent' : ''}`}
          style={isFromMe ? { color: selfColor } : {}}
        >
          {quoteName || replyLabel}
        </p>
        <p className="text-[11px] opacity-90 truncate mt-0.5 select-text font-normal">{snippet}</p>
      </div>
      {quoted.image && getImageUrl && (
        <img
          src={getImageUrl(quoted.image)}
          alt="Preview"
          className="w-8 h-8 object-cover rounded shrink-0 border border-border/40"
        />
      )}
    </div>
  )
}
