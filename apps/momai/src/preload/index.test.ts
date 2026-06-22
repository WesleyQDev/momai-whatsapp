import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getExposed, resetExposed } from './test-setup'

const originalArgv = process.argv
const originalFetch = global.fetch
const originalWebSocket = global.WebSocket

let mockFetch: ReturnType<typeof vi.fn>
let mockWebSocket: ReturnType<typeof vi.fn>

describe('preload apiFetch wrapper', () => {
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
    process.argv = originalArgv
    global.fetch = originalFetch
    vi.resetModules()
  })

  it('attaches Authorization header when token is in argv', async () => {
    process.argv = [...originalArgv, '--momai-session-token=deadbeef1234']
    await import('./index')
    const api = getExposed().api as {
      apiFetch: (url: string, options?: RequestInit) => Promise<Response>
    }
    expect(api).toBeDefined()
    await api.apiFetch('http://127.0.0.1:8000/test')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer deadbeef1234')
  })

  it('does not attach Authorization header when token is missing', async () => {
    await import('./index')
    const api = getExposed().api as {
      apiFetch: (url: string, options?: RequestInit) => Promise<Response>
    }
    await api.apiFetch('http://127.0.0.1:8000/test')
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
  })

  it('preserves caller-provided headers', async () => {
    process.argv = [...originalArgv, '--momai-session-token=deadbeef1234']
    await import('./index')
    const api = getExposed().api as {
      apiFetch: (url: string, options?: RequestInit) => Promise<Response>
    }
    await api.apiFetch('http://127.0.0.1:8000/test', {
      headers: { 'Content-Type': 'application/json' }
    })
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer deadbeef1234')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('caller-supplied Authorization header is overwritten by token', async () => {
    process.argv = [...originalArgv, '--momai-session-token=deadbeef1234']
    await import('./index')
    const api = getExposed().api as {
      apiFetch: (url: string, options?: RequestInit) => Promise<Response>
    }
    await api.apiFetch('http://127.0.0.1:8000/test', {
      headers: { Authorization: 'Bearer attacker' }
    })
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer deadbeef1234')
  })
})

describe('preload apiWebSocket wrapper', () => {
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
    process.argv = originalArgv
    global.WebSocket = originalWebSocket
    vi.resetModules()
  })

  it('appends token query param when token is in argv', async () => {
    process.argv = [...originalArgv, '--momai-session-token=deadbeef1234']
    await import('./index')
    const api = getExposed().api as { apiWebSocket: (url: string) => WebSocket }
    api.apiWebSocket('ws://127.0.0.1:8000/ws')
    expect(mockWebSocket).toHaveBeenCalledWith('ws://127.0.0.1:8000/ws?token=deadbeef1234')
  })

  it('preserves existing query params and uses & separator', async () => {
    process.argv = [...originalArgv, '--momai-session-token=deadbeef1234']
    await import('./index')
    const api = getExposed().api as { apiWebSocket: (url: string) => WebSocket }
    api.apiWebSocket('ws://127.0.0.1:8000/ws?foo=bar')
    expect(mockWebSocket).toHaveBeenCalledWith('ws://127.0.0.1:8000/ws?foo=bar&token=deadbeef1234')
  })

  it('does not append token when missing', async () => {
    await import('./index')
    const api = getExposed().api as { apiWebSocket: (url: string) => WebSocket }
    api.apiWebSocket('ws://127.0.0.1:8000/ws')
    expect(mockWebSocket).toHaveBeenCalledWith('ws://127.0.0.1:8000/ws')
  })
})
