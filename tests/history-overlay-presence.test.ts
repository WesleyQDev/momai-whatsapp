import { describe, it, expect } from 'vitest'
import utils from '../worker-utils'

const {
  HISTORY_OVERLAY_PRESENCE_TTL_MS,
  cleanHistoryOverlayJid,
  noteHistoryOverlayPresence,
  removeHistoryOverlayPresence,
  isHistoryOverlayOpen,
  isHistoryOverlayOpenFor
} = utils as any

const JID = '5511999999999@s.whatsapp.net'

describe('history overlay presence', () => {
  it('uses the short TTL paired with the 5s heartbeat', () => {
    expect(HISTORY_OVERLAY_PRESENCE_TTL_MS).toBe(15 * 1000)
  })

  it('opens on note and closes on remove', () => {
    const store = new Map()
    expect(isHistoryOverlayOpen(store, 1000)).toBe(false)
    expect(noteHistoryOverlayPresence(store, JID, 1000)).toBe(true)
    expect(isHistoryOverlayOpen(store, 1000)).toBe(true)
    expect(removeHistoryOverlayPresence(store, JID)).toBe(true)
    expect(isHistoryOverlayOpen(store, 1000)).toBe(false)
  })

  it('expires without heartbeat (closed without notice)', () => {
    const store = new Map()
    noteHistoryOverlayPresence(store, JID, 1000)
    expect(isHistoryOverlayOpen(store, 1000 + HISTORY_OVERLAY_PRESENCE_TTL_MS - 1)).toBe(true)
    expect(isHistoryOverlayOpen(store, 1000 + HISTORY_OVERLAY_PRESENCE_TTL_MS + 1)).toBe(false)
    // expired entries are pruned
    expect(store.size).toBe(0)
  })

  it('heartbeat keeps it open', () => {
    const store = new Map()
    noteHistoryOverlayPresence(store, JID, 1000)
    noteHistoryOverlayPresence(store, JID, 1000 + HISTORY_OVERLAY_PRESENCE_TTL_MS - 1000)
    expect(isHistoryOverlayOpen(store, 1000 + HISTORY_OVERLAY_PRESENCE_TTL_MS + 500)).toBe(true)
  })

  it('any open chat suppresses (same or different contact)', () => {
    const store = new Map()
    noteHistoryOverlayPresence(store, 'grupo@g.us', 5000)
    expect(isHistoryOverlayOpen(store, 6000)).toBe(true)
  })

  it('ignores empty jids', () => {
    const store = new Map()
    expect(noteHistoryOverlayPresence(store, '', 1000)).toBe(false)
    expect(noteHistoryOverlayPresence(store, null, 1000)).toBe(false)
    expect(isHistoryOverlayOpen(store, 1000)).toBe(false)
  })

  it('strips device suffix so reopen matches', () => {
    expect(cleanHistoryOverlayJid('5511999999999:1@s.whatsapp.net')).toBe(JID)
    const store = new Map()
    noteHistoryOverlayPresence(store, '5511999999999:1@s.whatsapp.net', 1000)
    expect(removeHistoryOverlayPresence(store, JID)).toBe(true)
    expect(isHistoryOverlayOpen(store, 1000)).toBe(false)
  })
})

describe('isHistoryOverlayOpenFor (same-chat badge/NOVA suppression)', () => {
  it('matches the open chat across JID variants (no badge/NOVA)', () => {
    const store = new Map()
    noteHistoryOverlayPresence(store, JID, 1000)
    expect(isHistoryOverlayOpenFor(store, JID, 1000)).toBe(true)
    expect(isHistoryOverlayOpenFor(store, '5511999999999:7@s.whatsapp.net', 1000)).toBe(true)
  })

  it('does not match a different contact (badge/NOVA kept)', () => {
    const store = new Map()
    noteHistoryOverlayPresence(store, JID, 1000)
    expect(isHistoryOverlayOpenFor(store, '5511888888888@s.whatsapp.net', 1000)).toBe(false)
    expect(isHistoryOverlayOpenFor(store, '120363426533298550@g.us', 1000)).toBe(false)
  })

  it('matches an open group exactly', () => {
    const store = new Map()
    noteHistoryOverlayPresence(store, '120363426533298550@g.us', 1000)
    expect(isHistoryOverlayOpenFor(store, '120363426533298550@g.us', 1000)).toBe(true)
    expect(isHistoryOverlayOpenFor(store, JID, 1000)).toBe(false)
  })

  it('expires with the TTL', () => {
    const store = new Map()
    noteHistoryOverlayPresence(store, JID, 1000)
    expect(isHistoryOverlayOpenFor(store, JID, 1000 + HISTORY_OVERLAY_PRESENCE_TTL_MS + 1)).toBe(
      false
    )
  })

  it('rejects empty targets', () => {
    const store = new Map()
    noteHistoryOverlayPresence(store, JID, 1000)
    expect(isHistoryOverlayOpenFor(store, '', 1000)).toBe(false)
    expect(isHistoryOverlayOpenFor(store, null, 1000)).toBe(false)
  })
})
