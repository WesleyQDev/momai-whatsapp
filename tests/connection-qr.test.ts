import { describe, expect, it } from 'vitest'
import {
  CONNECTION_QR_CARD_TYPE,
  DEFAULT_CONNECTION_QR_TTL_SECONDS,
  resolveQrDeadline
} from '../src/services/connectionQr'
import utils from '../worker-utils'

const {
  buildConnectionQrCardResult,
  CONNECTION_QR_CARD_TYPE: WORKER_CARD_TYPE
} = utils as any

describe('show_connection_qr card contract', () => {
  it('keeps the worker card type in sync with the chat card module', () => {
    // The worker ships the structured-response type as a literal; the chat
    // card registers the renderer under the shared constant. Drift here would
    // render "unsupported response" instead of the QR.
    expect(WORKER_CARD_TYPE).toBe(CONNECTION_QR_CARD_TYPE)
  })

  it('returns a ready card carrying the QR and its expiry', () => {
    const now = 1_700_000_000_000
    const result = buildConnectionQrCardResult({ qr: '2@abc', expiresIn: 42.4, now })

    expect(result.ok).toBe(true)
    expect(result.pending).toBeUndefined()
    expect(result.structuredResponse).toEqual({
      type: CONNECTION_QR_CARD_TYPE,
      data: { state: 'ready', qr: '2@abc', expiresIn: 43, generatedAt: now }
    })
    expect(result.instruction).toMatch(/card is displayed in the chat/i)
  })

  it('falls back to a pending card while the QR is still being generated', () => {
    const result = buildConnectionQrCardResult({ qr: null, expiresIn: 0, now: 1234 })

    expect(result.ok).toBe(true)
    expect(result.pending).toBe(true)
    expect(result.structuredResponse).toEqual({
      type: CONNECTION_QR_CARD_TYPE,
      data: { state: 'pending', generatedAt: 1234 }
    })
  })

  it('treats a QR without a positive expiry as pending', () => {
    const result = buildConnectionQrCardResult({ qr: '2@abc', expiresIn: 0, now: 1 })
    expect(result.pending).toBe(true)
    expect(result.structuredResponse.data.state).toBe('pending')
  })

  it('answers "already connected" without a card', () => {
    const result = buildConnectionQrCardResult({ connected: true })

    expect(result.ok).toBe(true)
    expect(result.connected).toBe(true)
    expect(result.structuredResponse).toBeUndefined()
    expect(result.instruction).toMatch(/already connected/i)
  })
})

describe('resolveQrDeadline', () => {
  it('derives the deadline from generatedAt plus expiresIn', () => {
    expect(resolveQrDeadline({ qr: 'x', expiresIn: 30, generatedAt: 1000 })).toBe(31000)
  })

  it('falls back to "now" when generatedAt is missing', () => {
    const before = Date.now()
    const deadline = resolveQrDeadline({ qr: 'x', expiresIn: 2 })
    expect(deadline).toBeGreaterThanOrEqual(before + 2000)
    expect(deadline).toBeLessThanOrEqual(Date.now() + 2000)
  })

  it('returns null without a QR or without a usable expiry', () => {
    expect(resolveQrDeadline({ expiresIn: 30, generatedAt: 1 })).toBeNull()
    expect(resolveQrDeadline({ qr: 'x', expiresIn: 0, generatedAt: 1 })).toBeNull()
    expect(resolveQrDeadline({ qr: 'x', expiresIn: Number.NaN, generatedAt: 1 })).toBeNull()
    expect(resolveQrDeadline(null)).toBeNull()
  })

  it('exposes a fallback TTL shorter than a typical pairing scan', () => {
    expect(DEFAULT_CONNECTION_QR_TTL_SECONDS).toBeGreaterThan(0)
    expect(DEFAULT_CONNECTION_QR_TTL_SECONDS).toBeLessThanOrEqual(60)
  })
})
