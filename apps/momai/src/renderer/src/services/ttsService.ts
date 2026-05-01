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

import { updateTtsStatus } from './api'

class TTSServiceRenderer {
  private listeners: Map<string, Set<Function>> = new Map()
  private cleanupFns: (() => void)[] = []
  private audioCtx: AudioContext | null = null
  private nextScheduleTime = 0
  private currentSources: Set<AudioBufferSourceNode> = new Set()
  private currentHtmlAudio: HTMLAudioElement | null = null
  private hasLocalAudio = false

  constructor() {
    this.setupEventListeners()
  }

  private checkAllAudioEnded() {
    if (this.currentSources.size === 0 && !this.currentHtmlAudio && this.hasLocalAudio) {
      this.hasLocalAudio = false
      this.emit('speaking-end')
    }
  }

  private stopCurrentAudio() {
    const hadAudio = this.currentSources.size > 0 || !!this.currentHtmlAudio
    for (const src of this.currentSources) {
      try { src.stop() } catch {}
      try { src.disconnect() } catch {}
    }
    this.currentSources.clear()
    this.nextScheduleTime = 0
    if (this.currentHtmlAudio) {
      try { this.currentHtmlAudio.pause() } catch {}
      this.currentHtmlAudio = null
    }
    if (hadAudio) {
      this.hasLocalAudio = false
      this.emit('speaking-end')
    }
  }

  private setupEventListeners() {
    this.cleanupFns.push(on('tts:speaking-start', (data) => this.emit('speaking-start', data)))
    this.cleanupFns.push(on('tts:speaking-end', () => {
      if (this.hasLocalAudio) {
        this.checkAllAudioEnded()
      } else {
        this.emit('speaking-end')
      }
    }))
    this.cleanupFns.push(on('tts:error', (error) => this.emit('error', error)))
    this.cleanupFns.push(on('tts:engine-changed', (engine) => this.emit('engine-changed', engine)))
    this.cleanupFns.push(on('tts:voice-changed', (voice) => this.emit('voice-changed', voice)))
    this.cleanupFns.push(on('tts:play-audio-buffer', (payload: { data: string; mimeType: string }) => {
      this.playAudioBuffer(payload)
    }))
  }

  private async playAudioBuffer(payload: { data: string; mimeType: string }) {
    this.hasLocalAudio = true
    try {
      const binary = atob(payload.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }

      if (this.audioCtx?.state === 'suspended') {
        await this.audioCtx.resume()
      }
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        this.nextScheduleTime = 0
      }

      const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0))
      const startTime = Math.max(this.nextScheduleTime, this.audioCtx.currentTime)

      const source = this.audioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.audioCtx.destination)
      this.currentSources.add(source)
      source.onended = () => {
        this.currentSources.delete(source)
        this.checkAllAudioEnded()
      }
      source.start(startTime)

      this.nextScheduleTime = startTime + audioBuffer.duration
    } catch (err) {
      console.warn('[Renderer TTS] AudioContext decode error, fallback to HTMLAudio:', err)
      try {
        const binary = atob(payload.data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const url = URL.createObjectURL(new Blob([bytes.buffer], { type: payload.mimeType }))
        const audio = new Audio(url)
        audio.onended = () => {
          URL.revokeObjectURL(url)
          if (this.currentHtmlAudio === audio) this.currentHtmlAudio = null
          this.checkAllAudioEnded()
        }
        audio.onerror = () => { URL.revokeObjectURL(url) }
        await audio.play()
        this.currentHtmlAudio = audio
      } catch (fallbackErr) {
        console.error('[Renderer TTS] All playback methods failed:', fallbackErr)
      }
    }
  }

  private emit(event: string, ...args: any[]) {
    if (event === 'speaking-start') {
      updateTtsStatus(true).catch(() => {})
    } else if (event === 'speaking-end') {
      updateTtsStatus(false).catch(() => {})
    }
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
    this.stopCurrentAudio()
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