import { describe, it, expect, vi } from 'vitest'
import { createIpcMomai } from '../worker-utils'

function loopbackTransport() {
  const listeners = []
  let seq = 0
  const send = vi.fn((msg) => {
    if (msg.type !== 'storage-request') return
    const id = (msg.requestId || `r${seq++}`).toString()
    queueMicrotask(() => {
      for (const fn of listeners) {
        fn({ type: 'storage-response', requestId: id, result: { ok: true, value: `v:${msg.method}` } })
      }
    })
  })
  const onResponse = (fn) => {
    listeners.push(fn)
  }
  return { send, onResponse }
}

describe('createIpcMomai', () => {
  it('routes storage calls over IPC and unwraps values', async () => {
    const { send, onResponse } = loopbackTransport()
    const momai = createIpcMomai({ send, onResponse, storageDir: '/data/ext' })
    expect(momai.storage.storageDir).toBe('/data/ext')
    await expect(momai.storage.get('k')).resolves.toBe('v:storage.get')
    await expect(momai.collections.list('messages')).resolves.toBe('v:collections.list')
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][0]).toMatchObject({ type: 'storage-request', method: 'storage.get' })
  })

  it('rejects with the host error code', async () => {
    const listeners = []
    const send = vi.fn((msg) => {
      queueMicrotask(() => {
        for (const fn of listeners) {
          fn({
            type: 'storage-response',
            requestId: msg.requestId,
            result: { ok: false, error: 'nope', errorCode: 'permission_denied' }
          })
        }
      })
    })
    const momai = createIpcMomai({ send, onResponse: (fn) => listeners.push(fn), storageDir: '/d' })
    const failure = await momai.collections.insert('other', {}).catch((err) => err)
    expect(failure.code).toBe('permission_denied')
  })

  it('times out instead of hanging forever', async () => {
    const momai = createIpcMomai({ send: vi.fn(), onResponse: () => {}, storageDir: '/d', timeoutMs: 20 })
    await expect(momai.storage.get('k')).rejects.toThrow(/timeout/)
  })
})
