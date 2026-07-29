const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'to', 'for', 'of', 'in', 'on', 'and', 'or',
  'de', 'da', 'do', 'em', 'para', 'com', 'um', 'uma', 'os', 'as', 'que',
  'é', 'não', 'se', 'por', 'mais', 'como', 'das', 'dos', 'nas', 'nos',
  'o', 'e', 'à', 'ao', 'aos', 'às', 'no', 'na', 'este', 'esta'
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,._\-:;!?()]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

function countOverlap(wordsA: string[], wordsB: string[]): number {
  const setB = new Set(wordsB)
  return wordsA.filter((w) => setB.has(w)).length
}

export interface RecommendationScore {
  item: Record<string, any>
  score: number
  reasons: string[]
}

export function computeRecommendations(
  current: Record<string, any>,
  candidates: Record<string, any>[],
  limit = 12
): RecommendationScore[] {
  const currentTags: string[] = current.tags || []
  const currentWords = tokenize(`${current.name || ''} ${current.description || ''}`)

  const scored = candidates
    .filter((c) => c.id !== current.id && c.category !== 'core')
    .map((c) => {
      let score = 0
      const reasons: string[] = []

      const cTags: string[] = c.tags || []
      const overlap = cTags.filter((t) => currentTags.includes(t))
      if (overlap.length > 0) {
        score += overlap.length * 3
        reasons.push(`${overlap.length} tag(s) em comum`)
      }

      if (c.author && current.author && c.author === current.author) {
        score += 2
        reasons.push('mesmo desenvolvedor')
      }

      const cWords = tokenize(`${c.name || ''} ${c.description || ''}`)
      const wordMatch = countOverlap(currentWords, cWords)
      if (wordMatch > 0) {
        score += wordMatch
        reasons.push(`${wordMatch} termo(s) em comum`)
      }

      return { item: c, score, reasons }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored
}
