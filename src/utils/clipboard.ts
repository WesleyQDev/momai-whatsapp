/**
 * Safe clipboard write helper.
 *
 * Electron overlays / iframes may deny `navigator.clipboard.writeText`
 * with `NotAllowedError`. This helper tries the standard Web Clipboard API,
 * catches any errors, and falls back to a temporary textarea with `document.execCommand('copy')`.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  // 1. Try Web Clipboard API
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall back to execCommand
  }

  // 2. Fallback using temporary textarea
  try {
    if (typeof document !== 'undefined' && document.body) {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '-9999px'
      textarea.style.opacity = '0'
      textarea.setAttribute('readonly', '')
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textarea)
      return successful
    }
  } catch {
    // Best effort
  }

  return false
}
