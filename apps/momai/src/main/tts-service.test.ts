import { describe, it, expect, vi } from 'vitest'
import { TTSService } from './ttsService'

vi.mock('say', () => ({ default: { speak: vi.fn(), stop: vi.fn(), getInstalledVoices: vi.fn() } }))
vi.mock('edge-tts-universal', () => ({ default: { EdgeTTS: vi.fn() } }))

function createService(): TTSService {
  return new TTSService({ enabled: false })
}

describe('sanitizeForTTS', () => {
  it('removes emojis', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('Hello 👋 world 🌍')
    expect(result).toBe('Hello  world')
  })

  it('removes markdown links but keeps label text', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('[label](url)')
    expect(result).toBe('label')
  })

  it('removes bold formatting with asterisks', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('**bold**')
    expect(result).toBe('bold')
  })

  it('removes bold formatting with underscores', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('__bold__')
    expect(result).toBe('bold')
  })

  it('removes italic formatting with asterisks', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('*italic*')
    expect(result).toBe('italic')
  })

  it('removes italic formatting with underscores', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('_italic_')
    expect(result).toBe('italic')
  })

  it('removes code blocks', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('```code```')
    expect(result).toBe('')
  })

  it('converts inline code to plain text', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('text `code` here')
    expect(result).toBe('text code here')
  })

  it('removes headers', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('# Title')
    expect(result).toBe('Title')
  })

  it('removes horizontal rules', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('---')
    expect(result).toBe('')
  })

  it('normalizes excessive newlines', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('a\n\n\n\nb')
    expect(result).toBe('a\n\nb')
  })

  it('trims result', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('  hello  ')
    expect(result).toBe('hello')
  })

  it('removes list markers', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('- item')
    expect(result).toBe('item')
  })

  it('removes blockquotes', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('> text')
    expect(result).toBe('text')
  })

  it('removes strikethrough', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('~~text~~')
    expect(result).toBe('text')
  })

  it('removes image markdown', () => {
    const service = createService()
    const result = (service as any).sanitizeForTTS('![alt](url)')
    expect(result).toBe('alt')
  })
})

describe('mapKokoroToEdgeVoice', () => {
  it('maps pf_dora to pt-BR-FranciscaNeural', () => {
    const service = createService()
    const result = (service as any).mapKokoroToEdgeVoice('pf_dora')
    expect(result).toBe('pt-BR-FranciscaNeural')
  })

  it('maps pm_alex to pt-BR-AntonioNeural', () => {
    const service = createService()
    const result = (service as any).mapKokoroToEdgeVoice('pm_alex')
    expect(result).toBe('pt-BR-AntonioNeural')
  })

  it('maps af_heart to en-US-JennyNeural', () => {
    const service = createService()
    const result = (service as any).mapKokoroToEdgeVoice('af_heart')
    expect(result).toBe('en-US-JennyNeural')
  })

  it('maps bf_alice to en-GB-SoniaNeural', () => {
    const service = createService()
    const result = (service as any).mapKokoroToEdgeVoice('bf_alice')
    expect(result).toBe('en-GB-SoniaNeural')
  })

  it('returns voice directly if it already contains Neural', () => {
    const service = createService()
    const result = (service as any).mapKokoroToEdgeVoice('en-US-GuyNeural')
    expect(result).toBe('en-US-GuyNeural')
  })

  it('returns default for unknown voices', () => {
    const service = createService()
    const result = (service as any).mapKokoroToEdgeVoice('unknown_voice')
    expect(result).toBe('en-US-JennyNeural')
  })
})
