import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../services/api'
import {
  DEFAULT_CONNECTION_QR_TTL_SECONDS,
  resolveQrDeadline,
  type ConnectionQrCardData
} from '../services/connectionQr'
import { fetchQrOutcome } from '../services/qrRequest'
import { useExtensionEvents } from '../hooks/useExtensionEvents'
import { useI18n } from '../hooks/useI18n'

/**
 * Chat card rendered for the worker's `show_connection_qr` structured response.
 * Shows the pairing QR centered in the conversation, follows live `qr_code`
 * events (so a refreshed code replaces the expired one without a new message)
 * and flips to "connected" as soon as the phone confirms the pairing.
 */
type CardState = 'ready' | 'pending' | 'connected' | 'expired' | 'error'

/** Without a QR after this long the card stops pretending and offers a retry. */
const PENDING_STUCK_MS = 30000

/**
 * How long a card keeps following live pairing events (`qr_code`, connection
 * updates). Chat history keeps the card forever, but an old card must stay a
 * quiet snapshot instead of reviving itself — and every other old card — the
 * next time a QR is emitted.
 */
const LIVE_WINDOW_MS = 10 * 60 * 1000

function isLivePayload(data?: Partial<ConnectionQrCardData> | null): boolean {
  const generatedAt = Number(data?.generatedAt)
  // Payloads without a timestamp are treated as live: only the host's own
  // history could carry them, and an extra refresh on a stale card is cheap.
  if (!Number.isFinite(generatedAt) || generatedAt <= 0) return true
  return Date.now() - generatedAt < LIVE_WINDOW_MS
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.5C6.753 2.5 2.5 6.753 2.5 12c0 1.7.446 3.296 1.226 4.684L2.5 21.5l4.916-1.29A9.45 9.45 0 0 0 12 21.5c5.247 0 9.5-4.253 9.5-9.5S17.247 2.5 12 2.5z" />
      <path d="M16.3 14.66c-.2.56-1.18 1.08-1.64 1.12-.42.04-.96.2-2.78-.52-2.32-.92-3.78-3.28-3.9-3.44-.12-.16-.94-1.24-.94-2.36 0-1.12.58-1.68.8-1.9.2-.22.44-.28.6-.28h.46c.14 0 .34.04.52.48l.92 2.24c.08.2.12.4.02.64-.08.16-.18.36-.3.48-.12.12-.24.26-.1.48.52.88 1.16 1.56 2.06 2.08.22.14.38.08.54-.08.14-.16.66-.76.84-1 .18-.24.36-.2.64-.1.26.1 1.68.8 1.96.94.28.14.48.2.54.32.08.12.08.68-.14 1.28z" />
    </svg>
  )
}

function ConnectedGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  )
}

function initialState(data?: Partial<ConnectionQrCardData> | null): CardState {
  if (!data) return 'pending'
  if (data.qr) {
    const deadline = resolveQrDeadline(data)
    return deadline && deadline > Date.now() ? 'ready' : 'expired'
  }
  // A pending card only makes sense while its pairing window is open; a
  // history render of a stale payload would just spin until the stuck timer.
  return isLivePayload(data) ? 'pending' : 'expired'
}

export default function ConnectionQrCard({ data }: { data?: Partial<ConnectionQrCardData> }) {
  const { t } = useI18n()
  const [state, setState] = useState<CardState>(() => initialState(data))
  const [qr, setQr] = useState<string | null>(() =>
    typeof data?.qr === 'string' && data.qr ? data.qr : null
  )
  const [deadline, setDeadline] = useState<number | null>(() => resolveQrDeadline(data))
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [requesting, setRequesting] = useState(false)
  // Live state for event callbacks: a late `qr_code` broadcast must not pull a
  // connected card back to the pairing view.
  const stateRef = useRef<CardState>(state)
  const liveRef = useRef(isLivePayload(data))
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const applyQr = useCallback((qrValue: string, expiresInSeconds: number) => {
    if (!qrValue) return
    const ttl = Number(expiresInSeconds)
    setQr(qrValue)
    setDeadline(
      Date.now() +
        (Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_CONNECTION_QR_TTL_SECONDS) * 1000
    )
    setState('ready')
  }, [])

  const handleEvent = useCallback(
    (event: any) => {
      if (event?.eventType === 'qr_code' && typeof event.data?.qr === 'string' && event.data.qr) {
        // Only a card from the current pairing window follows the live stream;
        // history cards stay snapshots (and never revive each other).
        if (!liveRef.current || stateRef.current === 'connected') return
        applyQr(event.data.qr, Number(event.data.expiresIn))
        return
      }
      if (
        event?.eventType === 'authenticated' ||
        (event?.eventType === 'connection_status' && event.data?.status === 'connected')
      ) {
        setState('connected')
      }
    },
    [applyQr]
  )

  useExtensionEvents({ onEvent: handleEvent })

  // QR scanners require black modules on a solid white background in every
  // app theme, so the tile keeps fixed colors instead of theme tokens (the
  // extension page follows the same rule).
  useEffect(() => {
    if (!qr) {
      setQrUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(qr, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })
      .then((url) => {
        if (!cancelled) setQrUrl(url)
      })
      .catch((err) => {
        console.error(
          '[whatsapp] chat QR render failed:',
          err instanceof Error ? err.message : err
        )
        if (!cancelled) {
          setQrUrl(null)
          setState('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [qr])

  useEffect(() => {
    if (state !== 'ready' || !deadline) return
    const tick = () => {
      const next = Date.now()
      setNow(next)
      if (next >= deadline) setState('expired')
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [state, deadline])

  useEffect(() => {
    if (state !== 'pending') return
    const timer = setTimeout(() => setState('error'), PENDING_STUCK_MS)
    return () => clearTimeout(timer)
  }, [state])

  const requestCode = useCallback(async () => {
    if (requesting) return
    setRequesting(true)
    try {
      const outcome = await fetchQrOutcome(api.post, false)
      if (outcome.status === 'ready') {
        applyQr(outcome.qr, outcome.expiresIn ?? DEFAULT_CONNECTION_QR_TTL_SECONDS)
      } else if (outcome.status === 'pending') {
        setState('pending')
      } else if (outcome.status === 'connected') {
        setState('connected')
      } else {
        setState('error')
      }
    } finally {
      setRequesting(false)
    }
  }, [applyQr, requesting])

  // The worker may have produced the QR after this card was created (or before
  // it mounted): a live pending card asks for it once instead of waiting for a
  // broadcast that already happened.
  useEffect(() => {
    if (liveRef.current && !qr) void requestCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remaining =
    deadline !== null ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null

  return (
    <div className="my-2 w-full max-w-sm mx-auto flex flex-col items-center gap-2">
      {state === 'connected' ? (
        <div className="flex self-stretch flex-col items-center gap-2 rounded-2xl bg-card border border-border px-5 py-5 text-center" role="status">
          <ConnectedGlyph className="w-10 h-10 text-accent" />
          <p className="text-xs font-semibold text-text">
            {t('connectionCard.connected_title')}
          </p>
        </div>
      ) : (
        <>
          <div
            className="rounded-2xl border border-border/40 shadow-inner flex items-center justify-center"
            style={{ backgroundColor: '#ffffff', padding: 12, width: 244, height: 244 }}
          >
            {state === 'ready' && qrUrl ? (
              <img
                src={qrUrl}
                alt={t('connectionCard.qr_alt')}
                width={220}
                height={220}
                draggable={false}
                className="block select-none"
                style={{ backgroundColor: '#ffffff' }}
              />
            ) : state === 'pending' ? (
              <div className="w-7 h-7 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            ) : (
              <WhatsAppGlyph className="w-12 h-12 text-text-muted opacity-50" />
            )}
          </div>

          <div className="min-h-[28px] flex flex-col items-center gap-2">
            {state === 'ready' && remaining !== null && (
              <p
                className={`text-[11px] tabular-nums ${
                  remaining <= 15 ? 'text-error' : 'text-text-muted'
                }`}
              >
                {t('connectionCard.expires_in', { seconds: remaining })}
              </p>
            )}
            {state === 'pending' && (
              <p role="status" className="text-[11px] text-text-muted">
                {t('connectionCard.generating')}
              </p>
            )}
            {state === 'expired' && (
              <p role="status" className="text-[11px] text-error">
                {t('connectionCard.expired')}
              </p>
            )}
            {state === 'error' && (
              <p role="status" className="text-[11px] text-error">
                {t('connectionCard.failed')}
              </p>
            )}

            {(state === 'expired' || state === 'error') && (
              <button
                type="button"
                onClick={requestCode}
                disabled={requesting}
                className="py-2 px-4 text-xs font-semibold rounded-lg bg-accent text-white hover:opacity-90 transition-all duration-200 border border-accent/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                {t('connectionCard.refresh')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
