import { describe, it, expect } from 'vitest'
import { isSameChat } from '../src/utils/chatJid'

describe('Group message and conversation deletion isolation', () => {
  const groupJid = '120363024823904823@g.us'
  const participantJid = '5511999998888@s.whatsapp.net'

  it('isSameChat does not match a group JID with a participant JID', () => {
    expect(isSameChat(groupJid, participantJid)).toBe(false)
    expect(isSameChat(participantJid, groupJid)).toBe(false)
  })

  it('isSameChat matches group JID with device suffixes', () => {
    expect(isSameChat('120363024823904823:1@g.us', groupJid)).toBe(true)
    expect(isSameChat(groupJid, '120363024823904823:2@g.us')).toBe(true)
  })

  it('deleting a 1:1 contact conversation leaves group messages intact when filtering', () => {
    const history = [
      {
        jid: groupJid,
        senderJid: participantJid,
        replyJid: groupJid,
        direction: 'incoming' as const,
        text: 'Mensagem no grupo piriquetes',
        timestamp: 1000,
        isGroup: true,
        groupName: 'Piriquetes'
      },
      {
        jid: participantJid,
        senderJid: participantJid,
        replyJid: participantJid,
        direction: 'incoming' as const,
        text: 'Mensagem privada com o contato',
        timestamp: 900,
        isGroup: false
      }
    ]

    const deletedJids = [participantJid]

    const filteredHistory = history.filter((m) => {
      const isGroupMsg = Boolean(m.isGroup || m.jid?.endsWith('@g.us'))
      if (isGroupMsg) {
        return !deletedJids.some((d) => isSameChat(m.jid, d) || isSameChat(m.replyJid || '', d))
      }
      return !deletedJids.some(
        (d) =>
          isSameChat(m.jid, d) ||
          isSameChat(m.senderJid || '', d) ||
          isSameChat(m.replyJid || '', d)
      )
    })

    expect(filteredHistory).toHaveLength(1)
    expect(filteredHistory[0].text).toBe('Mensagem no grupo piriquetes')
    expect(filteredHistory[0].jid).toBe(groupJid)
  })

  it('deleting the group conversation removes only the group messages', () => {
    const history = [
      {
        jid: groupJid,
        senderJid: participantJid,
        replyJid: groupJid,
        direction: 'incoming' as const,
        text: 'Mensagem no grupo piriquetes',
        timestamp: 1000,
        isGroup: true,
        groupName: 'Piriquetes'
      },
      {
        jid: participantJid,
        senderJid: participantJid,
        replyJid: participantJid,
        direction: 'incoming' as const,
        text: 'Mensagem privada com o contato',
        timestamp: 900,
        isGroup: false
      }
    ]

    const deletedJids = [groupJid]

    const filteredHistory = history.filter((m) => {
      const isGroupMsg = Boolean(m.isGroup || m.jid?.endsWith('@g.us'))
      if (isGroupMsg) {
        return !deletedJids.some((d) => isSameChat(m.jid, d) || isSameChat(m.replyJid || '', d))
      }
      return !deletedJids.some(
        (d) =>
          isSameChat(m.jid, d) ||
          isSameChat(m.senderJid || '', d) ||
          isSameChat(m.replyJid || '', d)
      )
    })

    expect(filteredHistory).toHaveLength(1)
    expect(filteredHistory[0].text).toBe('Mensagem privada com o contato')
    expect(filteredHistory[0].jid).toBe(participantJid)
  })
})
