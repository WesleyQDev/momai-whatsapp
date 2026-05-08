import { describe, it, expect } from 'vitest'
import { lexicalScore, buildSnippet } from './lexical-search'

describe('lexicalScore', () => {
  it('returns 0 when source is null', () => {
    expect(lexicalScore(null, 'hello')).toBe(0)
  })

  it('returns 0 when source is undefined', () => {
    expect(lexicalScore(undefined, 'hello')).toBe(0)
  })

  it('returns 0 when source is empty string', () => {
    expect(lexicalScore('', 'hello')).toBe(0)
  })

  it('returns 0 when query is empty', () => {
    expect(lexicalScore('hello world', '')).toBe(0)
  })

  it('returns 1 for a single match', () => {
    expect(lexicalScore('hello world', 'hello')).toBe(1)
  })

  it('returns count for multiple matches', () => {
    expect(lexicalScore('hello hello hello', 'hello')).toBe(3)
  })

  it('is case insensitive', () => {
    expect(lexicalScore('Hello World', 'hello')).toBe(1)
  })

  it('returns 0 when query is not found', () => {
    expect(lexicalScore('hello world', 'goodbye')).toBe(0)
  })
})

describe('buildSnippet', () => {
  it('returns empty string for empty content', () => {
    expect(buildSnippet('', 'hello')).toBe('')
  })

  it('returns first 240 chars when query not found', () => {
    const content = 'a'.repeat(500)
    const result = buildSnippet(content, 'nonexistent')
    expect(result).toBe(content.slice(0, 240))
    expect(result.length).toBe(240)
  })

  it('returns content centered around match', () => {
    const prefix = 'x'.repeat(100)
    const match = 'MATCH_HERE'
    const suffix = 'y'.repeat(100)
    const content = prefix + match + suffix
    const result = buildSnippet(content, match.toLowerCase())
    expect(result).toContain(match)
    expect(result.length).toBeLessThan(content.length)
  })

  it('handles content shorter than snippet window', () => {
    const content = 'short content with a match word'
    const result = buildSnippet(content, 'match')
    expect(result).toBe(content)
  })

  it('compacts whitespace before processing', () => {
    const result = buildSnippet('hello    world\n\nfoo', 'world')
    expect(result).toContain('world')
    expect(result).not.toContain('    ')
    expect(result).not.toContain('\n')
  })
})
