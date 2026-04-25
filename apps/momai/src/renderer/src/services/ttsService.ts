export type TTSEngine = 'kokoro' | 'edge-tts' | 'say'

export interface TTSVoice {
  id: string
  name: string
  language: string
  gender?: 'male' | 'female'
  trait?: string
}

export interface TTSConfig {
  engine: TTSEngine
  voice: string
  speed: number
  enabled: boolean
}

export interface TTSResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

function invoke(channel: string, ...args: any[]): Promise<any> {
  return (window as any).electron.ipcRenderer.invoke(channel, ...args)
}

function on(channel: string, listener: (...args: any[]) => void): () => void {
  const subscription = (event: any, ...args: any[]) => listener(...args)
  ;(window as any).electron.ipcRenderer.on(channel, subscription)
  return () => {
    ;(window as any).electron.ipcRenderer.removeListener(channel, subscription)
  }
}

class TTSServiceRenderer {
  private listeners: Map<string, Set<Function>> = new Map()
  private cleanupFns: (() => void)[] = []

  constructor() {
    this.setupEventListeners()
  }

  private setupEventListeners() {
    this.cleanupFns.push(on('tts:speaking-start', (data) => this.emit('speaking-start', data)))
    this.cleanupFns.push(on('tts:speaking-end', () => this.emit('speaking-end')))
    this.cleanupFns.push(on('tts:error', (error) => this.emit('error', error)))
    this.cleanupFns.push(on('tts:engine-changed', (engine) => this.emit('engine-changed', engine)))
    this.cleanupFns.push(on('tts:voice-changed', (voice) => this.emit('voice-changed', voice)))
    this.cleanupFns.push(on('tts:play-audio-buffer', (payload: { data: string; mimeType: string }) => {
      console.log('[Renderer TTS] Received audio payload, mimeType:', payload.mimeType, 'base64 length:', payload.data.length)
      try {
        const binary = atob(payload.data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        const blob = new Blob([bytes.buffer], { type: payload.mimeType })
        const url = URL.createObjectURL(blob)
        console.log('[Renderer TTS] Created blob URL:', url)
        const audio = new Audio(url)
        audio.onended = () => { URL.revokeObjectURL(url); console.log('[Renderer TTS] Audio ended') }
        audio.onerror = (e) => { console.error('[Renderer TTS] Audio error:', e); URL.revokeObjectURL(url) }
        audio.play().then(() => {
          console.log('[Renderer TTS] Audio playing!')
        }).catch((err) => {
          console.error('[Renderer TTS] Audio play error:', err)
          URL.revokeObjectURL(url)
        })
      } catch (err) {
        console.error('[Renderer TTS] Failed to play audio buffer:', err)
      }
    }))
  }

  private emit(event: string, ...args: any[]) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.forEach(callback => callback(...args))
    }
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: Function) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.delete(callback)
    }
  }

  async getEngines(): Promise<TTSResponse<TTSEngine[]>> {
    try {
      const engines = await invoke('tts:get-engines')
      return { success: true, data: engines }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async getEngineInfo(engine: TTSEngine): Promise<TTSResponse<any>> {
    try {
      const info = await invoke('tts:get-engine-info', engine)
      return { success: true, data: info }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async getVoices(engine?: TTSEngine): Promise<TTSResponse<TTSVoice[]>> {
    try {
      const response = await invoke('tts:get-voices', engine)
      if (response.success) {
        return { success: true, data: response.voices }
      }
      return { success: false, error: response.error }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async speak(text: string, engine?: TTSEngine): Promise<TTSResponse<void>> {
    try {
      const response = await invoke('tts:speak', text, engine)
      return response
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async stop(): Promise<TTSResponse<void>> {
    try {
      const response = await invoke('tts:stop')
      return response
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async setEngine(engine: TTSEngine): Promise<TTSResponse<void>> {
    try {
      const response = await invoke('tts:set-engine', engine)
      return response
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async setVoice(voice: string): Promise<TTSResponse<void>> {
    try {
      const response = await invoke('tts:set-voice', voice)
      return response
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async setSpeed(speed: number): Promise<TTSResponse<void>> {
    try {
      const response = await invoke('tts:set-speed', speed)
      return response
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async setEnabled(enabled: boolean): Promise<TTSResponse<void>> {
    try {
      const response = await invoke('tts:set-enabled', enabled)
      return response
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async getConfig(): Promise<TTSResponse<TTSConfig>> {
    try {
      const response = await invoke('tts:get-config')
      if (response.success) {
        return { success: true, data: response.config }
      }
      return { success: false, error: response.error }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async updateConfig(config: Partial<TTSConfig>): Promise<TTSResponse<TTSConfig>> {
    try {
      const response = await invoke('tts:update-config', config)
      if (response.success) {
        return { success: true, data: response.config }
      }
      return { success: false, error: response.error }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async isSpeaking(): Promise<TTSResponse<boolean>> {
    try {
      const response = await invoke('tts:is-speaking')
      if (response.success) {
        return { success: true, data: response.isSpeaking }
      }
      return { success: false, error: response.error }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  cleanup() {
    this.listeners.clear()
    this.cleanupFns.forEach(fn => fn())
    this.cleanupFns = []
  }
}

// Singleton instance
let ttsServiceInstance: TTSServiceRenderer | null = null

export function getTTSServiceRenderer(): TTSServiceRenderer {
  if (!ttsServiceInstance) {
    ttsServiceInstance = new TTSServiceRenderer()
  }
  return ttsServiceInstance
}

export function resetTTSServiceRenderer(): void {
  if (ttsServiceInstance) {
    ttsServiceInstance.cleanup()
    ttsServiceInstance = null
  }
}