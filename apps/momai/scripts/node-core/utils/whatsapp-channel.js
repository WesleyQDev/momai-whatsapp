/** @param {Record<string, unknown>} body */
function resolveWhatsAppContactJid(body) {
  const jid = String(body.contactJid || body.jid || '').trim()
  if (jid.includes('@')) return jid
  return ''
}

/** @param {Record<string, unknown>} body */
function resolveWhatsAppChannel(body) {
  const contactJid = resolveWhatsAppContactJid(body)
  const explicitGroup = body.isGroup === true || body.isGroup === 'true'
  const groupName = String(body.groupName || '').trim()

  let isGroup = contactJid.endsWith('@g.us')
  if (!isGroup && explicitGroup && (groupName || contactJid.endsWith('@g.us'))) {
    isGroup = true
  }

  return {
    contactJid,
    isGroup,
    groupName: isGroup ? groupName || 'Grupo' : ''
  }
}

module.exports = { resolveWhatsAppContactJid, resolveWhatsAppChannel }
