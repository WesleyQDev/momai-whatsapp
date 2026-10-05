/**
 * Incoming share-intent contract. Other extensions (e.g. momai-biblia-sagrada)
 * store a pending share in sessionStorage and/or dispatch SHARE_EVENT, then
 * ask the host to open this tab. When the user selects a contact or
 * conversation, the page consumes the pending share exactly once and passes
 * it as `initialDraft` to the chat overlay, which pre-fills the composer.
 * The same window/sessionStorage is shared by every extension UI, so no host
 * API is involved.
 */
export const PENDING_SHARE_KEY = 'momai_whatsapp_pending_share'
export const SHARE_EVENT = 'momai_whatsapp_share'

export interface PendingShare {
  text: string
  source?: string
  at?: number
}

function parsePayload(raw: string | null | undefined): PendingShare | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.text !== 'string' || !parsed.text.trim()) return null
    return {
      text: parsed.text,
      source: typeof parsed.source === 'string' ? parsed.source : undefined,
      at: typeof parsed.at === 'number' ? parsed.at : undefined
    }
  } catch {
    return null
  }
}

export function parseShareDetail(detail: unknown): PendingShare | null {
  if (!detail || typeof detail !== 'object') return null
  const { text, source, at } = detail as Record<string, unknown>
  if (typeof text !== 'string' || !text.trim()) return null
  return {
    text,
    source: typeof source === 'string' ? source : undefined,
    at: typeof at === 'number' ? at : undefined
  }
}

export function readPendingShare(): PendingShare | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return parsePayload(sessionStorage.getItem(PENDING_SHARE_KEY))
  } catch {
    return null
  }
}

export function writePendingShare(text: string, source?: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(
      PENDING_SHARE_KEY,
      JSON.stringify({ text, source, at: Date.now() })
    )
  } catch {
    // The live CustomEvent path still delivers the share.
  }
}

export function clearPendingShare(): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(PENDING_SHARE_KEY)
  } catch {
    // Best effort only.
  }
}
