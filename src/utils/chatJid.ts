/**
 * Matches two WhatsApp JIDs that address the same 1:1 chat across
 * Baileys device suffixes (user:device@domain), phone formatting, and raw numbers.
 * Group chats (@g.us) only match on exact equality.
 */
export function isSameChat(a: string, b: string): boolean {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false
  if (a === b) return true
  const aIsGroup = a.endsWith('@g.us')
  const bIsGroup = b.endsWith('@g.us')
  if (aIsGroup || bIsGroup) {
    if (aIsGroup !== bIsGroup) return false
    const aClean = a.includes(':') ? `${a.split('@')[0].split(':')[0]}@${a.split('@')[1]}` : a
    const bClean = b.includes(':') ? `${b.split('@')[0].split(':')[0]}@${b.split('@')[1]}` : b
    return aClean === bClean
  }
  const [aUser, aDomain] = a.split('@')
  const [bUser, bDomain] = b.split('@')
  if (!aUser || !bUser || !aDomain || !bDomain) {
    const aDig = String(a).replace(/\D/g, '')
    const bDig = String(b).replace(/\D/g, '')
    return aDig.length >= 7 && aDig === bDig
  }
  if (aUser.split(':')[0] === bUser.split(':')[0] && aDomain === bDomain) return true
  const aDigits = aUser.replace(/\D/g, '')
  const bDigits = bUser.replace(/\D/g, '')
  return aDigits.length >= 7 && aDigits === bDigits
}

/**
 * Resolves the JID used to track unread state for a history message.
 * Server entries carry the raw sender address in `jid` plus the normalized
 * conversation address in `replyJid`; unread must key on the conversation so
 * showing and clearing always address the same chat.
 */
export function resolveUnreadJid(msg: { jid?: unknown; replyJid?: unknown }): string {
  const replyJid = typeof msg.replyJid === 'string' ? msg.replyJid : ''
  if (replyJid.includes('@')) return replyJid
  const jid = typeof msg.jid === 'string' ? msg.jid : ''
  return jid.includes('@') ? jid : ''
}

