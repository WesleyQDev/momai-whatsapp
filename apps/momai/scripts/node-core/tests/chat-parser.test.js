const { parseLlamaDataLine } = require('../services/chat-service')

describe('chat-parser', () => {
  describe('parseLlamaDataLine', () => {
    it('skips empty payload', () => {
      const result = parseLlamaDataLine('data: ')
      expect(result.type).toBe('skip')
    })

    it('detects [DONE] marker', () => {
      const result = parseLlamaDataLine('data: [DONE]')
      expect(result.type).toBe('done')
    })

    it('extracts token from delta content', () => {
      const line = 'data: {"choices":[{"delta":{"content":"hello"},"finish_reason":null}]}'
      const result = parseLlamaDataLine(line)
      expect(result.type).toBe('token')
      expect(result.token).toBe('hello')
      expect(result.finish_reason).toBeNull()
    })

    it('extracts full message when no delta', () => {
      const line =
        'data: {"choices":[{"message":{"content":"full message"},"finish_reason":"stop"}]}'
      const result = parseLlamaDataLine(line)
      expect(result.type).toBe('token')
      expect(result.token).toBe('full message')
    })

    it('returns error on json.error.message', () => {
      const line = 'data: {"error":{"message":"something went wrong"}}'
      const result = parseLlamaDataLine(line)
      expect(result.type).toBe('error')
      expect(result.error).toBe('something went wrong')
    })

    it('extracts tool_calls from delta', () => {
      const line =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":"{\\"city\\":\\"SP\\"}"}}]},"finish_reason":"tool_calls"}]}'
      const result = parseLlamaDataLine(line)
      expect(result.type).toBe('tool_calls')
      expect(result.tool_calls).toHaveLength(1)
      expect(result.finish_reason).toBe('tool_calls')
    })

    it('returns skip for empty choice content', () => {
      const line = 'data: {"choices":[{"delta":{},"finish_reason":null}]}'
      const result = parseLlamaDataLine(line)
      expect(result.type).toBe('skip')
    })

    it('returns skip on invalid JSON', () => {
      const result = parseLlamaDataLine('data: {not-json}')
      expect(result.type).toBe('skip')
    })

    it('handles non-data prefix gracefully', () => {
      const result = parseLlamaDataLine('event: ping')
      expect(result.type).toBe('skip')
    })
  })
})
