const { _testExports } = require('../services/chat-service')

const {
  shouldExposeSkillTools,
  normalizeDiscoveryText,
  buildToolResultPreview,
  pickToolSkillIds,
  shouldPreferSilentForCodeRequest,
  containsCodeLikeContent
} = _testExports

describe('chat-skills-utils', () => {
  describe('shouldExposeSkillTools', () => {
    it('returns false for empty selected skills', () => {
      expect(shouldExposeSkillTools('hello', [], null)).toBe(false)
    })

    it('returns true when selected skills is non-empty', () => {
      expect(shouldExposeSkillTools('hello', [{ id: 'weather' }], null)).toBe(true)
    })

    it('ignores skillRegistry parameter (pure discovery-driven)', () => {
      const skills = [{ id: 'weather' }]
      expect(shouldExposeSkillTools('hello', skills, null)).toBe(true)
      expect(shouldExposeSkillTools('hello', skills, {})).toBe(true)
    })
  })

  describe('normalizeDiscoveryText', () => {
    it('removes [INSTRUCAO: ...] prefix', () => {
      const result = normalizeDiscoveryText('[INSTRUCAO: test]\nActual content')
      expect(result).toBe('Actual content')
    })

    it('preserves text without prefix', () => {
      const result = normalizeDiscoveryText('Just regular text')
      expect(result).toBe('Just regular text')
    })

    it('handles empty input', () => {
      expect(normalizeDiscoveryText('')).toBe('')
      expect(normalizeDiscoveryText(null)).toBe('')
    })
  })

  describe('buildToolResultPreview', () => {
    it('returns web sources titles joined', () => {
      const result = buildToolResultPreview({
        webSources: [
          { title: 'First source' },
          { title: 'Second source' },
          { title: 'Third source' },
          { title: 'Fourth source' }
        ]
      })
      expect(result).toContain('First source')
      expect(result).toContain('Second source')
      expect(result).toContain('Third source')
      expect(result).not.toContain('Fourth source')
    })

    it('returns instruction preview when no webSources', () => {
      const result = buildToolResultPreview({
        instruction: 'do this thing'
      })
      expect(result).toBe('do this thing')
    })

    it('truncates long instructions', () => {
      const long = 'a'.repeat(300)
      const result = buildToolResultPreview({ instruction: long })
      expect(result.length).toBeLessThanOrEqual(220)
    })

    it('returns empty string for null result', () => {
      expect(buildToolResultPreview(null)).toBe('')
      expect(buildToolResultPreview({})).toBe('')
    })
  })

  describe('pickToolSkillIds', () => {
    it('returns discovered skills sorted by score when no routed', () => {
      const result = pickToolSkillIds({
        discoveredSkillIds: ['a', 'b', 'c'],
        routedSkillId: null,
        topScores: { a: 0.5, b: 0.9, c: 0.7 },
        maxSkills: 5
      })
      expect(result).toEqual(['b', 'c', 'a'])
    })

    it('puts routed skill first then fills with discoveries', () => {
      const result = pickToolSkillIds({
        discoveredSkillIds: ['a', 'b', 'c'],
        routedSkillId: 'x',
        topScores: { a: 0.5, b: 0.9, c: 0.7 }
      })
      expect(result[0]).toBe('x')
      expect(result.length).toBeLessThanOrEqual(2)
    })

    it('respects maxSkills', () => {
      const result = pickToolSkillIds({
        discoveredSkillIds: ['a', 'b', 'c', 'd', 'e'],
        routedSkillId: null,
        topScores: { a: 0.5, b: 0.9, c: 0.7, d: 0.6, e: 0.4 },
        maxSkills: 2
      })
      expect(result).toHaveLength(2)
    })

    it('deduplicates', () => {
      const result = pickToolSkillIds({
        discoveredSkillIds: ['a', 'b', 'c', 'a'],
        routedSkillId: null,
        topScores: { a: 0.5, b: 0.9 },
        maxSkills: 4
      })
      expect(new Set(result).size).toBe(result.length)
    })
  })

  describe('shouldPreferSilentForCodeRequest', () => {
    it('detects Portuguese code keywords', () => {
      expect(shouldPreferSilentForCodeRequest('escreve um código em javascript')).toBe(true)
      expect(shouldPreferSilentForCodeRequest('crie um snippet python')).toBe(true)
    })

    it('detects English code keywords', () => {
      expect(shouldPreferSilentForCodeRequest('write a code snippet')).toBe(true)
      expect(shouldPreferSilentForCodeRequest('show me html css')).toBe(true)
      expect(shouldPreferSilentForCodeRequest('react component example')).toBe(true)
    })

    it('returns false for non-code requests', () => {
      expect(shouldPreferSilentForCodeRequest('what is the weather')).toBe(false)
      expect(shouldPreferSilentForCodeRequest('hello world')).toBe(false)
    })

    it('handles empty input', () => {
      expect(shouldPreferSilentForCodeRequest('')).toBe(false)
      expect(shouldPreferSilentForCodeRequest(null)).toBe(false)
    })
  })

  describe('containsCodeLikeContent', () => {
    it('detects code fences', () => {
      expect(containsCodeLikeContent('look: ```js\ncode```')).toBe(true)
    })

    it('detects unclosed code fences', () => {
      expect(containsCodeLikeContent('look: ```js')).toBe(true)
    })

    it('detects html doctype', () => {
      expect(containsCodeLikeContent('<!doctype html>\nhello')).toBe(true)
    })

    it('detects html tags', () => {
      expect(containsCodeLikeContent('<div>content</div>')).toBe(true)
      expect(containsCodeLikeContent('<script>test</script>')).toBe(true)
    })

    it('returns false for plain text', () => {
      expect(containsCodeLikeContent('just regular text')).toBe(false)
    })

    it('handles empty/null', () => {
      expect(containsCodeLikeContent('')).toBe(false)
      expect(containsCodeLikeContent(null)).toBe(false)
    })
  })
})
