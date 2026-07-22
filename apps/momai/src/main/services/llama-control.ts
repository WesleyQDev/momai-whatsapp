import { API_BASE_URL } from '../constants'
import { authFetch } from '../security/authenticated-fetch'

export interface LlamaRuntimeStatus {
  running: boolean
  ready: boolean
  loading: boolean
}

export interface LlamaControl {
  start(): Promise<void>
  stop(): Promise<void>
  getStatus(): Promise<LlamaRuntimeStatus>
}

export class HttpLlamaControl implements LlamaControl {
  constructor(private llamaPort: number) {}

  async start(): Promise<void> {
    await this.post('/llama/start')
  }

  async stop(): Promise<void> {
    await this.post('/llama/stop')
  }

  async getStatus(): Promise<LlamaRuntimeStatus> {
    // 1. Direct health check no llama-server: se a porta responde, tá rodando de verdade
    let running = false
    try {
      const res = await authFetch(`http://127.0.0.1:${this.llamaPort}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1500)
      })
      running = res.ok
    } catch {
      running = false
    }

    // 2. Pega status detalhado do node-core
    let ready = false
    let loading = false
    try {
      const res = await authFetch(`${API_BASE_URL}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      })
      if (res.ok) {
        const data = await res.json()
        ready = data?.llama_runtime?.current_tier != null
        loading = data?.is_loading === true
      }
    } catch {
      // node-core pode estar offline
    }

    return { running, ready, loading }
  }

  private async post(path: string): Promise<void> {
    try {
      await authFetch(`${API_BASE_URL}${path}`, { method: 'POST' })
    } catch {
      // Fire-and-forget: tray close must not block on network errors
    }
  }
}
