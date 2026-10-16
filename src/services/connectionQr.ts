/**
 * Contract between the WhatsApp worker tool `show_connection_qr` and the chat
 * card it renders. The worker builds this payload in `worker-utils.ts`
 * (`buildConnectionQrCardResult`) and a test keeps both literals identical, so
 * renaming the type here can never leave the chat showing an unsupported card.
 */
export const CONNECTION_QR_CARD_TYPE = 'whatsapp-connection-qr'

/**
 * Fallback validity used when a QR surfaces without its expiry (a stale
 * history render, for example). The worker's real TTL travels with every
 * `qr_code` event and structured response, so this only bridges the gap.
 */
export const DEFAULT_CONNECTION_QR_TTL_SECONDS = 60

/** State the worker sends with the card; the card adds its own local states. */
export type ConnectionQrCardState = 'ready' | 'pending'

export interface ConnectionQrCardData {
  state: ConnectionQrCardState
  /** Raw QR payload emitted by Baileys (only when `state === 'ready'`). */
  qr?: string
  /** Seconds the QR stays valid, counted from `generatedAt`. */
  expiresIn?: number
  /** Epoch ms when the QR was issued — keeps stale history renders honest. */
  generatedAt?: number
}

/**
 * Absolute deadline of the QR shown by the card. Returns `null` when the
 * payload carries no usable QR so the card can fall back to "expired".
 */
export function resolveQrDeadline(data?: Partial<ConnectionQrCardData> | null): number | null {
  const expiresIn = Number(data?.expiresIn)
  if (!data?.qr || !Number.isFinite(expiresIn) || expiresIn <= 0) return null
  const generatedAt = Number(data?.generatedAt)
  return (Number.isFinite(generatedAt) && generatedAt > 0 ? generatedAt : Date.now()) + expiresIn * 1000
}
