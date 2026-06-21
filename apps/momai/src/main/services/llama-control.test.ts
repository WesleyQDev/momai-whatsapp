import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpLlamaControl } from './llama-control'
import { API_BASE_URL } from '../constants'

describe('HttpLlamaControl', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('stop() POSTs to /llama/stop', async () => {
    const ctrl = new HttpLlamaControl()
    await ctrl.stop()
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE_URL}/llama/stop`, { method: 'POST' })
  })

  it('start() POSTs to /llama/start', async () => {
    const ctrl = new HttpLlamaControl()
    await ctrl.start()
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE_URL}/llama/start`, { method: 'POST' })
  })

  it('stop() resolves even when fetch rejects (fire-and-forget)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const ctrl = new HttpLlamaControl()
    await expect(ctrl.stop()).resolves.toBeUndefined()
  })

  it('start() resolves even when fetch rejects (fire-and-forget)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const ctrl = new HttpLlamaControl()
    await expect(ctrl.start()).resolves.toBeUndefined()
  })
})
