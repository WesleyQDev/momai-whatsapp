const { collectStoredData } = require('../services/manifest-storage')

describe('collectStoredData', () => {
  it('returns storage info from each installed skill manifest', () => {
    const skills = [
      {
        id: 'whatsapp',
        manifest: {
          name: 'WhatsApp',
          storage: { description: 'Sessão criptografada', locations: ['baileys-auth/'] }
        }
      },
      {
        id: 'launcher',
        manifest: { name: 'Launcher' }
      }
    ]
    const result = collectStoredData(skills)
    expect(result).toEqual([
      {
        skillId: 'whatsapp',
        skillName: 'WhatsApp',
        description: 'Sessão criptografada',
        locations: ['baileys-auth/']
      }
    ])
  })

  it('returns empty array when no skills have storage info', () => {
    expect(collectStoredData([{ id: 'x', manifest: { name: 'X' } }])).toEqual([])
  })
})
