export type QrRequestOutcome =
  | { status: 'ready'; qr: string }
  | { status: 'pending' }
  | { status: 'connected' }
  | { status: 'error'; messageKey: string; detail?: string }

export interface QrCommandData {
  qr?: unknown
  connected?: unknown
  pending?: unknown
  ok?: unknown
  error?: unknown
}

export interface QrCommandResponse {
  ok?: unknown
  error?: unknown
  data?: QrCommandData | null
}

function toDetail(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value instanceof Error && value.message) return value.message
  return undefined
}

/**
 * Maps a request_qr command round-trip to a UI outcome. Every branch returns
 * an explicit state so a failed pairing can never resolve to silence.
 */
export function resolveQrRequestOutcome(
  response: QrCommandResponse | null | undefined,
  requestError?: unknown
): QrRequestOutcome {
  if (requestError) {
    return { status: 'error', messageKey: 'page.reconnect_failed', detail: toDetail(requestError) }
  }
  const data = response?.data
  if (data && typeof data.qr === 'string' && data.qr.trim()) {
    return { status: 'ready', qr: data.qr }
  }
  if (data && data.connected === true) {
    return { status: 'connected' }
  }
  if (data && data.pending === true) {
    return { status: 'pending' }
  }
  if (data && data.ok === false) {
    return { status: 'error', messageKey: 'page.reconnect_failed', detail: toDetail(data.error) }
  }
  if (response && response.ok === false) {
    return { status: 'error', messageKey: 'page.reconnect_failed', detail: toDetail(response.error) }
  }
  return { status: 'error', messageKey: 'page.reconnect_failed', detail: toDetail(data) }
}

/**
 * Sends request_qr and maps every result (including transport failures) to an
 * explicit outcome. Never throws and never returns null.
 */
export async function fetchQrOutcome(
  post: (path: string, body: unknown) => Promise<QrCommandResponse>,
  force: boolean
): Promise<QrRequestOutcome> {
  try {
    const response = await post('/extensions/whatsapp/command', {
      toolName: 'request_qr',
      args: { force }
    })
    return resolveQrRequestOutcome(response ?? null)
  } catch (err) {
    return resolveQrRequestOutcome(null, err)
  }
}
