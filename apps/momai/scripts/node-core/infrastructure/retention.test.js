// TDD: verifies thread retention based on lastActivity age.
// The store has no `threads` field — it uses `thread_messages[threadId]`
// (array) and `session_titles[threadId]` (string). lastActivity is derived
// from the last message's `created_at`.
//
// See Task 2.2 of the privacy plan:
//   docs/superpowers/plans/2026-06-23-momai-privacy-data-cleanup.md (R002)

const { isThreadStale, pruneStaleThreads } = require('./retention')

describe('retention', () => {
  const old = '2025-01-01T00:00:00Z'
  const recent = new Date().toISOString()

  it('isThreadStale returns true for old timestamps, false for recent or missing', () => {
    expect(isThreadStale(old)).toBe(true)
    expect(isThreadStale(recent)).toBe(false)
    expect(isThreadStale(null)).toBe(false)
    expect(isThreadStale(undefined)).toBe(false)
    expect(isThreadStale('')).toBe(false)
  })

  it('pruneStaleThreads removes stale thread_messages and session_titles entries', () => {
    const store = {
      thread_messages: {
        a: [{ created_at: old }],
        b: [{ created_at: recent }]
      },
      session_titles: { a: 'old', b: 'new' }
    }
    const removed = pruneStaleThreads(store)
    expect(removed).toEqual(['a'])
    expect(store.thread_messages).not.toHaveProperty('a')
    expect(store.session_titles).not.toHaveProperty('a')
    expect(store.thread_messages).toHaveProperty('b')
    expect(store.session_titles).toHaveProperty('b')
  })

  it('pruneStaleThreads keeps empty threads (no messages = no lastActivity = not stale)', () => {
    const store = {
      thread_messages: {
        a: [{ created_at: old }],
        empty: []
      },
      session_titles: { a: 'old', empty: 'placeholder' }
    }
    const removed = pruneStaleThreads(store)
    expect(removed).toEqual(['a'])
    expect(store.thread_messages).toHaveProperty('empty')
    expect(store.session_titles).toHaveProperty('empty')
  })

  it('pruneStaleThreads handles missing thread_messages and session_titles gracefully', () => {
    const store = {}
    const removed = pruneStaleThreads(store)
    expect(removed).toEqual([])
  })

  it('does not throw when session_titles is missing but thread_messages has stale threads', () => {
    const store = {
      thread_messages: { a: [{ created_at: old }] }
    }
    expect(() => pruneStaleThreads(store)).not.toThrow()
    expect(store.thread_messages).not.toHaveProperty('a')
  })
})
