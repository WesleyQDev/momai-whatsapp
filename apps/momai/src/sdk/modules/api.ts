import type { SDKResponse } from '../types'

const API_BASE = window.api?.getApiBaseUrl?.() || 'http://127.0.0.1:8000'

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5000

function getCacheKey(method: string, path: string, params?: Record<string, any>): string {
  return `${method}:${path}:${JSON.stringify(params || {})}`
}

function invalidateCache(pathPrefix: string) {
  for (const key of cache.keys()) {
    if (key.includes(pathPrefix)) cache.delete(key)
  }
}

async function request<T>(method: string, path: string, body?: any, params?: Record<string, any>): Promise<SDKResponse<T>> {
  let url = `${API_BASE}${path}`
  if (params) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) qs.append(k, String(v))
    url += `?${qs.toString()}`
  }
  if (method === 'GET') {
    const cacheKey = getCacheKey(method, path, params)
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { ok: true, data: cached.data }
    }
  }
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': window.api?.getSessionToken?.() || '' },
      body: body ? JSON.stringify(body) : undefined
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, errorCode: res.status === 404 ? 'not_found' : 'internal_error' }
    }
    const data = await res.json()
    if (method === 'GET') {
      const cacheKey = getCacheKey(method, path, params)
      cache.set(cacheKey, { data, timestamp: Date.now() })
    } else if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      invalidateCache(path)
    }
    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err.message, errorCode: 'internal_error' }
  }
}

export function createApi() {
  return {
    get<T>(path: string, params?: Record<string, any>) { return request<T>('GET', path, undefined, params) },
    post<T>(path: string, body?: any) { return request<T>('POST', path, body) },
    put<T>(path: string, body?: any) { return request<T>('PUT', path, body) },
    delete<T>(path: string) { return request<T>('DELETE', path) }
  }
}
