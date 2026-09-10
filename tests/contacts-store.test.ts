import { describe, it, expect, vi } from 'vitest'
import {
  CONTACTS_COLLECTION,
  loadContacts,
  syncContacts,
  rekeyContacts
} from '../worker-utils'

function stubMomai(options: { declared?: string[]; legacy?: Record<string, any>; rows?: any[] } = {}) {
  const declared = new Set(options.declared ?? [CONTACTS_COLLECTION])
  const kv = new Map<string, any>(Object.entries(options.legacy ?? {}))
  const rows: any[] = (options.rows ?? []).map((r, i) => ({ ...r, _rowId: i + 1 }))
  let seq = rows.length
  const log = vi.fn()
  const table = (name: string) => {
    if (!declared.has(name)) throw Object.assign(new Error('not declared'), { code: 'permission_denied' })
    return rows
  }
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
          table(name)
          seq += 1
          rows.push({ ...record, _rowId: seq })
          return { id: seq }
        },
        list: async (name: string) => [...table(name)].reverse(),
        remove: async (name: string, id: number) => {
          const all = table(name)
          const index = all.findIndex((r) => r._rowId === id)
          if (index >= 0) all.splice(index, 1)
          return { ok: true }
        },
        upsert: async (name: string, record: any) => {
          const all = table(name)
          const index = all.findIndex((r) => r._key === record._key)
          if (index >= 0) {
            all[index] = { ...record, _rowId: all[index]._rowId }
            return { id: all[index]._rowId, updated: true }
          }
          seq += 1
          all.push({ ...record, _rowId: seq })
          return { id: seq, updated: false }
        },
        upsertMany: async (name: string, records: any[]) => {
          const all = table(name)
          for (const record of records) {
            const index = all.findIndex((r) => r._key === record._key)
            if (index >= 0) all[index] = { ...record, _rowId: all[index]._rowId }
            else {
              seq += 1
              all.push({ ...record, _rowId: seq })
            }
          }
          return { upserted: records.length }
        }
      }
    }
  }
}

const ana = { id: 'ana@s.whatsapp.net', name: 'Ana' }
const bia = { id: 'bia@s.whatsapp.net', name: 'Bia' }

describe('loadContacts', () => {
  it('rebuilds the map from collection rows filtered by phone', async () => {
    const { momai } = stubMomai({
      rows: [
        { ...ana, _phone: '111' },
        { ...bia, _phone: '222' }
      ]
    })
    const map = await loadContacts(momai as any, { sources: [], phone: '111' })
    expect(Object.keys(map)).toEqual(['ana@s.whatsapp.net'])
    expect(map['ana@s.whatsapp.net'].name).toBe('Ana')
  })

  it('falls back to legacy keys and backfills stamped rows', async () => {
    const legacy = { 'wa_contacts-111': { [ana.id]: ana } }
    const { momai, kv, rows } = stubMomai({ legacy })
    const map = await loadContacts(momai as any, {
      sources: [{ key: 'wa_contacts-111', phone: '111' }],
      phone: '111'
    })
    expect(Object.keys(map)).toEqual([ana.id])
    expect(rows).toHaveLength(1)
    expect(rows[0]._key).toBe('111:ana@s.whatsapp.net')
    expect(kv.has('wa_contacts-111')).toBe(false)
  })

  it('returns empty when nothing is stored anywhere', async () => {
    const { momai } = stubMomai()
    await expect(loadContacts(momai as any, { sources: [], phone: '111' })).resolves.toEqual({})
  })
})

describe('syncContacts', () => {
  it('upserts only changed contacts and removes deleted ones', async () => {
    const { momai, rows } = stubMomai({
      rows: [
        { ...ana, name: 'Ana Old', _phone: '111', _key: '111:ana@s.whatsapp.net' },
        { ...bia, _phone: '111', _key: '111:bia@s.whatsapp.net' }
      ]
    })
    const previous = {
      [ana.id]: JSON.stringify({ ...ana, name: 'Ana Old' }),
      [bia.id]: JSON.stringify({ ...bia })
    }
    const map = { [ana.id]: ana, [`new@s.whatsapp.net`]: { id: 'new@s.whatsapp.net', name: 'New' } }
    const result = await syncContacts(momai as any, {
      phone: '111',
      map,
      snapshot: JSON.stringify(previous)
    })
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r._key === '111:ana@s.whatsapp.net').name).toBe('Ana')
    expect(result.stats).toEqual({ upserted: 2, removed: 1 })
    expect(result.snapshot).toBeTruthy()
  })

  it('does nothing when the map is unchanged', async () => {
    const { momai, rows } = stubMomai({
      rows: [{ ...ana, _phone: '111', _key: '111:ana@s.whatsapp.net' }]
    })
    const map = { [ana.id]: { ...ana } }
    const first = await syncContacts(momai as any, { phone: '111', map, snapshot: null })
    const second = await syncContacts(momai as any, { phone: '111', map, snapshot: first.snapshot })
    expect(second.stats).toEqual({ upserted: 0, removed: 0 })
    expect(rows).toHaveLength(1)
  })

  it('rekeys unscoped rows once the phone is known', async () => {
    const { momai, rows } = stubMomai({
      rows: [{ ...ana, _phone: null, _key: ':ana@s.whatsapp.net' }]
    })
    await expect(rekeyContacts(momai as any)).resolves.toEqual({ removed: 1 })
    expect(rows).toHaveLength(0)
  })
})
