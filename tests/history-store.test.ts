import { describe, it, expect, vi } from 'vitest'
import {
  MESSAGES_COLLECTION,
  HISTORY_LIST_LIMIT,
  trackHistoryMessage,
  loadHistoryMessages,
  deleteHistoryMessages,
  pruneHistoryMessages
} from '../worker-utils'

function stubMomai(options: { declared?: string[]; legacy?: Record<string, any> } = {}) {
  const declared = new Set(options.declared ?? [MESSAGES_COLLECTION])
  const kv = new Map<string, any>(Object.entries(options.legacy ?? {}))
  const rows: any[] = []
  const log = vi.fn()
  return {
    log,
    kv,
    rows,
    momai: {
      log,
      storage: {
        get: async (key: string) => kv.get(key) ?? null,
        set: async (key: string, value: any) => {
          kv.set(key, value)
        },
        delete: async (key: string) => {
          kv.delete(key)
        }
      },
      collections: {
        insert: async (name: string, record: any) => {
          if (!declared.has(name)) throw Object.assign(new Error('not declared'), { code: 'permission_denied' })
          const id = rows.length + 1
          rows.push({ ...record, id, _rowId: id })
          return { id }
        },
        list: async (name: string) => {
          if (!declared.has(name)) throw Object.assign(new Error('not declared'), { code: 'permission_denied' })
          return [...rows].reverse().slice(0, HISTORY_LIST_LIMIT)
        },
        remove: async (name: string, id: number) => {
          if (!declared.has(name)) throw Object.assign(new Error('not declared'), { code: 'permission_denied' })
          const idx = rows.findIndex((r) => r.id === id || r._rowId === id)
          if (idx !== -1) rows.splice(idx, 1)
          return { ok: true }
        },
        clear: async (name: string) => {
          if (!declared.has(name)) throw Object.assign(new Error('not declared'), { code: 'permission_denied' })
          const removed = rows.length
          rows.length = 0
          return { removed }
        }
      }
    }
  }
}

const entry = { jid: '5511999999999@s.whatsapp.net', text: 'oi', timestamp: 1788725308 }

describe('trackHistoryMessage', () => {
  it('inserts one row per message instead of rewriting history', async () => {
    const { momai, rows, log } = stubMomai()
    await trackHistoryMessage(momai as any, entry, '5511888888888')
    await trackHistoryMessage(momai as any, { ...entry, text: 'tchau' }, '5511888888888')
    expect(rows).toHaveLength(2)
    expect(rows[0]._phone).toBe('5511888888888')
    expect(log).not.toHaveBeenCalled()
  })

  it('logs instead of throwing when the collection is missing', async () => {
    const { momai, log } = stubMomai({ declared: [] })
    await trackHistoryMessage(momai as any, entry, null)
    expect(log).toHaveBeenCalled()
  })
})

describe('loadHistoryMessages', () => {
  it('prefers the collection over legacy keys', async () => {
    const { momai, rows } = stubMomai({ legacy: { chat_history: [{ ...entry, text: 'old' }] } })
    rows.push({ ...entry, text: 'new', id: 1 })
    const loaded = await loadHistoryMessages(momai as any, {
      sources: [{ key: 'chat_history', phone: null }]
    })
    expect(loaded).toHaveLength(1)
    expect(loaded[0].text).toBe('new')
  })

  it('filters collection rows by phone', async () => {
    const { momai, rows } = stubMomai()
    rows.push({ ...entry, text: 'a', _phone: '111', id: 1 })
    rows.push({ ...entry, text: 'b', _phone: '222', id: 2 })
    const loaded = await loadHistoryMessages(momai as any, { sources: [], phone: '222' })
    expect(loaded.map((m: any) => m.text)).toEqual(['b'])
  })

  it('falls back to legacy keys and backfills the collection', async () => {
    const { momai, kv, rows } = stubMomai({ legacy: { chat_history: [entry] } })
    const loaded = await loadHistoryMessages(momai as any, {
      sources: [{ key: 'chat_history', phone: '111' }]
    })
    expect(loaded).toHaveLength(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]._phone).toBe('111')
    expect(kv.has('chat_history')).toBe(false)
  })

  it('returns empty when neither collection nor legacy has data', async () => {
    const { momai } = stubMomai()
    await expect(
      loadHistoryMessages(momai as any, { sources: [{ key: 'chat_history', phone: null }] })
    ).resolves.toEqual([])
  })
})

describe('pruneHistoryMessages', () => {
  it('clears records older than the retention window', async () => {
    const { momai, rows } = stubMomai()
    rows.push({ ...entry, id: 1 })
    const cleared = await pruneHistoryMessages(momai as any, 30 * 24 * 3600 * 1000)
    expect(cleared.removed).toBe(1)
  })
})

describe('deleteHistoryMessages', () => {
  it('deletes messages from collection matching target JID across formats and suffixes', async () => {
    const { momai, rows } = stubMomai()
    rows.push({ ...entry, id: 1, _rowId: 1 })
    rows.push({ jid: '5511999999999:1@s.whatsapp.net', text: 'call', id: 2, _rowId: 2 })
    rows.push({ jid: '5511888888888@s.whatsapp.net', text: 'other', id: 3, _rowId: 3 })

    const res = await deleteHistoryMessages(momai as any, ['5511999999999@s.whatsapp.net'])
    expect(res.removed).toBe(2)
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('other')
  })

  it('deletes matching messages from legacy KV storage', async () => {
    const { momai, kv } = stubMomai({
      legacy: {
        chat_history: [
          entry,
          { jid: '5511888888888@s.whatsapp.net', text: 'keep' }
        ]
      }
    })

    const res = await deleteHistoryMessages(momai as any, ['5511999999999@s.whatsapp.net'], {
      sources: ['chat_history']
    })
    expect(res.removed).toBe(1)
    expect(kv.get('chat_history')).toEqual([{ jid: '5511888888888@s.whatsapp.net', text: 'keep' }])
  })
})

