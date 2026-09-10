import { describe, it, expect } from 'vitest'
import utils from '../worker-utils'

const { cacheGet, cacheSet } = utils as any

function makeMomai({ cacheValues = {}, storageValues = {}, withCache = true } = {}) {
  const cacheStore = { ...cacheValues }
  const storageStore = { ...storageValues }
  const calls = { cacheGet: 0, cacheSet: 0, storageGet: 0, storageSet: 0 }
  const momai: any = {
    storage: {
      async get(key: string) {
        calls.storageGet += 1
        return key in storageStore ? storageStore[key] : null
      },
      async set(key: string, value: any) {
        calls.storageSet += 1
        storageStore[key] = value
      }
    }
  }
  if (withCache) {
    momai.cache = {
      async get(key: string) {
        calls.cacheGet += 1
        return key in cacheStore ? cacheStore[key] : null
      },
      async set(key: string, value: any) {
        calls.cacheSet += 1
        cacheStore[key] = value
      }
    }
  }
  return { momai, calls, cacheStore, storageStore }
}

describe('cacheGet/cacheSet (unified extension cache)', () => {
  it('reads from momai.cache when the bridge provides it', async () => {
    const { momai, calls } = makeMomai({ cacheValues: { message_cache_sent: { a: 1 } } })
    expect(await cacheGet(momai, 'message_cache_sent')).toEqual({ a: 1 })
    expect(calls.cacheGet).toBe(1)
    expect(calls.storageGet).toBe(0)
  })

  it('falls back to momai.storage on hosts without momai.cache', async () => {
    const { momai, calls } = makeMomai({
      withCache: false,
      storageValues: { message_cache_sent: { b: 2 } }
    })
    expect(await cacheGet(momai, 'message_cache_sent')).toEqual({ b: 2 })
    expect(calls.storageGet).toBe(1)
  })

  it('promotes a legacy storage value into the cache on first read', async () => {
    const { momai, cacheStore } = makeMomai({
      storageValues: { message_cache_store: { c: 3 } }
    })
    expect(await cacheGet(momai, 'message_cache_store')).toEqual({ c: 3 })
    expect(cacheStore['message_cache_store']).toEqual({ c: 3 })
  })

  it('returns null when both cache and storage are empty', async () => {
    const { momai } = makeMomai()
    expect(await cacheGet(momai, 'message_cache_sent')).toBeNull()
  })

  it('writes to momai.cache when available', async () => {
    const { momai, calls, cacheStore, storageStore } = makeMomai()
    await cacheSet(momai, 'message_cache_sent', { d: 4 })
    expect(cacheStore['message_cache_sent']).toEqual({ d: 4 })
    expect(calls.cacheSet).toBe(1)
    expect('message_cache_sent' in storageStore).toBe(false)
  })

  it('writes to momai.storage on hosts without momai.cache', async () => {
    const { momai, calls, storageStore } = makeMomai({ withCache: false })
    await cacheSet(momai, 'message_cache_sent', { e: 5 })
    expect(storageStore['message_cache_sent']).toEqual({ e: 5 })
    expect(calls.storageSet).toBe(1)
  })
})
