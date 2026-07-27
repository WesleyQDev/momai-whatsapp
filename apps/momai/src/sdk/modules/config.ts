export function createConfig() {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const API_BASE = (window as any).api?.getApiBaseUrl?.() || 'http://127.0.0.1:8000'
        const res = await fetch(`${API_BASE}/extensions/config/${key}`)
        const data = await res.json()
        return data.value ?? null
      } catch {
        return null
      }
    },
    async set(key: string, value: string): Promise<void> {
      const API_BASE = (window as any).api?.getApiBaseUrl?.() || 'http://127.0.0.1:8000'
      await fetch(`${API_BASE}/extensions/config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      })
    },
    async delete(key: string): Promise<void> {
      const API_BASE = (window as any).api?.getApiBaseUrl?.() || 'http://127.0.0.1:8000'
      await fetch(`${API_BASE}/extensions/config/${key}`, { method: 'DELETE' })
    }
  }
}
