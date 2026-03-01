/**
 * Remove technical markers (like __MOMAI_ACTIONS__) from the text.
 * Ensures the actual content before and after is preserved without the marker itself.
 */
export function cleanMomaiActions(text: string): string {
  if (typeof text !== 'string') return ''
  
  // Remove technical sections (JSON blocks that follow markers)
  // Usually, technical JSON is wrapped in curly braces or at the end of the part
  return text
    .split('__MOMAI_ACTIONS__')
    .map(part => {
      const trimmed = part.trim()
      // If the part looks like purely technical JSON, we might want to skip it,
      // but to be safe and avoid losing data, let's just return it for now
      // and let the user decide. Usually, we just want the marker gone.
      return trimmed
    })
    .filter(part => part.length > 0)
    .join('\n\n')
    .trim()
}
