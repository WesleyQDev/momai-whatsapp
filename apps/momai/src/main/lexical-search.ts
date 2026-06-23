import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'

const MAX_CONCURRENT_READS = 5

function lexicalScore(source: string | null | undefined, query: string): number {
  const src = String(source || '').toLowerCase()
  const q = String(query || '')
    .toLowerCase()
    .trim()
  if (!src || !q) return 0
  let idx = 0
  let count = 0
  while (idx >= 0) {
    idx = src.indexOf(q, idx)
    if (idx >= 0) {
      count += 1
      idx += Math.max(1, q.length)
    }
  }
  return count
}

function buildSnippet(content: string, query: string): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  const q = query.toLowerCase()
  const foundIdx = compact.toLowerCase().indexOf(q)
  if (foundIdx < 0) return compact.slice(0, 240)
  const start = Math.max(0, foundIdx - 80)
  const end = Math.min(compact.length, foundIdx + Math.max(80, query.length + 60))
  return compact.slice(start, end)
}

export interface SearchResult {
  note_id: string
  chunk_id: string
  title: string
  path: string
  text: string
  score: number
  keyword_score: number
  vector_score: number
}

export async function runLexicalNoteSearch(
  query: string,
  limit: number = 6,
  dataDir: string,
  notesIndexFile: string
): Promise<SearchResult[]> {
  const term = String(query || '').trim()
  if (!term) return []

  let index: Array<{ id: string; title: string; path: string }> = []
  try {
    if (existsSync(notesIndexFile)) {
      const raw = await readFile(notesIndexFile, 'utf8')
      index = JSON.parse(raw)
    }
  } catch {
    return []
  }

  if (!Array.isArray(index)) return []

  type LoadedItem = {
    item: { id: string; title: string; path: string }
    content: string
  }

  const loaded: LoadedItem[] = []
  for (let i = 0; i < index.length; i += MAX_CONCURRENT_READS) {
    const batch = index.slice(i, i + MAX_CONCURRENT_READS)
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        if (!item || typeof item.id !== 'string' || typeof item.path !== 'string') return null
        const absPath = join(dataDir, item.path)
        try {
          const content = await readFile(absPath, 'utf8')
          return { item, content }
        } catch {
          return null
        }
      })
    )
    for (const result of batchResults) {
      if (result) loaded.push(result)
    }
  }

  const out: SearchResult[] = []
  for (const { item, content } of loaded) {
    const title = String(item.title || 'Nota')
    const titleScore = lexicalScore(title, term)
    const bodyScore = lexicalScore(content, term)
    const score = titleScore * 3 + bodyScore

    if (score <= 0) continue

    const snippet = buildSnippet(content, term)

    out.push({
      note_id: item.id,
      chunk_id: `${item.id}:lexical`,
      title,
      path: item.path,
      text: snippet,
      score,
      keyword_score: score,
      vector_score: 0
    })
  }

  return out.sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit))
}

export { lexicalScore, buildSnippet }
