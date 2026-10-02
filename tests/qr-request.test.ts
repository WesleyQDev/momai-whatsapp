import { describe, it, expect } from 'vitest'
import { resolveQrRequestOutcome, fetchQrOutcome } from '../src/services/qrRequest'

describe('qr request outcome is never silent', () => {
  it('resolves a response carrying a qr string as ready', () => {
    const outcome = resolveQrRequestOutcome({ data: { ok: true, qr: 'qr-payload' } })
    expect(outcome).toEqual({ status: 'ready', qr: 'qr-payload' })
  })

  it('resolves a pending worker response as pending', () => {
    expect(resolveQrRequestOutcome({ data: { ok: true, pending: true } })).toEqual({
      status: 'pending'
    })
  })

  it('resolves an already-connected response as connected', () => {
    expect(resolveQrRequestOutcome({ data: { ok: true, connected: true } })).toEqual({
      status: 'connected'
    })
  })

  it('resolves a worker-reported failure as a visible error', () => {
    const outcome = resolveQrRequestOutcome({
      data: { ok: false, error: 'Worker exited before ready' }
    })
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') {
      expect(outcome.messageKey).toBe('page.reconnect_failed')
      expect(outcome.detail).toBe('Worker exited before ready')
    }
  })

  it('resolves a dropped request (null response) as a visible error', () => {
    const outcome = resolveQrRequestOutcome(null)
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') {
      expect(outcome.messageKey).toBe('page.reconnect_failed')
    }
  })

  it('resolves a transport failure as a visible error', () => {
    const failure = new Error('network unreachable')
    const outcome = resolveQrRequestOutcome(null, failure)
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') {
      expect(outcome.messageKey).toBe('page.reconnect_failed')
      expect(outcome.detail).toBe('network unreachable')
    }
  })
})

describe('sdk envelope failures carry the real cause', () => {
  it('resolves an envelope-level failure as a visible error with detail', () => {
    const outcome = resolveQrRequestOutcome({ ok: false, error: 'HTTP 500' })
    expect(outcome).toEqual({
      status: 'error',
      messageKey: 'page.reconnect_failed',
      detail: 'HTTP 500'
    })
  })

  it('unwraps a successful envelope around a pending worker result', () => {
    const outcome = resolveQrRequestOutcome({ ok: true, data: { ok: true, pending: true } })
    expect(outcome).toEqual({ status: 'pending' })
  })

  it('unwraps a successful envelope around a qr worker result', () => {
    const outcome = resolveQrRequestOutcome({ ok: true, data: { ok: true, qr: 'qr-payload' } })
    expect(outcome).toEqual({ status: 'ready', qr: 'qr-payload' })
  })
})

describe('qr command fetch surfaces failures', () => {
  it('returns ready when the worker responds with a qr', async () => {
    const outcome = await fetchQrOutcome(async () => ({ data: { ok: true, qr: 'qr-payload' } }), true)
    expect(outcome).toEqual({ status: 'ready', qr: 'qr-payload' })
  })

  it('returns an error when the transport rejects', async () => {
    const outcome = await fetchQrOutcome(async () => {
      throw new Error('timeout')
    }, true)
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') {
      expect(outcome.messageKey).toBe('page.reconnect_failed')
      expect(outcome.detail).toBe('timeout')
    }
  })

  it('returns an error when the worker reports failure', async () => {
    const outcome = await fetchQrOutcome(async () => ({ data: { ok: false, error: 'boom' } }), false)
    expect(outcome).toEqual({ status: 'error', messageKey: 'page.reconnect_failed', detail: 'boom' })
  })
})
