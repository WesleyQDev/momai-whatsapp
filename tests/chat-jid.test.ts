import { describe, expect, it } from 'vitest'
import { isSameChat, resolveUnreadJid } from '../src/utils/chatJid'

describe('isSameChat', () => {
  it('matches identical JIDs', () => {
    expect(isSameChat('5511999999999@s.whatsapp.net', '5511999999999@s.whatsapp.net')).toBe(true)
  })

  it('matches across Baileys device suffixes', () => {
    expect(isSameChat('5511999999999:12@s.whatsapp.net', '5511999999999@s.whatsapp.net')).toBe(
      true
    )
  })

  it('matches across phone formatting for 1:1 chats', () => {
    expect(isSameChat('+55 11 99999-9999@s.whatsapp.net', '5511999999999@s.whatsapp.net')).toBe(
      true
    )
  })

  it('keeps group chats on exact equality only', () => {
    expect(isSameChat('120363426533298550@g.us', '120363426533298550@g.us')).toBe(true)
    expect(isSameChat('120363426533298550@g.us', '120363426533298551@g.us')).toBe(false)
  })

  it('rejects empty values', () => {
    expect(isSameChat('', '5511999999999@s.whatsapp.net')).toBe(false)
    expect(isSameChat('5511999999999@s.whatsapp.net', '')).toBe(false)
  })
})

describe('resolveUnreadJid', () => {
  it('prefers the standardized chat JID over the raw message JID', () => {
    expect(
      resolveUnreadJid({
        jid: '123456789@lid',
        replyJid: '5511999999999@s.whatsapp.net'
      })
    ).toBe('5511999999999@s.whatsapp.net')
  })

  it('falls back to the message JID when no chat JID exists', () => {
    expect(resolveUnreadJid({ jid: '5511999999999@s.whatsapp.net' })).toBe(
      '5511999999999@s.whatsapp.net'
    )
  })

  it('returns empty when the message carries no usable JID', () => {
    expect(resolveUnreadJid({})).toBe('')
    expect(resolveUnreadJid({ jid: 'not-a-jid', replyJid: 'also-not-a-jid' })).toBe('')
  })
})
