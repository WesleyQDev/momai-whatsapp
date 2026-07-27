import type { SDKResponse } from '../types'

export function createLlm() {
  return {
    async complete(opts: { system?: string; user: string; maxTokens?: number }): Promise<{ text: string }> {
      const API_BASE = window.api?.getApiBaseUrl?.() || 'http://127.0.0.1:8000'
      const res = await fetch(`${API_BASE}/extensions/llm/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts)
      })
      const data = await res.json()
      return { text: data.text || '' }
    }
  }
}
