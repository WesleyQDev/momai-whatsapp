import {
  isToolTraceMessage,
  splitToolTraceContent,
  buildToolTraceContent,
  parseStructuredToolResult,
  extractToolQuery,
  findLastAssistantIndex,
  createAssistantMessageId,
  toCompactJson,
  toolTracePrefix,
  toolTraceTextDelimiter,
} from './chatUtils'
import type { Message } from '../services/api'

describe('isToolTraceMessage', () => {
  it('returns true for assistant msg with TOOL_TRACE:: prefix', () => {
    const msg: Message = {
      role: 'assistant',
      content: `${toolTracePrefix}{"foo":"bar"}`,
      id: '1',
    }
    expect(isToolTraceMessage(msg)).toBe(true)
  })

  it('returns false for user messages with TOOL_TRACE:: prefix', () => {
    const msg: Message = {
      role: 'user',
      content: `${toolTracePrefix}{"foo":"bar"}`,
      id: '2',
    }
    expect(isToolTraceMessage(msg)).toBe(false)
  })

  it('returns false for normal assistant messages', () => {
    const msg: Message = {
      role: 'assistant',
      content: 'hello world',
      id: '3',
    }
    expect(isToolTraceMessage(msg)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isToolTraceMessage(undefined)).toBe(false)
  })
})

describe('splitToolTraceContent', () => {
  it('splits JSON and text parts correctly', () => {
    const json = '{"result":"ok"}'
    const text = 'some output text'
    const content = `${toolTracePrefix}${json}${toolTraceTextDelimiter}${text}`
    const result = splitToolTraceContent(content)
    expect(result).toEqual({ jsonPart: json, textPart: text })
  })

  it('returns null for non-trace content', () => {
    expect(splitToolTraceContent('just a normal message')).toBeNull()
  })

  it('handles empty text part', () => {
    const json = '{"foo":"bar"}'
    const content = `${toolTracePrefix}${json}${toolTraceTextDelimiter}`
    const result = splitToolTraceContent(content)
    expect(result).toEqual({ jsonPart: json, textPart: '' })
  })
})

describe('buildToolTraceContent', () => {
  it('builds full trace content with JSON and text', () => {
    const data = { result: 'done' }
    const text = 'hello'
    const result = buildToolTraceContent(data, text)
    expect(result).toBe(
      `${toolTracePrefix}${JSON.stringify(data)}${toolTraceTextDelimiter}${text}`,
    )
  })

  it('handles empty text', () => {
    const data = { a: 1 }
    const result = buildToolTraceContent(data, '')
    expect(result).toBe(
      `${toolTracePrefix}${JSON.stringify(data)}${toolTraceTextDelimiter}`,
    )
  })
})

describe('parseStructuredToolResult', () => {
  it('returns empty for null/undefined', () => {
    expect(parseStructuredToolResult(null)).toEqual({ result: '', error: '' })
    expect(parseStructuredToolResult(undefined)).toEqual({ result: '', error: '' })
  })

  it('parses string JSON with status: error -> extracts error.message', () => {
    const input = JSON.stringify({ status: 'error', error: { message: 'Something failed' } })
    const result = parseStructuredToolResult(input)
    expect(result).toEqual({ result: '', error: 'Something failed' })
  })

  it('parses object with status: success -> stringifies result', () => {
    const input = { status: 'success', result: { key: 'value' } }
    const result = parseStructuredToolResult(input)
    expect(result).toEqual({ result: JSON.stringify({ key: 'value' }, null, 2), error: '' })
  })

  it('handles plain string values', () => {
    expect(parseStructuredToolResult('just a string')).toEqual({ result: 'just a string', error: '' })
  })

  it('handles invalid JSON strings', () => {
    expect(parseStructuredToolResult('not valid json')).toEqual({ result: 'not valid json', error: '' })
  })
})

describe('extractToolQuery', () => {
  it('extracts from query key', () => {
    expect(extractToolQuery({ query: 'search term' })).toBe('search term')
  })

  it('extracts from q key', () => {
    expect(extractToolQuery({ q: 'quick search' })).toBe('quick search')
  })

  it('extracts from text key', () => {
    expect(extractToolQuery({ text: 'some text' })).toBe('some text')
  })

  it('returns undefined for empty args', () => {
    expect(extractToolQuery({})).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(extractToolQuery(null)).toBeUndefined()
  })

  it('returns undefined when all values are empty', () => {
    expect(extractToolQuery({ query: '', q: '  ', text: '' })).toBeUndefined()
  })
})

describe('findLastAssistantIndex', () => {
  it('finds last assistant message in mixed list', () => {
    const list: Message[] = [
      { role: 'user', content: 'hi', id: '1' },
      { role: 'assistant', content: 'hello', id: '2' },
      { role: 'user', content: 'how are you', id: '3' },
      { role: 'assistant', content: 'good', id: '4' },
    ]
    expect(findLastAssistantIndex(list)).toBe(3)
  })

  it('returns -1 when no assistant messages', () => {
    const list: Message[] = [
      { role: 'user', content: 'hi', id: '1' },
    ]
    expect(findLastAssistantIndex(list)).toBe(-1)
  })

  it('returns -1 for empty list', () => {
    expect(findLastAssistantIndex([])).toBe(-1)
  })
})

describe('createAssistantMessageId', () => {
  it('returns string starting with "assistant:"', () => {
    expect(createAssistantMessageId()).toMatch(/^assistant:/)
  })

  it('returns unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createAssistantMessageId()))
    expect(ids.size).toBe(100)
  })
})

describe('toCompactJson', () => {
  it('stringifies objects', () => {
    expect(toCompactJson({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}')
  })

  it('returns undefined for null/undefined', () => {
    expect(toCompactJson(null)).toBeUndefined()
    expect(toCompactJson(undefined)).toBeUndefined()
  })
})
