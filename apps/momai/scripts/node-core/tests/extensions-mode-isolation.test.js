const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const {
  createExtensionsRoutes,
  cleanupOppositeModeArtifact
} = require('../api/routes/extensions.routes')

function makeTmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'momai-ext-helper-'))
}

function makeFakeSharedState({ devMode = 'symlink', extensions = [] } = {}) {
  const mod = require('../services/shared-state')
  mod.store = { settings: { dev_mode: devMode }, extensions, skillKeywords: {} }
  return () => {
    delete mod.store
  }
}

function makeMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = { ...this.headers, ...headers }
      return this
    },
    end(data) {
      if (data) {
        try {
          this.body = JSON.parse(data)
        } catch {
          this.body = data
        }
      }
      return this
    },
    write() {
      return true
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(data) {
      this.body = data
      return this
    }
  }
}

function makeRegistryWithInstallPaths({ extensionsDir, extensionsDevDir }) {
  return {
    refresh: async () => {},
    extensionsDir,
    extensionsDevDir,
    getById: () => null,
    getAll: () => [],
    loadExtensions: async () => {},
    executeHook: async () => {}
  }
}

function writeManifest(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${manifest.id}\nversion: ${manifest.version || '1.0.0'}\n---\n# ${manifest.name}\n`
  )
}

describe('extensions.routes — mode isolation helpers', () => {
  let dataDir
  let extensionsDir
  let extensionsDevDir

  beforeEach(() => {
    dataDir = makeTmpDataDir()
    extensionsDir = path.join(dataDir, 'extensions')
    extensionsDevDir = path.join(extensionsDir, '.dev')
    fs.mkdirSync(extensionsDir, { recursive: true })
  })

  afterEach(() => {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true })
    } catch {}
  })

  describe('POST /extensions/uninstall', () => {
    it('wipes BOTH the real install dir and the dev symlink for the same id', async () => {
      const cleanup = makeFakeSharedState({ devMode: 'symlink' })
      const realDir = path.join(extensionsDir, 'whatsapp')
      const devLink = path.join(extensionsDevDir, 'whatsapp')
      writeManifest(realDir, { id: 'whatsapp', name: 'Loja' })
      fs.mkdirSync(extensionsDevDir, { recursive: true })
      fs.symlinkSync(realDir, devLink, 'dir')

      const store = {
        extensions: [{ id: 'whatsapp', enabled: true, source: 'symlink' }],
        settings: { dev_mode: 'symlink' },
        skillKeywords: {}
      }
      const calls = []
      const ctx = {
        skillRegistry: makeRegistryWithInstallPaths({ extensionsDir, extensionsDevDir }),
        buildExtensionsPayload: async () => [],
        sendJson: (res, status, data) => {
          calls.push({ status, data })
        },
        readJsonBody: async () => ({ id: 'whatsapp' }),
        store,
        saveStore: () => {},
        ensureDir: () => {},
        extensionHostManager: { stopPersistent: async () => {} }
      }
      const handler = createExtensionsRoutes(ctx)
      const res = makeMockRes()

      const handled = await handler({ method: 'POST' }, res, '/extensions/uninstall', {
        searchParams: new URLSearchParams()
      })

      expect(handled).toBe(true)
      expect(fs.existsSync(realDir)).toBe(true)  // devMode=symlink, only .dev/ is removed
      expect(fs.existsSync(devLink)).toBe(false)
      expect(store.extensions).toEqual([])

      cleanup()
    })

    it('drops legacy `<id>_dev` store entry on uninstall (back-compat migration)', async () => {
      const cleanup = makeFakeSharedState({ devMode: 'symlink' })
      const store = {
        extensions: [
          { id: 'whatsapp', enabled: true, source: 'symlink' },
          { id: 'whatsapp_dev', enabled: true, source: 'symlink' }
        ],
        settings: { dev_mode: 'symlink' },
        skillKeywords: {}
      }
      const calls = []
      const ctx = {
        skillRegistry: makeRegistryWithInstallPaths({ extensionsDir, extensionsDevDir }),
        buildExtensionsPayload: async () => [],
        sendJson: (res, status, data) => calls.push({ status, data }),
        readJsonBody: async () => ({ id: 'whatsapp' }),
        store,
        saveStore: () => {},
        ensureDir: () => {},
        extensionHostManager: { stopPersistent: async () => {} }
      }
      const handler = createExtensionsRoutes(ctx)
      const res = makeMockRes()

      await handler({ method: 'POST' }, res, '/extensions/uninstall', {
        searchParams: new URLSearchParams()
      })

      expect(store.extensions).toEqual([])

      cleanup()
    })
  })

  describe('POST /extensions/toggle', () => {
    it('uses the mode-stable key `id` (no `_dev` suffix) regardless of dev_mode', async () => {
      const cleanup = makeFakeSharedState({ devMode: 'symlink' })
      const store = { extensions: [], settings: { dev_mode: 'symlink' }, skillKeywords: {} }
      const ctx = {
        skillRegistry: makeRegistryWithInstallPaths({ extensionsDir, extensionsDevDir }),
        buildExtensionsPayload: async () => [],
        sendJson: (res, status, data) => {},
        readJsonBody: async () => ({ id: 'whatsapp', enabled: false }),
        store,
        saveStore: () => {},
        ensureDir: () => {},
        extensionHostManager: { stopPersistent: async () => {}, startPersistent: async () => {} }
      }
      const handler = createExtensionsRoutes(ctx)
      const res = makeMockRes()

      await handler({ method: 'POST' }, res, '/extensions/toggle', {
        searchParams: new URLSearchParams()
      })

      expect(store.extensions).toHaveLength(1)
      expect(store.extensions[0].id).toBe('whatsapp')
      expect(store.extensions[0].source).toBe('symlink')
      expect(store.extensions[0].enabled).toBe(false)

      cleanup()
    })
  })

  describe('cleanupOppositeModeArtifact', () => {
    it('in symlink mode: does NOT delete the real install dir', () => {
      const realDir = path.join(extensionsDir, 'whatsapp')
      const devLink = path.join(extensionsDevDir, 'whatsapp')
      writeManifest(realDir, { id: 'whatsapp', name: 'Real', version: '1.0.0' })

      cleanupOppositeModeArtifact(extensionsDir, extensionsDevDir, 'whatsapp', 'symlink')

      expect(fs.existsSync(realDir)).toBe(true)
      expect(fs.existsSync(path.join(realDir, 'manifest.json'))).toBe(true)
      expect(fs.existsSync(devLink)).toBe(false)
    })

    it('in symlink mode: removes a stale real .dev/<id> directory', () => {
      const realDir = path.join(extensionsDir, 'whatsapp')
      const devDir = path.join(extensionsDevDir, 'whatsapp')
      writeManifest(realDir, { id: 'whatsapp', name: 'Real', version: '1.0.0' })
      // Simulate a leftover store_test artifact under .dev/<id>
      writeManifest(devDir, { id: 'whatsapp', name: 'Dev', version: '2.0.0' })

      cleanupOppositeModeArtifact(extensionsDir, extensionsDevDir, 'whatsapp', 'symlink')

      expect(fs.existsSync(realDir)).toBe(true)
      expect(fs.existsSync(devDir)).toBe(false)
    })

    it('in symlink mode: preserves an existing .dev/<id> symlink', () => {
      const realDir = path.join(extensionsDir, 'whatsapp')
      const devLink = path.join(extensionsDevDir, 'whatsapp')
      writeManifest(realDir, { id: 'whatsapp', name: 'Real', version: '1.0.0' })
      fs.mkdirSync(extensionsDevDir, { recursive: true })
      fs.symlinkSync(realDir, devLink, 'dir')

      cleanupOppositeModeArtifact(extensionsDir, extensionsDevDir, 'whatsapp', 'symlink')

      expect(fs.existsSync(realDir)).toBe(true)
      const lstat = fs.lstatSync(devLink)
      expect(lstat.isSymbolicLink()).toBe(true)
    })

    it('in store_test mode: preserves .dev/<id> symlink (symlinks represent local checkouts)', () => {
      const realDir = path.join(extensionsDir, 'whatsapp')
      const devLink = path.join(extensionsDevDir, 'whatsapp')
      writeManifest(realDir, { id: 'whatsapp', name: 'Real', version: '1.0.0' })
      fs.mkdirSync(extensionsDevDir, { recursive: true })
      fs.symlinkSync(realDir, devLink, 'dir')

      cleanupOppositeModeArtifact(extensionsDir, extensionsDevDir, 'whatsapp', 'store_test')

      expect(fs.existsSync(realDir)).toBe(true)
      expect(fs.existsSync(devLink)).toBe(true)  // symlinks are NEVER deleted
    })

    it('in store mode (production): preserves .dev/<id> symlink (symlinks represent local checkouts)', () => {
      const realDir = path.join(extensionsDir, 'whatsapp')
      const devLink = path.join(extensionsDevDir, 'whatsapp')
      writeManifest(realDir, { id: 'whatsapp', name: 'Real', version: '1.0.0' })
      fs.mkdirSync(extensionsDevDir, { recursive: true })
      fs.symlinkSync(realDir, devLink, 'dir')

      cleanupOppositeModeArtifact(extensionsDir, extensionsDevDir, 'whatsapp', 'store')

      expect(fs.existsSync(realDir)).toBe(true)
      expect(fs.existsSync(devLink)).toBe(true)  // symlinks are NEVER deleted
    })
  })
})
