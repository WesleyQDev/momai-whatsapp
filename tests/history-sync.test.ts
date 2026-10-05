import { describe, it, expect } from 'vitest'
import { toUnixSeconds, getHistoryMessageKey, mergeHistoryWithServer } from '../src/utils/historySync'

const groupJid = '120363426533298550@g.us'

function incoming(text: string, timestamp: number) {
  return {
    jid: groupJid,
    timestamp,
    direction: 'incoming' as const,
    text,
    isGroup: true,
    groupName: 'Apps'
  }
}

describe('toUnixSeconds', () => {
  it('keeps numeric seconds', () => {
    expect(toUnixSeconds(1788725308)).toBe(1788725308)
  })

  it('parses numeric strings from Baileys payloads', () => {
    expect(toUnixSeconds('1788725308')).toBe(1788725308)
  })

  it('reads Long-like objects', () => {
    expect(toUnixSeconds({ toNumber: () => 1788725308 })).toBe(1788725308)
  })

  it('falls back to now for invalid input', () => {
    const before = Math.floor(Date.now() / 1000)
    const parsed = toUnixSeconds(undefined)
    expect(parsed).toBeGreaterThanOrEqual(before)
  })
})

describe('mergeHistoryWithServer', () => {
  it('preserves an optimistic realtime message missing from a stale server response', () => {
    const optimistic = incoming('Oi', 1788725308)
    const server = [incoming('older', 1788725200)]
    const merged = mergeHistoryWithServer([optimistic, ...server], server)
    expect(merged.some((m) => m.text === 'Oi')).toBe(true)
    expect(merged.some((m) => m.text === 'older')).toBe(true)
  })

  it('deduplicates when the server already includes the realtime message', () => {
    const optimistic = incoming('Oi', 1788725308)
    const server = [incoming('Oi', 1788725308)]
    const merged = mergeHistoryWithServer([optimistic], server)
    expect(merged).toHaveLength(1)
  })

  it('returns prev when server is empty', () => {
    const prev = [incoming('cached message', 1788725200)]
    const server: any[] = []
    const merged = mergeHistoryWithServer(prev, server)
    expect(merged).toEqual(prev)
  })

  it('keeps the newest message first for recent conversations', () => {
    const optimistic = incoming('new', 1788725400)
    const server = [incoming('old', 1788725200)]
    const merged = mergeHistoryWithServer([optimistic], server)
    expect(merged[0].text).toBe('new')
  })
  it('keeps optimistic outgoing messages sent by the user when merging with server', () => {
    const outgoing = {
      jid: '5511999999999@s.whatsapp.net',
      timestamp: 1788725500,
      direction: 'outgoing' as const,
      text: 'Olá, como vai?'
    }
    const server = [incoming('Mensagem anterior', 1788725200)]
    const merged = mergeHistoryWithServer([outgoing, ...server], server)
    expect(merged.some((m) => m.text === 'Olá, como vai?' && m.direction === 'outgoing')).toBe(true)
    expect(merged[0].direction).toBe('outgoing')
  })

  it('discards stale messages from prev that were deleted from server', () => {
    const deletedStaleMsg = incoming('Mensagem apagada no servidor', 1788725100)
    const server = [incoming('Mensagem ativa mais recente', 1788725300)]
    const merged = mergeHistoryWithServer([deletedStaleMsg, ...server], server)
    expect(merged.some((m) => m.text === 'Mensagem apagada no servidor')).toBe(false)
    expect(merged.some((m) => m.text === 'Mensagem ativa mais recente')).toBe(true)
    expect(merged).toHaveLength(1)
  })
})

describe('getHistoryMessageKey', () => {
  it('distinguishes direction and media', () => {
    const base = incoming('Oi', 1788725308)
    expect(getHistoryMessageKey(base)).not.toBe(
      getHistoryMessageKey({ ...base, direction: 'outgoing' })
    )
    expect(getHistoryMessageKey(base)).not.toBe(
      getHistoryMessageKey({ ...base, text: 'Ola' })
    )
  })
})
