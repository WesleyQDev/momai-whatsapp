export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function joinPaths(...parts: string[]): string {
  return normalizePath(parts.join('/'))
}

export function basename(p: string): string {
  const normalized = normalizePath(p)
  return normalized.split('/').pop() || ''
}

export function dirname(p: string): string {
  const normalized = normalizePath(p)
  const parts = normalized.split('/')
  parts.pop()
  return parts.join('/') || '.'
}
