/**
 * Remove technical markers (like __MOMAI_ACTIONS__) from the text.
 * Ensures the actual content before and after is preserved without the marker itself.
 */
export function cleanMomaiActions(text: string): string {
  if (typeof text !== 'string') return ''

  // Remove technical sections (JSON blocks that follow markers)
  return text
    .split('__MOMAI_ACTIONS__')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n\n')
    .trim()
}

/**
 * Remove markdown formatting so text can be displayed as plain text (e.g. in Call Mode).
 */
export function stripMarkdown(text: string): string {
  if (typeof text !== 'string') return ''

  return text
    .replace(/__MOMAI_ACTIONS__[\s\S]*$/, '') // Remove technical markers
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`([^`]+)`/g, '$1') // Inline code
    .replace(/^#{1,6}\s+/gm, '') // Headers
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1') // Bold italic
    .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
    .replace(/__(.+?)__/g, '$1') // Bold
    .replace(/\*(.+?)\*/g, '$1') // Italic
    .replace(/_(.+?)_/g, '$1') // Italic
    .replace(/~~(.+?)~~/g, '$1') // Strikethrough
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1') // Links/Images
    .replace(/^\s*[-*+]\s+/gm, '') // Lists
    .replace(/^\s*\d+\.\s+/gm, '') // Ordered lists
    .replace(/^>+\s?/gm, '') // Blockquotes
    .replace(/---+|\*\*\*+|___+/g, '') // Horizontal rules
    .replace(/\n{2,}/g, '\n\n') // Normalize newlines
    .trim()
}

export function stripEmojisAndMarkdown(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^>+\s?/gm, '')
    .replace(/---+|\*\*\*+|___+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[*_~#]/g, ' ')
    .replace(/["""''']/g, '')
}
