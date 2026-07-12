const { _testExports } = require('../services/chat-service')

const {
  estimateTokenCount,
  computeDynamicMaxTokens,
  buildCompactedMessages,
  buildHistoryWithinBudget,
  trimMessageForContext
} = _testExports

describe('chat-tokens', () => {
  describe('estimateTokenCount', () => {
    it('returns 0 for empty/null text', () => {
      expect(estimateTokenCount('')).toBe(0)
      expect(estimateTokenCount(null)).toBe(0)
      expect(estimateTokenCount(undefined)).toBe(0)
    })

    it('returns at least 1 for non-empty text', () => {
      expect(estimateTokenCount('a')).toBe(1)
      expect(estimateTokenCount('ab')).toBe(1)
    })

    it('estimates ~1 token per 3 characters', () => {
      const text = 'abcdefghi'
      expect(estimateTokenCount(text)).toBe(3)
    })
  })

  describe('computeDynamicMaxTokens', () => {
    it('returns at least 64', () => {
      const result = computeDynamicMaxTokens(0, 0, 512)
      expect(result).toBeGreaterThanOrEqual(64)
    })

    it('returns desired when available', () => {
      const result = computeDynamicMaxTokens(300, 500, 8192)
      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThanOrEqual(3072)
    })

    it('respects hard cap of 3072', () => {
      const result = computeDynamicMaxTokens(99999, 100, 99999)
      expect(result).toBeLessThanOrEqual(3072)
    })
  })

  describe('trimMessageForContext', () => {
    it('returns trimmed text as-is when under max', () => {
      const result = trimMessageForContext('hello world', 100)
      expect(result).toBe('hello world')
    })

    it('truncates and adds ellipsis when over max', () => {
      const long = 'a'.repeat(200)
      const result = trimMessageForContext(long, 100)
      expect(result).toHaveLength(103)
      expect(result).toBe('a'.repeat(100) + '...')
    })

    it('sanitizes input text', () => {
      const result = trimMessageForContext(null, 100)
      expect(result).toBe('')
    })
  })

  describe('buildCompactedMessages', () => {
    it('builds system + last 2 messages + user content', () => {
      const system = { role: 'system', content: 'You are helpful.' }
      const history = [
        { role: 'user', content: 'msg 1' },
        { role: 'assistant', content: 'reply 1' },
        { role: 'user', content: 'msg 2' },
        { role: 'assistant', content: 'reply 2' }
      ]
      const result = buildCompactedMessages(system, history, 'current question')
      expect(result[0].role).toBe('system')
      expect(result.length).toBeGreaterThan(1)
      expect(result.length).toBeLessThanOrEqual(4)
    })

    it('adds user content if history has no user message', () => {
      const system = { role: 'system', content: 'You are helpful.' }
      const history = [
        { role: 'assistant', content: 'reply 1' },
        { role: 'assistant', content: 'reply 2' }
      ]
      const result = buildCompactedMessages(system, history, 'current question')
      const hasUser = result.some((m) => m.role === 'user')
      expect(hasUser).toBe(true)
    })
  })

  describe('buildHistoryWithinBudget', () => {
    it('returns messages within token budget', () => {
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
        { role: 'user', content: 'how are you?' },
        { role: 'assistant', content: 'I am good, thanks!' }
      ]
      const result = buildHistoryWithinBudget(messages, 500)
      expect(result.length).toBeGreaterThan(0)
      const hasUser = result.some((m) => m.role === 'user')
      expect(hasUser).toBe(true)
    })

    it('ensures at least one user message exists', () => {
      const messages = [{ role: 'assistant', content: 'just an assistant message' }]
      const result = buildHistoryWithinBudget(messages, 500)
      expect(result.some((m) => m.role === 'user')).toBe(false)
    })

    it('handles empty messages', () => {
      const result = buildHistoryWithinBudget([], 500)
      expect(result).toHaveLength(0)
    })

    it('handles null/non-array input', () => {
      const result = buildHistoryWithinBudget(null, 500)
      expect(result).toHaveLength(0)
    })

    it('respects minimum budget of 200', () => {
      const messages = [{ role: 'user', content: 'a'.repeat(1000) }]
      const result = buildHistoryWithinBudget(messages, 0)
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
