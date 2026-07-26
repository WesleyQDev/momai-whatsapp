const { _testExports } = require('../services/chat-service')

const {
  buildLocalizedFallbackReply,
  humanizeFallbackReason,
  generateFallbackReply,
  isLikelyIncompleteResponse
} = _testExports

describe('chat-fallback', () => {
  describe('buildLocalizedFallbackReply', () => {
    it('returns empty message prompt in pt-BR', () => {
      const result = buildLocalizedFallbackReply({ key: 'empty', language: 'pt-BR' })
      expect(result).toContain('pergunta')
    })

    it('returns empty message prompt in en', () => {
      const result = buildLocalizedFallbackReply({ key: 'empty', language: 'en' })
      expect(result).toContain('question')
    })

    it('returns empty message prompt in es', () => {
      const result = buildLocalizedFallbackReply({ key: 'empty', language: 'es' })
      expect(result).toContain('pergunta')
    })

    it('returns greeting with user name in pt-BR', () => {
      const result = buildLocalizedFallbackReply({
        key: 'greeting',
        language: 'pt-BR',
        userName: 'Wesley'
      })
      expect(result).toContain('Wesley')
    })

    it('returns greeting with user name in en', () => {
      const result = buildLocalizedFallbackReply({
        key: 'greeting',
        language: 'en',
        userName: 'Wesley'
      })
      expect(result).toContain('Wesley')
    })

    it('returns reason message with the reason in pt-BR', () => {
      const result = buildLocalizedFallbackReply({
        key: 'reason',
        summary: 'test',
        reason: 'model unavailable',
        language: 'pt-BR'
      })
      expect(result).toContain('Não foi possível conectar ao modelo local')
    })

    it('returns with_memory message in pt-BR', () => {
      const result = buildLocalizedFallbackReply({
        key: 'with_memory',
        summary: 'test',
        language: 'pt-BR'
      })
      expect(result).toContain('test')
      expect(result).toContain('notas')
    })
  })

  describe('humanizeFallbackReason', () => {
    it('translates context size error in pt', () => {
      const result = humanizeFallbackReason('exceeds the available context size', 'pt-BR')
      expect(result).toContain('contexto')
    })

    it('translates context size error in en', () => {
      const result = humanizeFallbackReason('exceeds the available context size', 'en')
      expect(result).toContain('context')
    })

    it('translates healthcheck timeout in pt', () => {
      const result = humanizeFallbackReason('healthcheck timeout exceeded', 'pt-BR')
      expect(result).toContain('demorou')
    })

    it('translates llama unavailable in en', () => {
      const result = humanizeFallbackReason('llama unavailable', 'en')
      expect(result).toContain('unavailable')
    })

    it('falls back to generic message', () => {
      const result = humanizeFallbackReason('unknown reason', 'pt-BR')
      expect(result).toContain('falha')
    })
  })

  describe('generateFallbackReply', () => {
    it('handles empty content with empty reply', () => {
      const result = generateFallbackReply('', null, null, 'pt-BR')
      expect(result.length).toBeGreaterThan(0)
    })

    it('handles null content', () => {
      const result = generateFallbackReply(null, null, null, 'pt-BR')
      expect(result.length).toBeGreaterThan(0)
    })

    it('returns greeting for greeting-style content', () => {
      const result = generateFallbackReply('Oi!', null, null, 'pt-BR')
      expect(result.toLowerCase()).toMatch(/oi|estou|online/)
    })

    it('returns hello greeting in English', () => {
      const result = generateFallbackReply('Hello', null, null, 'en')
      expect(result.toLowerCase()).toContain('hi')
    })

    it('includes summary in response', () => {
      const result = generateFallbackReply('What is the weather in Tokyo?', null, null, 'en')
      expect(result).toContain('Tokyo')
    })

    it('truncates long summaries', () => {
      const longContent = 'a'.repeat(500)
      const result = generateFallbackReply(longContent, null, null, 'en')
      expect(result).toContain('...')
    })

    it('handles memory context', () => {
      const result = generateFallbackReply('question', 'memory here', null, 'pt-BR')
      expect(result).toContain('notas')
    })
  })

  describe('isLikelyIncompleteResponse', () => {
    it('returns false for empty text', () => {
      expect(isLikelyIncompleteResponse('', null)).toBe(false)
      expect(isLikelyIncompleteResponse(null, null)).toBe(false)
    })

    it('returns true for finishReason=length', () => {
      expect(isLikelyIncompleteResponse('some text', 'length')).toBe(true)
    })

    it('returns true for unclosed code fence', () => {
      const text = '```js\nconsole.log("test")'
      expect(isLikelyIncompleteResponse(text, 'stop')).toBe(true)
    })

    it('returns false for balanced code fences', () => {
      const text = '```js\nconsole.log("test")\n```'
      expect(isLikelyIncompleteResponse(text, 'stop')).toBe(false)
    })

    it('returns true for unclosed html tag', () => {
      const text = '<html>\n<body>\nhello'
      expect(isLikelyIncompleteResponse(text, 'stop')).toBe(true)
    })

    it('returns true for trailing open bracket', () => {
      const text = 'function() { return ['
      expect(isLikelyIncompleteResponse(text, 'stop')).toBe(true)
    })

    it('returns false when text ends with period', () => {
      expect(isLikelyIncompleteResponse('Hello world.', 'stop')).toBe(false)
    })
  })
})
