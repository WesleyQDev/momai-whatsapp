import { describe, it, expect } from 'vitest'
import utils from '../worker-utils'

const {
  isStatusUpdate,
  shouldSuppressStatusUpdate,
  resolveNotificationReplyJid,
  getStatusTtsText,
  resolveStatusReplyQuoted
} = utils as any

describe('status updates (stories) overlay preference', () => {
  it('detects status@broadcast as a status update', () => {
    expect(isStatusUpdate('status@broadcast')).toBe(true)
  })

  it('does not flag regular chats or groups as status', () => {
    expect(isStatusUpdate('5511999990001@s.whatsapp.net')).toBe(false)
    expect(isStatusUpdate('120363000000000001@g.us')).toBe(false)
    expect(isStatusUpdate(null)).toBe(false)
  })

  it('suppresses status overlay when the user disabled status notifications', () => {
    expect(shouldSuppressStatusUpdate('status@broadcast', true)).toBe(true)
  })

  it('allows status overlay when the user enabled status notifications', () => {
    expect(shouldSuppressStatusUpdate('status@broadcast', false)).toBe(false)
  })

  it('never suppresses regular messages', () => {
    expect(shouldSuppressStatusUpdate('5511999990001@s.whatsapp.net', true)).toBe(false)
    expect(shouldSuppressStatusUpdate('120363000000000001@g.us', true)).toBe(false)
  })
})

describe('status reply target (answers go to the author, not broadcast)', () => {
  it('routes status replies to the status author', () => {
    expect(
      resolveNotificationReplyJid(
        'status@broadcast',
        '5511999990001@s.whatsapp.net',
        'status@broadcast'
      )
    ).toBe('5511999990001@s.whatsapp.net')
  })

  it('keeps the default reply target for regular chats and groups', () => {
    expect(
      resolveNotificationReplyJid(
        '5511999990001@s.whatsapp.net',
        '5511999990001@s.whatsapp.net',
        '5511999990001@s.whatsapp.net'
      )
    ).toBe('5511999990001@s.whatsapp.net')
    expect(
      resolveNotificationReplyJid(
        '120363000000000001@g.us',
        '5511999990001@s.whatsapp.net',
        '120363000000000001@g.us'
      )
    ).toBe('120363000000000001@g.us')
  })

  it('falls back to broadcast when the author is unknown', () => {
    expect(resolveNotificationReplyJid('status@broadcast', null, 'status@broadcast')).toBe(
      'status@broadcast'
    )
  })
})

describe('status spoken alert (tts names the status)', () => {
  it('announces photo and video statuses', () => {
    expect(
      getStatusTtsText({ contact: 'Maria', mediaKind: 'image' })
    ).toBe('Maria postou um status com foto')
    expect(
      getStatusTtsText({ contact: 'Maria', mediaKind: 'video' })
    ).toBe('Maria postou um status em vídeo')
  })

  it('reads text statuses with the message', () => {
    expect(
      getStatusTtsText({ contact: 'Maria', message: 'praia!', mediaKind: 'text' })
    ).toBe('Maria postou um status: praia!')
  })

  it('covers self posts and unknown numbers', () => {
    expect(
      getStatusTtsText({ contact: 'Você', mediaKind: 'image', isNoteToSelf: true })
    ).toBe('Você postou um status com foto')
    expect(
      getStatusTtsText({ contact: '5511999990009', mediaKind: 'text', isPhoneNumber: true })
    ).toBe('Um número desconhecido postou um status')
  })
})

describe('status reply quoting (recipient sees "Name · Status")', () => {
  const stored = {
    key: {
      remoteJid: 'status@broadcast',
      id: 'STATUS1',
      participant: '5511999990001@s.whatsapp.net'
    },
    message: { imageMessage: { caption: 'praia' } }
  }

  it('quotes the stored status with the author override', () => {
    const quoted = resolveStatusReplyQuoted(
      { stanzaId: 'STATUS1', participant: '5511999990001@s.whatsapp.net' },
      stored
    )
    expect(quoted.key).toBe(stored.key)
    expect(quoted.message).toBe(stored.message)
    expect(quoted.participant).toBe('5511999990001@s.whatsapp.net')
  })

  it('keeps the stored message untouched when no author override is given', () => {
    expect(resolveStatusReplyQuoted({ stanzaId: 'STATUS1' }, stored)).toBe(stored)
  })

  it('returns null when the status message is no longer cached', () => {
    expect(resolveStatusReplyQuoted({ stanzaId: 'MISSING' }, null)).toBeNull()
  })

  it('returns null for empty or malformed context', () => {
    expect(resolveStatusReplyQuoted(null, stored)).toBeNull()
    expect(resolveStatusReplyQuoted({}, stored)).toBeNull()
    expect(resolveStatusReplyQuoted({ stanzaId: '   ' }, stored)).toBeNull()
  })
})
