import type { SDKResponse } from '../types'

export function createOAuth() {
  return {
    async authorize(provider: string, opts: { scope: string[] }): Promise<SDKResponse<{ token: string; expiresAt?: number }>> {
      try {
        const API_BASE = (window as any).api?.getApiBaseUrl?.() || 'http://127.0.0.1:8000'
        const res = await fetch(`${API_BASE}/extensions/oauth/authorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, scope: opts.scope })
        })
        const data = await res.json()
        if (!res.ok) return { ok: false, error: data.error || 'oauth_failed', errorCode: 'internal_error' }
        return { ok: true, data: { token: data.token, expiresAt: data.expires_at } }
      } catch (err: any) {
        return { ok: false, error: err.message, errorCode: 'internal_error' }
      }
    }
  }
}
