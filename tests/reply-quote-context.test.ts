import { describe, expect, it } from 'vitest'
import { generateWAMessage } from '@whiskeysockets/baileys'
import utils from '../worker-utils'

const { resolveReplyQuoted } = utils as any

const me = '5511888888888@s.whatsapp.net'
const contact = '5511999999999@s.whatsapp.net'

/**
 * O aparelho do contato só renderiza a mensagem como resposta quando o proto
 * enviado carrega `contextInfo` (stanzaId + participant + quotedMessage).
 * Estes testes atravessam o payload resolvido pelo worker até o proto que o
 * Baileys gera — o caminho que estava silenciosamente sem citação.
 */
describe('reply quote reaches the Baileys proto (contextInfo)', () => {
  it('attaches contextInfo when replying to an incoming DM message', async () => {
    const quoted = resolveReplyQuoted(
      { id: '3EB0ABC', text: 'pergunta', direction: 'incoming' },
      contact
    )
    const wa = await generateWAMessage(contact, { text: 'resposta' }, {
      userJid: me,
      messageId: 'MSG1',
      quoted
    })

    const contextInfo = wa.message.extendedTextMessage.contextInfo
    expect(contextInfo.stanzaId).toBe('3EB0ABC')
    expect(contextInfo.participant).toBe(contact)
    expect(contextInfo.quotedMessage).toEqual({ conversation: 'pergunta' })
  })

  it('attaches contextInfo with the group participant when replying in a group', async () => {
    const groupJid = '120363000000000000@g.us'
    const participant = '5511977777777@s.whatsapp.net'
    const quoted = resolveReplyQuoted(
      { id: '3EB0GRP', text: 'no grupo', direction: 'incoming', senderJid: participant },
      groupJid,
      true
    )
    const wa = await generateWAMessage(groupJid, { text: 'resposta' }, {
      userJid: me,
      messageId: 'MSG2',
      quoted
    })

    const contextInfo = wa.message.extendedTextMessage.contextInfo
    expect(contextInfo.stanzaId).toBe('3EB0GRP')
    expect(contextInfo.participant).toBe(participant)
    expect(contextInfo.quotedMessage).toEqual({ conversation: 'no grupo' })
  })

  it('sends no contextInfo when the quoted payload has no stanza id', async () => {
    const quoted = resolveReplyQuoted({ text: 'sem id' }, contact)
    expect(quoted).toBeNull()

    const wa = await generateWAMessage(contact, { text: 'resposta' }, {
      userJid: me,
      messageId: 'MSG3',
      quoted
    })

    expect(wa.message.extendedTextMessage.contextInfo || null).toBeNull()
  })
})
