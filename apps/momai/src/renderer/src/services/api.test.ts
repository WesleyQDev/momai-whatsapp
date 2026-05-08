import { describe, it, expect, vi } from 'vitest'

vi.mock('axios', () => ({ default: { create: vi.fn() } }))

vi.mock('./ttsService', () => ({
  getTTSServiceRenderer: vi.fn(() => ({
    speak: vi.fn(),
    stop: vi.fn()
  }))
}))

vi.mock('../utils/text', () => ({
  cleanMomaiActions: vi.fn((s: string) => s)
}))

vi.mock('../constants', () => ({
  API_URL: 'http://localhost:8000'
}))

import { stripEmojisAndMarkdown, safeJsonParse } from './api'

describe('stripEmojisAndMarkdown', () => {
  it('removes emojis', () => {
    expect(stripEmojisAndMarkdown('Hello 😊 world')).toBe('Hello  world')
  })

  it('removes bold markers', () => {
    expect(stripEmojisAndMarkdown('**bold**')).toBe('bold')
  })

  it('removes inline code', () => {
    expect(stripEmojisAndMarkdown('`code`')).toBe('code')
  })

  it('removes italic markers', () => {
    expect(stripEmojisAndMarkdown('*italic*')).toBe('italic')
  })

  it('removes code blocks', () => {
    expect(stripEmojisAndMarkdown('a ```code block``` b')).toBe('a  b')
  })

  it('removes headers', () => {
    expect(stripEmojisAndMarkdown('## header')).toBe('header')
  })

  it('removes links', () => {
    expect(stripEmojisAndMarkdown('[text](url)')).toBe('text')
  })

  it('normalizes 3+ newlines to 2', () => {
    expect(stripEmojisAndMarkdown('a\n\n\n\nb')).toBe('a\n\nb')
  })

  it('removes regular quotes', () => {
    expect(stripEmojisAndMarkdown('"hello"')).toBe('hello')
  })
})

describe('safeJsonParse', () => {
  it('parses valid JSON strings', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses JSON array', () => {
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('returns undefined for invalid JSON', () => {
    expect(safeJsonParse('not json')).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(safeJsonParse(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(safeJsonParse(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(safeJsonParse('')).toBeUndefined()
  })
})
