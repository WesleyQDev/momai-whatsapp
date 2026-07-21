const path = require('node:path')

describe('extension-host-manager', () => {
  const manager = require('./extension-host-manager')

  describe('SAFE_ENV', () => {
    it('exists and has expected interface', () => {
      expect(manager).toBeDefined()
      expect(typeof manager.startPersistent).toBe('function')
      expect(typeof manager.stopPersistent).toBe('function')
      expect(typeof manager.stopAllPersistent).toBe('function')
    })

    it('includes APPDATA and LOCALAPPDATA in SAFE_ENV for extension compatibility', () => {
      expect(manager.SAFE_ENV).toHaveProperty('APPDATA')
      expect(manager.SAFE_ENV).toHaveProperty('LOCALAPPDATA')
    })
  })

  describe('startPersistent path containment', () => {
    it('rejects backgroundScript that escapes the extension directory via ..', async () => {
      const skillPath = path.resolve('/tmp/ext/whatsapp')
      const skillId = 'test-escape-' + Date.now()
      const manifest = {
        backgroundScript: '../../etc/passwd',
        background: true
      }

      await expect(
        manager.startPersistent(skillId, skillPath, manifest)
      ).rejects.toThrow(/path escapes extension directory/)
    })

    it('rejects backgroundScript that escapes via absolute path', async () => {
      const skillPath = path.resolve('/tmp/ext/whatsapp')
      const skillId = 'test-abs-' + Date.now()
      const manifest = {
        backgroundScript: '/etc/passwd',
        background: true
      }

      await expect(
        manager.startPersistent(skillId, skillPath, manifest)
      ).rejects.toThrow(/path escapes extension directory/)
    })
  })
})
