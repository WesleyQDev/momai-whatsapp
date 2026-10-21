import { describe, it, expect } from 'vitest'

describe('WhatsApp share destination filtering', () => {
  const isExcludedJid = (jid: string) => {
    if (!jid) return true
    const lower = jid.toLowerCase()
    return (
      lower.endsWith('@newsletter') ||
      lower.endsWith('@broadcast') ||
      lower === 'status@broadcast' ||
      lower.endsWith('@call') ||
      lower.endsWith('@lid')
    )
  }

  it('excludes WhatsApp channels/newsletters (@newsletter)', () => {
    expect(isExcludedJid('120363411700789948@newsletter')).toBe(true)
  })

  it('excludes broadcast and status updates', () => {
    expect(isExcludedJid('status@broadcast')).toBe(true)
    expect(isExcludedJid('123456@broadcast')).toBe(true)
  })

  it('excludes calls and internal lids', () => {
    expect(isExcludedJid('123@call')).toBe(true)
    expect(isExcludedJid('123456789@lid')).toBe(true)
  })

  it('allows standard user contacts and group JIDs', () => {
    expect(isExcludedJid('5511999999999@s.whatsapp.net')).toBe(false)
    expect(isExcludedJid('120363024829104829@g.us')).toBe(false)
  })

  it('filters out non-sendable items from combined contact list', () => {
    const rawContacts = [
      { id: '5511999999999@s.whatsapp.net', name: 'Alice', phone: '5511999999999', canSend: true },
      { id: '120363411700789948@newsletter', name: 'Canal Notícias', phone: '120363411700789948' },
      { id: 'status@broadcast', name: 'Status' }
    ]
    const rawGroups = [
      { id: '120363024829104829@g.us', name: 'Grupo Amigos', isGroup: true, canSend: true },
      { id: '120363999999999999@g.us', name: 'Grupo Apenas Admin', isGroup: true, canSend: false }
    ]

    const combined = [...rawContacts, ...rawGroups].filter((c: any) => {
      if (!c?.id || isExcludedJid(c.id)) return false
      if (c.canSend === false) return false
      return true
    })

    expect(combined).toHaveLength(2)
    expect(combined.map((c) => c.name)).toEqual(['Alice', 'Grupo Amigos'])
  })
})
