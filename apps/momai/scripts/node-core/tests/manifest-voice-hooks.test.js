const { resolveVoiceReply } = require('../services/manifest-voice-hooks')

describe('resolveVoiceReply', () => {
  const hostManager = {}

  it('returns null when no skill declares a reply hook', async () => {
    hostManager.sendToPersistent = vi.fn()
    const result = await resolveVoiceReply('responda o João', [], hostManager)
    expect(result).toBeNull()
    expect(hostManager.sendToPersistent).not.toHaveBeenCalled()
  })

  it('injects prompt from skill voiceHooks.reply.promptTemplate', async () => {
    hostManager.sendToPersistent = vi.fn().mockResolvedValue({
      history: [{ from: 'João', text: 'Oi tudo bem?' }]
    })
    const skills = [
      {
        id: 'whatsapp',
        manifest: {
          voiceHooks: {
            reply: {
              tool: 'get_history',
              promptTemplate: 'Responda a {contactName}: {lastMessage}'
            }
          }
        }
      }
    ]
    const result = await resolveVoiceReply('responda oi', skills, hostManager)
    expect(result).toContain('Responda a João: Oi tudo bem?')
    expect(result).toContain('responda oi')
  })

  it('returns null when hostManager returns no history', async () => {
    hostManager.sendToPersistent = vi.fn().mockResolvedValue({ history: [] })
    const skills = [
      {
        id: 'whatsapp',
        manifest: {
          voiceHooks: { reply: { tool: 'get_history', promptTemplate: '{contactName}' } }
        }
      }
    ]
    expect(await resolveVoiceReply('x', skills, hostManager)).toBeNull()
  })

  it('skips skills that throw and tries the next one', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({ history: [{ from: 'Maria', text: 'oi' }] })
    const skills = [
      {
        id: 'a',
        manifest: {
          voiceHooks: { reply: { tool: 'h', promptTemplate: '{contactName}: {lastMessage}' } }
        }
      },
      {
        id: 'b',
        manifest: {
          voiceHooks: { reply: { tool: 'h', promptTemplate: '{contactName}: {lastMessage}' } }
        }
      }
    ]
    const result = await resolveVoiceReply('x', skills, { sendToPersistent: send })
    expect(result).toContain('Maria: oi')
  })
})
