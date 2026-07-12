const { _testExports } = require('../services/chat-service')

const {
  detectLanguageTag,
  normalizeLanguageTag,
  normalizeForMatch,
  resolveResponseLanguage
} = _testExports

describe('chat-language', () => {
  describe('normalizeLanguageTag', () => {
    it('returns pt-BR for null/empty', () => {
      expect(normalizeLanguageTag(null)).toBe('pt-BR')
      expect(normalizeLanguageTag('')).toBe('pt-BR')
      expect(normalizeLanguageTag(undefined)).toBe('pt-BR')
    })

    it('normalizes short tags', () => {
      expect(normalizeLanguageTag('pt')).toBe('pt-BR')
      expect(normalizeLanguageTag('en')).toBe('en')
      expect(normalizeLanguageTag('es')).toBe('es')
      expect(normalizeLanguageTag('fr')).toBe('fr')
      expect(normalizeLanguageTag('de')).toBe('de')
      expect(normalizeLanguageTag('it')).toBe('it')
      expect(normalizeLanguageTag('ja')).toBe('ja')
      expect(normalizeLanguageTag('ko')).toBe('ko')
      expect(normalizeLanguageTag('zh')).toBe('zh-CN')
      expect(normalizeLanguageTag('ru')).toBe('ru')
      expect(normalizeLanguageTag('ar')).toBe('ar')
      expect(normalizeLanguageTag('hi')).toBe('hi')
    })

    it('normalizes full tags by taking the short part', () => {
      expect(normalizeLanguageTag('pt-PT')).toBe('pt-BR')
      expect(normalizeLanguageTag('en-US')).toBe('en')
      expect(normalizeLanguageTag('ES-AR')).toBe('es')
    })

    it('falls back to pt-BR for unknown languages', () => {
      expect(normalizeLanguageTag('xyz')).toBe('pt-BR')
      expect(normalizeLanguageTag('klingon')).toBe('pt-BR')
    })
  })

  describe('normalizeForMatch', () => {
    it('normalizes text by removing accents and lowercasing', () => {
      expect(normalizeForMatch('Olá, Como Vai?')).toBe('ola, como vai?')
      expect(normalizeForMatch(' naïve café ')).toBe(' naive cafe ')
    })

    it('handles null/empty', () => {
      expect(normalizeForMatch(null)).toBe('')
      expect(normalizeForMatch('')).toBe('')
      expect(normalizeForMatch(undefined)).toBe('')
    })
  })

  describe('detectLanguageTag', () => {
    it('returns und for empty/null', () => {
      expect(detectLanguageTag('')).toBe('und')
      expect(detectLanguageTag(null)).toBe('und')
      expect(detectLanguageTag(undefined)).toBe('und')
    })

    it('detects Japanese by katakana/hiragana', () => {
      expect(detectLanguageTag('こんにちは')).toBe('ja')
    })

    it('detects Korean by hangul', () => {
      expect(detectLanguageTag('안녕하세요')).toBe('ko')
    })

    it('detects Chinese by CJK characters', () => {
      expect(detectLanguageTag('你好世界')).toBe('zh-CN')
    })

    it('detects Russian by Cyrillic', () => {
      expect(detectLanguageTag('Привет мир')).toBe('ru')
    })

    it('detects Arabic by Arabic script', () => {
      expect(detectLanguageTag('مرحبا')).toBe('ar')
    })

    it('detects Hindi by Devanagari', () => {
      expect(detectLanguageTag('नमस्ते')).toBe('hi')
    })

    it('detects pt-BR by word hints', () => {
      expect(detectLanguageTag('Olá, como você está?')).toBe('pt-BR')
    })

    it('detects English by word hints', () => {
      expect(detectLanguageTag('Hello, how are you?')).toBe('en')
    })

    it('detects Spanish by word hints', () => {
      expect(detectLanguageTag('Hola, necesito ayuda por favor')).toBe('es')
    })

    it('detects French by word hints', () => {
      expect(detectLanguageTag('Bonjour, comment allez-vous?')).toBe('fr')
    })

    it('returns und when no language matches', () => {
      expect(detectLanguageTag('xyz abc 123')).toBe('und')
    })
  })

  describe('resolveResponseLanguage', () => {
    it('uses detected language from content', () => {
      const result = resolveResponseLanguage('Hello world, how are you?', 'test-thread')
      expect(result).toBe('en')
    })

    it('falls back to thread message history when content is und', () => {
      const { _testExports } = require('../services/chat-service')
      const { getThreadMessages, appendMessage } = _testExports
      const threadId = 'test-resolve-lang-' + Date.now()
      appendMessage(threadId, 'user', 'Hello, how are you today?')
      const result = resolveResponseLanguage('12345', threadId)
      expect(result).toBe('en')
    })
  })
})
