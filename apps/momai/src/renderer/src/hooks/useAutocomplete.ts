import { useState, useCallback, useEffect, useRef } from 'react'

const STORAGE_KEY = 'momai_autocomplete_history'
const MAX_ENTRIES = 500

interface HistoryEntry {
  text: string
  count: number
  lastUsed: number
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HistoryEntry[]
  } catch {
    return []
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // quota exceeded — prune oldest entries
    const pruned = entries.sort((a, b) => b.count - a.count).slice(0, Math.floor(MAX_ENTRIES / 2))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned))
  }
}

function normalize(text: string): string {
  return text.toLowerCase().trim()
}

export function useAutocomplete() {
  const historyRef = useRef<HistoryEntry[]>(loadHistory())
  const [suggestion, setSuggestion] = useState<string>('')

  useEffect(() => {
    historyRef.current = loadHistory()
  }, [])

  const addToHistory = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length < 3) return

    const entries = historyRef.current
    const normalized = normalize(trimmed)
    const existing = entries.find((e) => normalize(e.text) === normalized)

    if (existing) {
      existing.count += 1
      existing.lastUsed = Date.now()
      if (existing.text.length < trimmed.length) {
        existing.text = trimmed
      }
    } else {
      entries.push({ text: trimmed, count: 1, lastUsed: Date.now() })
    }

    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
      entries.length = MAX_ENTRIES
    }

    historyRef.current = entries
    saveHistory(entries)
  }, [])

  const getSuggestion = useCallback((input: string): string => {
    const trimmed = input.trimStart()
    if (!trimmed || trimmed.length < 2) {
      setSuggestion('')
      return ''
    }

    const inputLower = trimmed.toLowerCase()
    const entries = historyRef.current

    const matches = entries
      .filter((e) => {
        const entryLower = e.text.toLowerCase()
        return entryLower.startsWith(inputLower) && entryLower !== inputLower
      })
      .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)

    if (matches.length === 0) {
      setSuggestion('')
      return ''
    }

    const best = matches[0]
    const completion = best.text.slice(trimmed.length)
    setSuggestion(completion)
    return completion
  }, [])

  const clearSuggestion = useCallback(() => {
    setSuggestion('')
  }, [])

  const acceptSuggestion = useCallback(
    (currentText: string): string => {
      if (!suggestion) return currentText
      const result = currentText + suggestion
      setSuggestion('')
      return result
    },
    [suggestion]
  )

  const getRecentHistory = useCallback((): string[] => {
    return [...historyRef.current]
      .sort((a, b) => b.lastUsed - a.lastUsed || b.count - a.count)
      .map((entry) => entry.text)
      .filter((text) => Boolean(text && text.trim()))
  }, [])

  return {
    suggestion,
    addToHistory,
    getSuggestion,
    clearSuggestion,
    acceptSuggestion,
    getRecentHistory
  }
}
