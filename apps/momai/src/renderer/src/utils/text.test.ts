import { cleanMomaiActions, stripMarkdown } from './text'

describe('cleanMomaiActions', () => {
  it('removes __MOMAI_ACTIONS__ marker and joins parts', () => {
    const result = cleanMomaiActions('Hello __MOMAI_ACTIONS__ World')
    expect(result).toBe('Hello\n\nWorld')
  })

  it('handles text without marker (passes through)', () => {
    const result = cleanMomaiActions('Just a normal message')
    expect(result).toBe('Just a normal message')
  })

  it('handles multiple markers', () => {
    const result = cleanMomaiActions('a __MOMAI_ACTIONS__ b __MOMAI_ACTIONS__ c')
    expect(result).toBe('a\n\nb\n\nc')
  })

  it('returns empty string for non-string input', () => {
    expect(cleanMomaiActions(undefined as unknown as string)).toBe('')
    expect(cleanMomaiActions(null as unknown as string)).toBe('')
    expect(cleanMomaiActions(123 as unknown as string)).toBe('')
  })

  it('trims whitespace', () => {
    const result = cleanMomaiActions('  leading and trailing  ')
    expect(result).toBe('leading and trailing')
  })
})

describe('stripMarkdown', () => {
  it('removes __MOMAI_ACTIONS__ blocks entirely', () => {
    const result = stripMarkdown('Hello __MOMAI_ACTIONS__ {"action":"test"}')
    expect(result).toBe('Hello')
  })

  it('removes bold markers', () => {
    const result = stripMarkdown('This is **bold** text')
    expect(result).toBe('This is bold text')
  })

  it('removes italic markers', () => {
    const result = stripMarkdown('This is *italic* text')
    expect(result).toBe('This is italic text')
  })

  it('removes code blocks', () => {
    const result = stripMarkdown('Text ```code block``` more text')
    expect(result).toBe('Text  more text')
  })

  it('converts inline code', () => {
    const result = stripMarkdown('Use the `foo()` function')
    expect(result).toBe('Use the foo() function')
  })

  it('removes headers', () => {
    expect(stripMarkdown('# Title')).toBe('Title')
    expect(stripMarkdown('## Subtitle')).toBe('Subtitle')
    expect(stripMarkdown('### Section')).toBe('Section')
  })

  it('removes links but keeps labels', () => {
    const result = stripMarkdown('Click [here](https://example.com) for info')
    expect(result).toBe('Click here for info')
  })

  it('removes list markers', () => {
    const result = stripMarkdown('- item one\n- item two')
    expect(result).toBe('item one\nitem two')
  })

  it('removes numbered lists', () => {
    const result = stripMarkdown('1. first\n2. second')
    expect(result).toBe('first\nsecond')
  })

  it('removes horizontal rules', () => {
    const result = stripMarkdown('Before\n---\nAfter')
    expect(result).toBe('Before\n\nAfter')
  })

  it('normalizes excessive newlines (3+ to 2)', () => {
    const result = stripMarkdown('a\n\n\nb\n\n\n\nc')
    expect(result).toBe('a\n\nb\n\nc')
  })

  it('trims final result', () => {
    const result = stripMarkdown('  hello world  ')
    expect(result).toBe('hello world')
  })

  it('removes bold italic markers', () => {
    const result = stripMarkdown('This is ***bold italic*** text')
    expect(result).toBe('This is bold italic text')
  })

  it('removes strikethrough markers', () => {
    const result = stripMarkdown('This is ~~strikethrough~~ text')
    expect(result).toBe('This is strikethrough text')
  })

  it('removes blockquotes', () => {
    const result = stripMarkdown('> quoted text\n> more quote')
    expect(result).toBe('quoted text\nmore quote')
  })

  it('handles images (removes alt text)', () => {
    const result = stripMarkdown('![alt](image.png)')
    expect(result).toBe('alt')
  })

  it('returns empty string for null/undefined', () => {
    expect(stripMarkdown(null as unknown as string)).toBe('')
    expect(stripMarkdown(undefined as unknown as string)).toBe('')
  })

  it('handles empty string', () => {
    expect(stripMarkdown('')).toBe('')
  })
})
