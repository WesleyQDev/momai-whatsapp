import { NoteSummary } from '../../../services/api'

export function sortNotesByTitle(notes: NoteSummary[]): NoteSummary[] {
  return [...notes].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
}

export function getFolderName(folderPath: string): string {
  return folderPath.split('/').pop() || folderPath
}

export function getParentFolderPath(notePath: string): string {
  const parts = notePath.split(/[/\\]/)
  if (parts.length <= 2) return 'root'
  const startIdx = parts[0] === 'notes' ? 1 : 0
  return parts.slice(startIdx, -1).join('/') || 'root'
}

export function isRetryableNotesLoadError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  const message = err instanceof Error ? err.message : String(err)
  return /failed to fetch|networkerror|load failed|fetch/i.test(message)
}

export function wait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export function generateNotePreview(content: string, maxLength = 100): string {
  return content.replace(/\n/g, ' ').slice(0, maxLength) + (content.length > maxLength ? '...' : '')
}
