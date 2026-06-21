import { API_BASE_URL } from '../constants'

export interface LlamaControl {
  start(): Promise<void>
  stop(): Promise<void>
}

export class HttpLlamaControl implements LlamaControl {
  async start(): Promise<void> {
    await this.post('/llama/start')
  }

  async stop(): Promise<void> {
    await this.post('/llama/stop')
  }

  private async post(path: string): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}${path}`, { method: 'POST' })
    } catch {
      // Fire-and-forget: tray close must not block on network errors
    }
  }
}
