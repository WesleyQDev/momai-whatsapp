import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpLlamaControl } from './llama-control'
import { API_BASE_URL } from '../constants'

const LLAMA_PORT = 8052

describe('HttpLlamaControl', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('stop() POSTs to /llama/stop', async () => {
    const ctrl = new HttpLlamaControl(LLAMA_PORT)
    await ctrl.stop()
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>
    expect(mock).toHaveBeenCalledTimes(1)
    const [url, init] = mock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/llama/stop`)
    expect((init as RequestInit).method).toBe('POST')
  })

  it('start() POSTs to /llama/start', async () => {
    const ctrl = new HttpLlamaControl(LLAMA_PORT)
    await ctrl.start()
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>
    expect(mock).toHaveBeenCalledTimes(1)
    const [url, init] = mock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/llama/start`)
    expect((init as RequestInit).method).toBe('POST')
  })

  it('stop() resolves even when fetch rejects (fire-and-forget)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const ctrl = new HttpLlamaControl(LLAMA_PORT)
    await expect(ctrl.stop()).resolves.toBeUndefined()
  })

  it('start() resolves even when fetch rejects (fire-and-forget)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const ctrl = new HttpLlamaControl(LLAMA_PORT)
    await expect(ctrl.start()).resolves.toBeUndefined()
  })

  it('getStatus() returns running=true when llama responds to health check', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          llama_runtime: { current_tier: 'pro' },
          is_loading: false
        })
      })
    const ctrl = new HttpLlamaControl(LLAMA_PORT)
    const status = await ctrl.getStatus()
    expect(status.running).toBe(true)
    expect(status.ready).toBe(true)
    expect(status.loading).toBe(false)
  })

  it('getStatus() returns running=false when llama health check fails', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          llama_runtime: { current_tier: 'pro' },
          is_loading: false
        })
      })
    const ctrl = new HttpLlamaControl(LLAMA_PORT)
    const status = await ctrl.getStatus()
    expect(status.running).toBe(false)
    expect(status.ready).toBe(true)
  })
})
