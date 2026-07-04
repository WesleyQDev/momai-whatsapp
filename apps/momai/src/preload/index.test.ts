import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getExposed, resetExposed } from './test-setup'

const originalToken = process.env.MOMAI_SESSION_TOKEN

describe('preload getSessionToken', () => {
  beforeEach(() => {
    resetExposed()
    Object.defineProperty(process, 'contextIsolated', {
      value: true,
      configurable: true,
      writable: true
    })
  })

  afterEach(() => {
    process.env.MOMAI_SESSION_TOKEN = originalToken ?? undefined
    vi.resetModules()
  })

  it('returns the session token from MOMAI_SESSION_TOKEN env', async () => {
    process.env.MOMAI_SESSION_TOKEN = 'deadbeef1234'
    await import('./index')
    const api = getExposed().api as { getSessionToken: () => string }
    expect(api).toBeDefined()
    expect(api.getSessionToken()).toBe('deadbeef1234')
  })

  it('returns empty string when MOMAI_SESSION_TOKEN is missing', async () => {
    delete process.env.MOMAI_SESSION_TOKEN
    await import('./index')
    const api = getExposed().api as { getSessionToken: () => string }
    expect(api.getSessionToken()).toBe('')
  })

  it('returns empty string when MOMAI_SESSION_TOKEN is empty', async () => {
    process.env.MOMAI_SESSION_TOKEN = ''
    await import('./index')
    const api = getExposed().api as { getSessionToken: () => string }
    expect(api.getSessionToken()).toBe('')
  })
})

describe('preload apiFetch (backward-compat passthrough)', () => {
  const originalFetch = global.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetExposed()
    mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    global.fetch = mockFetch as unknown as typeof fetch
    Object.defineProperty(process, 'contextIsolated', {
      value: true,
      configurable: true,
      writable: true
    })
  })

  afterEach(() => {
    process.env.MOMAI_SESSION_TOKEN = originalToken ?? undefined
    global.fetch = originalFetch
    vi.resetModules()
  })

  it('delegates to global fetch without modifying headers', async () => {
    process.env.MOMAI_SESSION_TOKEN = 'deadbeef1234'
    await import('./index')
    const api = getExposed().api as {
      apiFetch: (url: string, options?: RequestInit) => Promise<Response>
    }
    await api.apiFetch('http://127.0.0.1:8000/test', {
      headers: { 'Content-Type': 'application/json' }
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8000/test')
    // apiFetch is now a passthrough; auth is handled by the renderer's
    // api.ts wrapper which calls getSessionToken() + renderer's fetch.
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })
})

describe('preload apiWebSocket (backward-compat passthrough)', () => {
  const originalWebSocket = global.WebSocket
  let mockWebSocket: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetExposed()
    mockWebSocket = vi.fn()
    global.WebSocket = mockWebSocket as unknown as typeof WebSocket
    Object.defineProperty(process, 'contextIsolated', {
      value: true,
      configurable: true,
      writable: true
    })
  })

  afterEach(() => {
    process.env.MOMAI_SESSION_TOKEN = originalToken ?? undefined
    global.WebSocket = originalWebSocket
    vi.resetModules()
  })

  it('delegates to global WebSocket without modifying URL', async () => {
    process.env.MOMAI_SESSION_TOKEN = 'deadbeef1234'
    await import('./index')
    const api = getExposed().api as { apiWebSocket: (url: string) => WebSocket }
    api.apiWebSocket('ws://127.0.0.1:8000/ws')
    // apiWebSocket is a passthrough; auth is handled by the renderer's
    // useChatWebSocket hook which appends the token to the URL itself.
    expect(mockWebSocket).toHaveBeenCalledWith('ws://127.0.0.1:8000/ws')
  })
})
