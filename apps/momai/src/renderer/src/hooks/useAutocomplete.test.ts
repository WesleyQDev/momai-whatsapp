import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutocomplete } from './useAutocomplete'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null)
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
})

describe('useAutocomplete', () => {
  it('returns empty suggestion initially', () => {
    const { result } = renderHook(() => useAutocomplete())
    expect(result.current.suggestion).toBe('')
  })

  it('populates history from localStorage', () => {
    const entries = [
      { text: 'hello world', count: 3, lastUsed: 100 },
      { text: 'help me', count: 1, lastUsed: 200 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    let suggestion: string
    act(() => {
      suggestion = result.current.getSuggestion('hel')
    })
    expect(suggestion!).toBe('lo world')
  })

  it('filters suggestions by input prefix', () => {
    const entries = [
      { text: 'hello', count: 2, lastUsed: 100 },
      { text: 'help', count: 1, lastUsed: 200 },
      { text: 'world', count: 5, lastUsed: 300 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    let suggestion: string
    act(() => {
      suggestion = result.current.getSuggestion('he')
    })
    expect(suggestion!).toBe('llo')
  })

  it('returns empty when no matches', () => {
    const entries = [
      { text: 'hello', count: 2, lastUsed: 100 },
      { text: 'world', count: 5, lastUsed: 300 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    let suggestion: string
    act(() => {
      suggestion = result.current.getSuggestion('xyz')
    })
    expect(suggestion!).toBe('')
    expect(result.current.suggestion).toBe('')
  })

  it('updates frequency on selection via addToHistory', () => {
    const entries = [
      { text: 'hello', count: 1, lastUsed: 100 },
      { text: 'world', count: 5, lastUsed: 300 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    act(() => {
      result.current.addToHistory('hello')
    })

    let suggestion: string
    act(() => {
      suggestion = result.current.getSuggestion('he')
    })
    expect(suggestion!).toBe('llo')
  })

  it('handles localStorage quota errors gracefully', () => {
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify([
      { text: 'hello', count: 999, lastUsed: 100 }
    ]))

    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })

    const { result } = renderHook(() => useAutocomplete())
    act(() => {
      result.current.addToHistory('new long text that triggers save')
    })

    expect(() => {
      act(() => {
        result.current.addToHistory('another entry')
      })
    }).not.toThrow()
  })

  it('performs case-insensitive matching', () => {
    const entries = [
      { text: 'Hello World', count: 3, lastUsed: 100 },
      { text: 'HELP', count: 1, lastUsed: 200 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    let suggestion: string
    act(() => {
      suggestion = result.current.getSuggestion('HE')
    })
    expect(suggestion!).toBe('llo World')
  })

  it('does not suggest exact match', () => {
    const entries = [
      { text: 'hello', count: 3, lastUsed: 100 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    let suggestion: string
    act(() => {
      suggestion = result.current.getSuggestion('hello')
    })
    expect(suggestion!).toBe('')
  })

  it('requires at least 2 characters for suggestions', () => {
    const entries = [
      { text: 'hello', count: 3, lastUsed: 100 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    let suggestion: string
    act(() => {
      suggestion = result.current.getSuggestion('h')
    })
    expect(suggestion!).toBe('')
  })

  it('returns recent history sorted by lastUsed', () => {
    const entries = [
      { text: 'older', count: 1, lastUsed: 100 },
      { text: 'newer', count: 1, lastUsed: 300 },
      { text: 'middle', count: 1, lastUsed: 200 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    const recent = result.current.getRecentHistory()
    expect(recent).toEqual(['newer', 'middle', 'older'])
  })

  it('acceptSuggestion appends suggestion to current text', () => {
    const entries = [
      { text: 'hello world', count: 3, lastUsed: 100 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    act(() => {
      result.current.getSuggestion('hel')
    })
    let accepted: string
    act(() => {
      accepted = result.current.acceptSuggestion('hel')
    })
    expect(accepted!).toBe('hello world')
    expect(result.current.suggestion).toBe('')
  })

  it('clearSuggestion resets suggestion', () => {
    const entries = [
      { text: 'hello world', count: 3, lastUsed: 100 }
    ]
    localStorageMock.setItem('momai_autocomplete_history', JSON.stringify(entries))

    const { result } = renderHook(() => useAutocomplete())
    act(() => {
      result.current.getSuggestion('hel')
    })
    expect(result.current.suggestion).toBe('lo world')
    act(() => {
      result.current.clearSuggestion()
    })
    expect(result.current.suggestion).toBe('')
  })
})
