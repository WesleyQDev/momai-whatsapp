import { describe, it, expect } from 'vitest'
import {
  sortNotesByTitle,
  getFolderName,
  getParentFolderPath,
  isRetryableNotesLoadError,
  generateNotePreview
} from './note-helpers'
import type { NoteSummary } from '../../../services/api'

describe('sortNotesByTitle', () => {
  it('sorts alphabetically by title', () => {
    const notes: NoteSummary[] = [
      { id: '1', title: 'Zebra', path: 'z.md', source: 'local' },
      { id: '2', title: 'Apple', path: 'a.md', source: 'local' }
    ]
    const sorted = sortNotesByTitle(notes)
    expect(sorted[0].title).toBe('Apple')
    expect(sorted[1].title).toBe('Zebra')
  })

  it('does not mutate the original array', () => {
    const notes: NoteSummary[] = [
      { id: '1', title: 'Zebra', path: 'z.md', source: 'local' },
      { id: '2', title: 'Apple', path: 'a.md', source: 'local' }
    ]
    const original = [...notes]
    sortNotesByTitle(notes)
    expect(notes).toEqual(original)
  })
})

describe('getFolderName', () => {
  it('extracts the last path segment', () => {
    expect(getFolderName('parent/child')).toBe('child')
  })

  it('returns the string itself when there is no separator', () => {
    expect(getFolderName('root')).toBe('root')
  })
})

describe('getParentFolderPath', () => {
  it('returns "root" for a note directly in notes/', () => {
    expect(getParentFolderPath('notes/note.md')).toBe('root')
  })

  it('returns the single parent folder', () => {
    expect(getParentFolderPath('notes/folder/note.md')).toBe('folder')
  })

  it('returns the nested parent path', () => {
    expect(getParentFolderPath('notes/folder/sub/note.md')).toBe('folder/sub')
  })
})

describe('isRetryableNotesLoadError', () => {
  it('returns true for TypeError', () => {
    expect(isRetryableNotesLoadError(new TypeError('invalid type'))).toBe(true)
  })

  it('returns true for errors with "Failed to fetch" message', () => {
    expect(isRetryableNotesLoadError(new Error('Failed to fetch'))).toBe(true)
  })

  it('returns true for errors with "NetworkError" message', () => {
    expect(isRetryableNotesLoadError(new Error('NetworkError'))).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isRetryableNotesLoadError(new Error('Not found'))).toBe(false)
  })
})

describe('generateNotePreview', () => {
  it('truncates at maxLength with ellipsis', () => {
    const content = 'a'.repeat(200)
    expect(generateNotePreview(content, 100)).toBe('a'.repeat(100) + '...')
  })

  it('returns full content when under limit', () => {
    const content = 'short note'
    expect(generateNotePreview(content)).toBe('short note')
  })
})
