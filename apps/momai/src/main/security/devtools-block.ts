export interface DevToolsShortcutInput {
  isDev: boolean
  key: string
  control?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
}

const DEVTOOLS_KEYS = new Set(['F12'])

export function shouldBlockDevToolsShortcut(input: DevToolsShortcutInput): boolean {
  if (input.isDev) return false
  if (DEVTOOLS_KEYS.has(input.key)) return true
  if (input.key === 'I' && input.shift && (input.control || input.meta)) return true
  if (input.key === 'i' && input.shift && (input.alt || input.meta)) return true
  return false
}
