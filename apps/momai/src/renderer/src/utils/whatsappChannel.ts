/** Dados mínimos de um evento whatsapp_notification */
export type WhatsAppNotificationPayload = {
  contactJid?: string
  jid?: string
  contact?: string
  from?: string
  isGroup?: boolean
  groupName?: string | null
}

export function resolveWhatsAppContactJid(data: WhatsAppNotificationPayload): string {
  const jid = String(data.contactJid || data.jid || '').trim()
  if (jid.includes('@')) return jid
  // Nunca usar "contact" (nome ex.: Pai Tenebroso) como JID — quebra detecção de grupo
  return ''
}

export function resolveWhatsAppChannel(data: WhatsAppNotificationPayload) {
  const contactJid = resolveWhatsAppContactJid(data)
  const explicitGroup = data.isGroup === true
  const groupName = String(data.groupName || '').trim()

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
