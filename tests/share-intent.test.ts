// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  PENDING_SHARE_KEY,
  SHARE_EVENT,
  clearPendingShare,
  parseShareDetail,
  readPendingShare,
  writePendingShare
} from '../src/services/share-intent'

beforeEach(() => {
  sessionStorage.clear()
})

describe('share-intent contract', () => {
  it('exposes the same storage key and event the Bible extension writes', () => {
    expect(PENDING_SHARE_KEY).toBe('momai_whatsapp_pending_share')
    expect(SHARE_EVENT).toBe('momai_whatsapp_share')
  })

  it('round-trips a pending share through sessionStorage', () => {
    writePendingShare('verse text', 'momai-biblia-sagrada')

    const pending = readPendingShare()
    expect(pending).toMatchObject({
      text: 'verse text',
      source: 'momai-biblia-sagrada'
    })
    expect(typeof pending?.at).toBe('number')
  })

  it('returns null when nothing was shared', () => {
    expect(readPendingShare()).toBeNull()
  })

  it('returns null for a corrupted payload', () => {
    sessionStorage.setItem(PENDING_SHARE_KEY, 'not-json{{{')
    expect(readPendingShare()).toBeNull()

    sessionStorage.setItem(PENDING_SHARE_KEY, JSON.stringify({ text: '   ' }))
    expect(readPendingShare()).toBeNull()
  })

  it('clears the pending share after it is consumed', () => {
    writePendingShare('verse text')
    clearPendingShare()
    expect(readPendingShare()).toBeNull()
    expect(sessionStorage.getItem(PENDING_SHARE_KEY)).toBeNull()
  })

  it('parses live event details and rejects invalid ones', () => {
    expect(
      parseShareDetail({ text: 'verse', source: 'momai-biblia-sagrada', at: 123 })
    ).toEqual({ text: 'verse', source: 'momai-biblia-sagrada', at: 123 })
    expect(parseShareDetail({ text: 'verse' })).toEqual({
      text: 'verse',
      source: undefined,
      at: undefined
    })
    expect(parseShareDetail(null)).toBeNull()
    expect(parseShareDetail({})).toBeNull()
    expect(parseShareDetail({ text: '  ' })).toBeNull()
  })
})
