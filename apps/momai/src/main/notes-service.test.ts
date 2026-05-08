import { describe, it, expect } from 'vitest'
import { sanitizeFolderPath, extractTitleFromContent, makePreview, normalizeSlashes } from './notesService'

describe('normalizeSlashes', () => {
  it('replaces backslashes with forward slashes', () => {
    expect(normalizeSlashes('foo\\bar\\baz')).toBe('foo/bar/baz')
  })

  it('handles mixed slashes', () => {
    expect(normalizeSlashes('foo\\bar/baz')).toBe('foo/bar/baz')
  })

  it('returns empty for empty input', () => {
    expect(normalizeSlashes('')).toBe('')
  })
})

describe('sanitizeFolderPath', () => {
  it('trims whitespace', () => {
    expect(sanitizeFolderPath('  my-folder  ')).toBe('my-folder')
  })

  it('removes notes/ prefix', () => {
    expect(sanitizeFolderPath('notes/my-folder')).toBe('my-folder')
  })

  it('removes notes/ prefix case insensitive', () => {
    expect(sanitizeFolderPath('NOTES/my-folder')).toBe('my-folder')
  })

  it('removes leading slashes', () => {
    expect(sanitizeFolderPath('/my-folder')).toBe('my-folder')
  })

  it('removes trailing slashes', () => {
    expect(sanitizeFolderPath('my-folder/')).toBe('my-folder')
  })

  it('filters out . segments', () => {
    expect(sanitizeFolderPath('./my-folder')).toBe('my-folder')
  })

  it('filters out .. segments', () => {
    expect(sanitizeFolderPath('../my-folder')).toBe('my-folder')
  })

  it('prevents directory traversal with nested ..', () => {
    expect(sanitizeFolderPath('my-folder/../../etc')).toBe('my-folder/etc')
  })

  it('returns empty for null', () => {
    expect(sanitizeFolderPath(null)).toBe('')
  })

  it('returns empty for undefined', () => {
    expect(sanitizeFolderPath(undefined)).toBe('')
  })

  it('returns empty for empty string', () => {
    expect(sanitizeFolderPath('')).toBe('')
  })

  it('handles nested folder paths', () => {
    expect(sanitizeFolderPath('parent/child/grandchild')).toBe('parent/child/grandchild')
  })

  it('handles nested path with notes/ prefix', () => {
    expect(sanitizeFolderPath('notes/parent/child')).toBe('parent/child')
  })

  it('normalizes backslashes in path', () => {
    expect(sanitizeFolderPath('parent\\child')).toBe('parent/child')
  })
})

describe('extractTitleFromContent', () => {
  it('extracts first h1 heading from markdown', () => {
    expect(extractTitleFromContent('# My Title\n\nSome content', 'fallback')).toBe('My Title')
  })

  it('uses fallback when no heading found', () => {
    expect(extractTitleFromContent('Just some text\nwithout heading', 'Fallback Title')).toBe('Fallback Title')
  })

  it('uses fallback for empty content', () => {
    expect(extractTitleFromContent('', 'Fallback Title')).toBe('Fallback Title')
  })

  it('trims heading whitespace', () => {
    expect(extractTitleFromContent('#   Spaced Out Title   \n\ncontent', 'fallback')).toBe('Spaced Out Title')
  })

  it('ignores headings that are not level 1', () => {
    expect(extractTitleFromContent('## Not h1\n# Real h1', 'fallback')).toBe('Real h1')
  })

  it('extracts first heading when multiple exist', () => {
    expect(extractTitleFromContent('# First\n# Second', 'fallback')).toBe('First')
  })
})

describe('makePreview', () => {
  it('truncates to 220 chars with whitespace compaction', () => {
    const longContent = 'word '.repeat(60)
    const result = makePreview(longContent)
    expect(result.length).toBe(220)
    expect(result).not.toContain('  ')
  })

  it('returns full content when under limit', () => {
    const short = 'Hello world'
    expect(makePreview(short)).toBe('Hello world')
  })

  it('compacts multiple spaces', () => {
    expect(makePreview('hello    world\n\nfoo')).toBe('hello world foo')
  })

  it('handles empty content', () => {
    expect(makePreview('')).toBe('')
  })

  it('trims leading and trailing whitespace', () => {
    expect(makePreview('  hello world  ')).toBe('hello world')
  })

  it('does not break words when exact limit is reached', () => {
    const content = 'a'.repeat(220)
    expect(makePreview(content)).toBe(content)
  })

  it('truncates after compacting whitespace', () => {
    const content = 'hello   ' + 'world '.repeat(50)
    const result = makePreview(content)
    expect(result.length).toBe(220)
  })
})
