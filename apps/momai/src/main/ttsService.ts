import { EventEmitter } from 'events'

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

export class TTSService extends EventEmitter {
  private config: TTSConfig
  private isSpeaking: boolean = false
  private currentEngine: TTSEngine
  private sayInstance: any = null
  private edgeTTSInstance: any = null
  private voiceMaps: Map<TTSEngine, Map<string, string>> = new Map()

  constructor(config: Partial<TTSConfig> = {}) {
    super()
    this.config = {
      engine: config.engine || 'kokoro',
      voice: config.voice || 'pf_dora',
      speed: config.speed || 1.0,
      enabled: config.enabled !== false
    }
    this.currentEngine = this.config.engine
    this.initializeEngines()
  }

  private async initializeEngines() {
    try {
      // Lazy load para evitar problemas de bundling
      this.sayInstance = require('say')
      this.edgeTTSInstance = require('edge-tts-universal')

      this.emit('ready')
    } catch (error) {
      console.error('[TTSService] Erro ao inicializar engines:', error)
      this.emit('error', error)
    }
  }

  async getAvailableVoices(engine?: TTSEngine): Promise<TTSVoice[]> {
    const targetEngine = engine || this.currentEngine

    switch (targetEngine) {
      case 'say':
        return this.getSayVoices()
      case 'edge-tts':
        return this.getEdgeVoices()
      case 'kokoro':
        return this.getKokoroVoices()
      default:
        return []
    }
  }

  private async getSayVoices(): Promise<TTSVoice[]> {
    return new Promise<TTSVoice[]>((resolve) => {
      this.sayInstance.getInstalledVoices((err: any, voices: string[]) => {
        if (err) {
          console.error('[TTSService] Erro ao obter vozes say.js:', err)
          resolve([])
          return
        }

        const voiceMap = new Map<string, string>()
        const formattedVoices: TTSVoice[] = voices.map((voice, index) => {
          const id = `say-${index}`
          voiceMap.set(id, voice)
          return {
            id,
            name: voice,
            language: 'unknown',
            gender: undefined
          }
        })

        this.voiceMaps.set('say', voiceMap)
        resolve(formattedVoices)
      })
    })
  }

  private async getEdgeVoices(): Promise<TTSVoice[]> {
    try {
      // edge-tts-universal não tem método direto para listar vozes
      // Vamos retornar vozes comuns do Microsoft Edge
      const commonVoices: TTSVoice[] = [
        {
          id: 'en-US-JennyNeural',
          name: 'Jenny (US English)',
          language: 'en-US',
          gender: 'female'
        },
        { id: 'en-US-GuyNeural', name: 'Guy (US English)', language: 'en-US', gender: 'male' },
        {
          id: 'en-GB-SoniaNeural',
          name: 'Sonia (UK English)',
          language: 'en-GB',
          gender: 'female'
        },
        { id: 'en-GB-RyanNeural', name: 'Ryan (UK English)', language: 'en-GB', gender: 'male' },
        {
          id: 'pt-BR-FranciscaNeural',
          name: 'Juliana (Portuguese)',
          language: 'pt-BR',
          gender: 'female'
        },
        {
          id: 'pt-BR-AntonioNeural',
          name: 'Fernando (Portuguese)',
          language: 'pt-BR',
          gender: 'male'
        },
        { id: 'es-ES-ElviraNeural', name: 'Elvira (Spanish)', language: 'es-ES', gender: 'female' },
        { id: 'es-ES-AlvaroNeural', name: 'Alvaro (Spanish)', language: 'es-ES', gender: 'male' },
        { id: 'it-IT-ElsaNeural', name: 'Elsa (Italian)', language: 'it-IT', gender: 'female' },
        { id: 'it-IT-DiegoNeural', name: 'Diego (Italian)', language: 'it-IT', gender: 'male' }
      ]

      return commonVoices
    } catch (error) {
      console.error('[TTSService] Erro ao obter vozes edge-tts:', error)
      return []
    }
  }

  private async getKokoroVoices(): Promise<TTSVoice[]> {
    // Vozes do Kokoro (ainda depende do Python, mas mantemos compatibilidade)
    const kokoroVoices: TTSVoice[] = [
      { id: 'pf_dora', name: 'Dora', language: 'pt-BR', gender: 'female', trait: 'suggested' },
      { id: 'pm_alex', name: 'Alex', language: 'pt-BR', gender: 'male' },
      { id: 'pm_santa', name: 'Santa', language: 'pt-BR', gender: 'male' },
      { id: 'af_heart', name: 'Heart', language: 'en-US', gender: 'female' },
      { id: 'af_bella', name: 'Bella', language: 'en-US', gender: 'female' },
      { id: 'am_adam', name: 'Adam', language: 'en-US', gender: 'male' },
      { id: 'am_fenrir', name: 'Fenrir', language: 'en-US', gender: 'male' },
      { id: 'bf_alice', name: 'Alice', language: 'en-GB', gender: 'female' },
      { id: 'bm_george', name: 'George', language: 'en-GB', gender: 'male' },
      { id: 'ef_dora', name: 'Dora', language: 'es', gender: 'female' },
      { id: 'em_alex', name: 'Alex', language: 'es', gender: 'male' },
      { id: 'if_sara', name: 'Sara', language: 'it', gender: 'female' },
      { id: 'im_nicola', name: 'Nicola', language: 'it', gender: 'male' }
    ]

    return kokoroVoices
  }

  async speak(text: string, engine?: TTSEngine): Promise<void> {
    console.log(
      `[TTSService] speak() called engine=${engine} current=${this.currentEngine} enabled=${this.config.enabled}`
    )
    if (!this.config.enabled || !text || text.trim().length < 3) {
      console.log('[TTSService] speak() early return: disabled or too short')
      return
    }

    const targetEngine = engine || this.currentEngine
    console.log('[TTSService] speak() targetEngine:', targetEngine)

    this.isSpeaking = true
    this.emit('speaking-start', { text, engine: targetEngine })

    try {
      switch (targetEngine) {
        case 'say':
          await this.speakWithSay(text)
          break
        case 'edge-tts':
          await this.speakWithEdgeTTS(text)
          break
        case 'kokoro':
          await this.speakWithKokoro(text)
          break
        default:
          throw new Error(`Engine desconhecido: ${targetEngine}`)
      }
    } catch (error) {
      console.error('[TTSService] Erro ao falar:', error)
      this.emit('error', error)
      throw error
    } finally {
      this.isSpeaking = false
      this.emit('speaking-end')
    }
  }

  private async speakWithSay(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let voice: string | undefined
      const voiceMap = this.voiceMaps.get('say')
      if (voiceMap && voiceMap.has(this.config.voice)) {
        voice = voiceMap.get(this.config.voice)
      } else if (this.config.voice && this.config.voice.startsWith('say-')) {
        // Fallback: try to get voice by index from the map
        const index = parseInt(this.config.voice.replace('say-', ''), 10)
        const voices = Array.from(voiceMap?.values() || [])
        voice = voices[index] || voices[0]
      }

      console.log('[TTSService] say.js voice:', voice || '(default)')

      this.sayInstance.speak(text, voice, this.config.speed, (err: any) => {
        if (err) {
          console.error('[TTSService] say.js error:', err.message)
          // Fallback: try without specifying voice
          if (voice) {
            console.log('[TTSService] Retrying say.js with default voice...')
            this.sayInstance.speak(text, undefined, this.config.speed, (err2: any) => {
              if (err2) reject(err2)
              else resolve()
            })
          } else {
            reject(err)
          }
        } else {
          resolve()
        }
      })
    })
  }

  // NOTE: Duplicates stripEmojisAndMarkdown in src/renderer/src/utils/text.ts
  // Main process cannot import renderer code; keep in sync manually.
  private sanitizeForTTS(text: string): string {
    return text
      .replace(/\p{Extended_Pictographic}/gu, '') // Remove emojis
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/^#{1,6}\s+/gm, '') // Remove headers
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1') // Remove bold italic
      .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
      .replace(/__(.+?)__/g, '$1') // Remove bold underscore
      .replace(/\*(.+?)\*/g, '$1') // Remove italic
      .replace(/_(.+?)_/g, '$1') // Remove italic underscore
      .replace(/~~(.+?)~~/g, '$1') // Remove strikethrough
      .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1') // Remove links
      .replace(/^\s*[-*+]\s+/gm, '') // Remove list bullets
      .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered lists
      .replace(/^>+\s?/gm, '') // Remove blockquotes
      .replace(/---+|\*\*\*+|___+/g, '') // Remove horizontal rules
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
      .replace(/[*_~#]/g, ' ') // Remove remaining markdown chars
      .replace(/["""''']/g, '') // Remove fancy quotes
      .trim()
  }

  private splitIntoSentences(text: string): string[] {
    if (!text) return []

    // Limpeza extra para evitar problemas no split
    const cleanText = text.replace(/\s+/g, ' ').trim()

    // Divide por pontuação final seguida de espaço ou fim de linha
    // Tenta evitar dividir em abreviações comuns (Sr. Dra. etc)
    const sentences = cleanText
      .replace(/([.!?])\s+/g, '$1|')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    // Se uma sentença for muito longa (> 200 caracteres), tenta dividir por vírgula ou ponto e vírgula
    const finalSentences: string[] = []
    for (const s of sentences) {
      if (s.length > 200) {
        const subParts = s.replace(/([,;])\s+/g, '$1|').split('|')
        finalSentences.push(...subParts.map((p) => p.trim()).filter((p) => p.length > 0))
      } else {
        finalSentences.push(s)
      }
    }

    return finalSentences
  }

  private async speakWithEdgeTTS(text: string): Promise<void> {
    try {
      const sanitizedText = this.sanitizeForTTS(text)
      const sentences = this.splitIntoSentences(sanitizedText)

      if (sentences.length === 0) return

      console.log(`[TTSService] EdgeTTS START: ${sentences.length} sentences`)
      const { EdgeTTS } = this.edgeTTSInstance

      const edgeVoice = this.mapKokoroToEdgeVoice(this.config.voice)
      const ratePercent = Math.round((this.config.speed - 1) * 100)
      const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`

      for (let i = 0; i < sentences.length; i++) {
        if (!this.isSpeaking) {
          console.log('[TTSService] EdgeTTS aborted (isSpeaking=false)')
          break
        }

        const sentence = sentences[i]
        // Ignorar sentenças muito curtas (menos de 2 caracteres alfanuméricos)
        if (sentence.replace(/[^a-zA-Z0-9]/g, '').length < 2) continue

        console.log(`[TTSService] EdgeTTS Synthesis [${i + 1}/${sentences.length}]:`, sentence.slice(0, 40) + '...')
        
        const edge = new EdgeTTS(sentence, edgeVoice, { rate: rateStr })
        const result = await edge.synthesize()

        if (!this.isSpeaking) break

        const arrayBuffer = await result.audio.arrayBuffer()
        const audioBuffer = Buffer.from(arrayBuffer)

        if (audioBuffer && audioBuffer.length > 0) {
          console.log(`[TTSService] Emitting audio buffer for sentence ${i + 1}, len: ${audioBuffer.length}`)
          this.emit('play-audio-buffer', audioBuffer)
        }
      }

      console.log('[TTSService] EdgeTTS ALL sentences processed')
    } catch (error) {
      console.error('[TTSService] Erro ao falar com edge-tts:', error)
      throw error
    }
  }

  private async speakWithKokoro(text: string): Promise<void> {
    // Kokoro ainda depende do Python
    // Vamos emitir um evento para o processo Python
    this.emit('kokoro-request', { text, voice: this.config.voice, speed: this.config.speed })
  }

  private mapKokoroToEdgeVoice(kokoroVoice: string): string {
    // Mapeamento de vozes Kokoro para vozes do Edge TTS
    const voiceMap: Record<string, string> = {
      pf_dora: 'pt-BR-FranciscaNeural',
      pm_alex: 'pt-BR-AntonioNeural',
      af_heart: 'en-US-JennyNeural',
      af_bella: 'en-US-JennyNeural',
      am_adam: 'en-US-GuyNeural',
      am_fenrir: 'en-US-GuyNeural',
      bf_alice: 'en-GB-SoniaNeural',
      bm_george: 'en-GB-RyanNeural',
      ef_dora: 'es-ES-ElviraNeural',
      em_alex: 'es-ES-AlvaroNeural',
      if_sara: 'it-IT-ElsaNeural',
      im_nicola: 'it-IT-DiegoNeural'
    }

    // Se já for uma voz Edge (contém 'Neural'), usar diretamente
    if (kokoroVoice && kokoroVoice.includes('Neural')) {
      return kokoroVoice
    }

    return voiceMap[kokoroVoice] || 'en-US-JennyNeural'
  }

  stop(): void {
    if (this.isSpeaking) {
      this.sayInstance?.stop()
      this.isSpeaking = false
      this.emit('speaking-end')
    }
  }

  setEngine(engine: TTSEngine): void {
    this.currentEngine = engine
    this.config.engine = engine
    this.emit('engine-changed', engine)
  }

  setVoice(voice: string): void {
    this.config.voice = voice
    this.emit('voice-changed', voice)
  }

  setSpeed(speed: number): void {
    this.config.speed = Math.max(0.1, Math.min(3.0, speed))
    this.emit('speed-changed', this.config.speed)
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    if (!enabled) {
      this.stop()
    }
    this.emit('enabled-changed', enabled)
  }

  getConfig(): TTSConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<TTSConfig>): void {
    if (config.engine !== undefined) {
      this.setEngine(config.engine)
    }
    if (config.voice !== undefined) {
      this.setVoice(config.voice)
    }
    if (config.speed !== undefined) {
      this.setSpeed(config.speed)
    }
    if (config.enabled !== undefined) {
      this.setEnabled(config.enabled)
    }
  }

  isCurrentlySpeaking(): boolean {
    return this.isSpeaking
  }

  getSupportedEngines(): TTSEngine[] {
    return ['kokoro', 'edge-tts', 'say']
  }

  getEngineInfo(engine: TTSEngine): { name: string; description: string; requiresPython: boolean } {
    const info = {
      kokoro: {
        name: 'Kokoro (Local)',
        description: 'Alta qualidade, requer Python',
        requiresPython: true
      },
      'edge-tts': {
        name: 'Edge TTS (Online)',
        description: 'Alta qualidade, requer internet',
        requiresPython: false
      },
      say: {
        name: 'Say.js (Local)',
        description: 'Voz do sistema, sem dependências',
        requiresPython: false
      }
    }

    return info[engine] || { name: engine, description: '', requiresPython: false }
  }
}

// Singleton instance
let ttsServiceInstance: TTSService | null = null

export function getTTSService(config?: Partial<TTSConfig>): TTSService {
  if (!ttsServiceInstance) {
    ttsServiceInstance = new TTSService(config)
  }
  return ttsServiceInstance
}

export function resetTTSService(): void {
  if (ttsServiceInstance) {
    ttsServiceInstance.removeAllListeners()
    ttsServiceInstance = null
  }
}
