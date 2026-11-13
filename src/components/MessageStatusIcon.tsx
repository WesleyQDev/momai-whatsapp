import React from 'react'

export interface MessageStatusIconProps {
  status?: number | string
  className?: string
  colorClass?: string
}

/**
 * Renders the WhatsApp message delivery status icon matching WhatsApp Web behavior:
 * - Status 1 / 'pending': Clock icon (enviando)
 * - Status 2 / 'sent' (SERVER_ACK): Single check cinza (enviada ao servidor, mas não entregue ao destinatário)
 * - Status 3 / 'delivered' (DELIVERY_ACK): Double check cinza (entregue no aparelho do destinatário)
 * - Status 4 / 'read' or 5 / 'played': Double check azul #53bdeb (lida pelo destinatário)
 * - Default outgoing (when not delivered yet): Single check cinza
 */
export function MessageStatusIcon({
  status,
  className = '',
  colorClass = 'opacity-90'
}: MessageStatusIconProps) {
  const num = typeof status === 'number' ? status : Number(status)
  const isPending = num === 1 || status === 'pending'
  const isDelivered = num === 3 || status === 'delivered'
  const isRead = num === 4 || num === 5 || status === 'read' || status === 'played'

  if (isPending) {
    return (
      <span className={`shrink-0 inline-flex items-center ${className}`} title="Enviando">
        <svg
          className="w-3 h-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-label="Enviando"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
    )
  }

  if (isRead) {
    return (
      <span
        className={`shrink-0 inline-flex items-center text-[#53bdeb] opacity-100 ${className}`}
        style={{ color: '#53bdeb', opacity: 1 }}
        data-status="read"
        title="Lida"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#53bdeb"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-label="Lida"
        >
          <polyline points="18 6 9 15 4 10" />
          <polyline points="22 10 13 19 11 17" />
        </svg>
      </span>
    )
  }

  if (isDelivered) {
    return (
      <span
        className={`shrink-0 inline-flex items-center ${colorClass} ${className}`}
        title="Entregue"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-label="Entregue"
        >
          <polyline points="18 6 9 15 4 10" />
          <polyline points="22 10 13 19 11 17" />
        </svg>
      </span>
    )
  }

  // Sent to server (SERVER_ACK = 2) or default outgoing: single check (✓) cinza
  return (
    <span
      className={`shrink-0 inline-flex items-center ${colorClass} ${className}`}
      title="Enviada"
    >
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="Enviada"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}

export default MessageStatusIcon

