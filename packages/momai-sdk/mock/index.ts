import type { MomAISDK, SDKResponse } from '../src/index'

class MockApi {
  private _responses: Map<string, any> = new Map()
  private _calls: Array<{ method: string; path: string; body?: any; timestamp: number }> = []

  get<T>(path: string, params?: Record<string, any>): Promise<SDKResponse<T>> {
    this._calls.push({ method: 'GET', path, timestamp: Date.now() })
    return Promise.resolve(this._responses.get(`GET:${path}`) || { ok: true, data: null })
  }

  post<T>(path: string, body?: any): Promise<SDKResponse<T>> {
    this._calls.push({ method: 'POST', path, body, timestamp: Date.now() })
    return Promise.resolve(this._responses.get(`POST:${path}`) || { ok: true })
  }

  put<T>(path: string, body?: any): Promise<SDKResponse<T>> {
    this._calls.push({ method: 'PUT', path, body, timestamp: Date.now() })
    return Promise.resolve(this._responses.get(`PUT:${path}`) || { ok: true })
  }

  delete<T>(path: string): Promise<SDKResponse<T>> {
    this._calls.push({ method: 'DELETE', path, timestamp: Date.now() })
    return Promise.resolve(this._responses.get(`DELETE:${path}`) || { ok: true })
  }

  _resolve(method: string, path: string, response: any) {
    this._responses.set(`${method}:${path}`, response)
    return this
  }

  getCalls() { return [...this._calls] }
  reset() { this._calls = []; this._responses.clear() }
}

class MockStorage {
  private _data: Map<string, any> = new Map()
  private _calls: Array<{ method: string; key: string; value?: any; timestamp: number }> = []

  get<T>(key: string): Promise<T | null> {
    this._calls.push({ method: 'get', key, timestamp: Date.now() })
    return Promise.resolve(this._data.get(key) ?? null)
  }

  set(key: string, value: any): Promise<void> {
    this._calls.push({ method: 'set', key, value, timestamp: Date.now() })
    this._data.set(key, value)
    return Promise.resolve()
  }

  getMany<T>(keys: string[]): Promise<Record<string, T | null>> {
    const result: Record<string, T | null> = {}
    for (const k of keys) result[k] = this._data.get(k) ?? null
    return Promise.resolve(result)
  }

  setMany(entries: Record<string, any>): Promise<void> {
    for (const [k, v] of Object.entries(entries)) {
      this._data.set(k, v)
    }
    return Promise.resolve()
  }

  delete(key: string): Promise<void> {
    this._data.delete(key)
    return Promise.resolve()
  }

  listKeys(): Promise<string[]> {
    return Promise.resolve([...this._data.keys()])
  }

  migrate(from: string, to: string, fn: (old: any) => any): Promise<void> {
    const oldData = this._data.get(from)
    if (oldData !== undefined) {
      this._data.set(to, fn(oldData))
    }
    return Promise.resolve()
  }

  getSetCalls() { return [...this._calls] }
  reset() { this._data.clear(); this._calls = [] }
}

class MockEvents {
  private _calls: Array<{ method: string; type: string; timestamp: number }> = []
  private _handlers: Map<string, Set<Function>> = new Map()

  subscribe(type: string, handler: (data: any) => void): () => void {
    this._calls.push({ method: 'subscribe', type, timestamp: Date.now() })
    if (!this._handlers.has(type)) this._handlers.set(type, new Set())
    this._handlers.get(type)!.add(handler)
    return () => this._handlers.get(type)?.delete(handler)
  }

  unsubscribe(type: string, handler: Function): void {
    this._handlers.get(type)?.delete(handler)
  }

  once(type: string, handler: (data: any) => void): void {
    const wrapper = (data: any) => { handler(data); this.unsubscribe(type, wrapper) }
    this.subscribe(type, wrapper)
  }

  _emit(type: string, data: any) {
    this._handlers.get(type)?.forEach((h) => h(data))
  }

  getSubscribeCalls() { return [...this._calls] }
  reset() { this._calls = []; this._handlers.clear() }
}

class MockTheme {
  private _calls: Array<{ method: string; args: any; timestamp: number }> = []
  private _colors: Record<string, string> = { primary: '#6366f1', accent: '#8b5cf6' }
  private _fonts: Record<string, string> = { sans: 'Inter', mono: 'JetBrains Mono' }

  setColors(colors: any): Promise<void> {
    this._calls.push({ method: 'setColors', args: colors, timestamp: Date.now() })
    Object.assign(this._colors, colors)
    return Promise.resolve()
  }

  setFont(kind: 'sans' | 'mono', fontFamily: string): Promise<void> {
    this._calls.push({ method: 'setFont', args: { kind, fontFamily }, timestamp: Date.now() })
    this._fonts[kind] = fontFamily
    return Promise.resolve()
  }

  getCurrentTheme(): Promise<any> {
    return Promise.resolve({ colors: this._colors, fonts: this._fonts })
  }

  getSetColorsCalls() { return [...this._calls] }
  reset() { this._calls = []; this._colors = { primary: '#6366f1', accent: '#8b5cf6' }; this._fonts = { sans: 'Inter', mono: 'JetBrains Mono' } }
}

export const mockApi = new MockApi()
export const mockStorage = new MockStorage()
export const mockEvents = new MockEvents()
export const mockTheme = new MockTheme()

export const sdk: MomAISDK = {
  api: mockApi as any,
  storage: mockStorage as any,
  events: mockEvents as any,
  llm: {
    complete: () => Promise.resolve({ text: '' })
  },
  registry: {
    registerRenderer: () => {},
    getRenderer: () => null,
    hasRenderer: () => false,
    listRendererTypes: () => []
  },
  notifications: {
    send: () => Promise.resolve()
  },
  theme: mockTheme as any,
  scheduler: {
    cron: () => ({ cancel: () => {} })
  },
  oauth: {
    authorize: () => Promise.resolve({ token: 'mock-token' })
  },
  config: {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    delete: () => Promise.resolve()
  },
  process: {
    spawn: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
  },
  system: {
    mouse: { click: () => Promise.resolve(), move: () => Promise.resolve() },
    keyboard: { type: () => Promise.resolve(), press: () => Promise.resolve() },
    screen: { capture: () => Promise.resolve(Buffer.from('')) }
  },
  browser: {
    open: () => Promise.resolve(),
    evaluate: () => Promise.resolve(null),
    screenshot: () => Promise.resolve(Buffer.from(''))
  },
  has: () => false,
  dev: {
    reload: () => {},
    log: (...args: any[]) => {}
  }
}
