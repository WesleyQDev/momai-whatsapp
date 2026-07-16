const {
  usesLocalInstallRegistry,
  loadInstallRegistry,
  getEffectiveDevMode,
  _setInstallRegistryForTests,
  _clearInstallRegistryCache
} = require('./install-registry')
const communityRegistry = require('../services/community-registry')

describe('install-registry', () => {
  const originalPackaged = process.env.MOMAI_IS_PACKAGED

  afterEach(() => {
    _clearInstallRegistryCache()
    if (originalPackaged === undefined) delete process.env.MOMAI_IS_PACKAGED
    else process.env.MOMAI_IS_PACKAGED = originalPackaged
  })

  it('uses local registry in dev (MOMAI_IS_PACKAGED unset)', () => {
    delete process.env.MOMAI_IS_PACKAGED
    expect(usesLocalInstallRegistry()).toBe(true)
  })

  it('uses community catalog in packaged builds', () => {
    process.env.MOMAI_IS_PACKAGED = '1'
    expect(usesLocalInstallRegistry()).toBe(false)
  })

  it('loadInstallRegistry returns cached test registry', async () => {
    _setInstallRegistryForTests({
      extensions: [{ id: 'whatsapp', download_url: 'https://example.com/w.zip' }]
    })
    const registry = await loadInstallRegistry()
    expect(registry.extensions[0].download_url).toBe('https://example.com/w.zip')
  })

  it('preserves repo and other community fields when normalizing catalog', async () => {
    process.env.MOMAI_IS_PACKAGED = '1'
    const originalFetchRegistry = communityRegistry.fetchRegistry
    communityRegistry.fetchRegistry = async () => [
      {
        id: 'whatsapp',
        name: 'WhatsApp',
        description: '...',
        author: 'WesleyQDev',
        version: '0.3.31',
        download_url: 'https://example.com/w.zip',
        repo: 'WesleyQDev/momai-whatsapp-extension',
        category: 'utility',
        icon: 'WhatsApp'
      }
    ]

    try {
      const registry = await loadInstallRegistry()
      const ext = registry.extensions[0]
      expect(ext.id).toBe('whatsapp')
      expect(ext.repo).toBe('WesleyQDev/momai-whatsapp-extension')
      expect(ext.category).toBe('utility')
      expect(ext.icon).toBe('WhatsApp')
      expect(ext.download_url).toBe('https://example.com/w.zip')
      expect(ext.is_official).toBe(true)
    } finally {
      communityRegistry.fetchRegistry = originalFetchRegistry
    }
  })

  it('sets is_official to false for non-WesleyQDev authors when missing', async () => {
    process.env.MOMAI_IS_PACKAGED = '1'
    const originalFetchRegistry = communityRegistry.fetchRegistry
    communityRegistry.fetchRegistry = async () => [
      {
        id: 'third-party',
        name: 'Third',
        author: 'someone',
        download_url: 'https://example.com/t.zip',
        repo: 'someone/ext'
      }
    ]

    try {
      const registry = await loadInstallRegistry()
      const ext = registry.extensions[0]
      expect(ext.is_official).toBe(false)
      expect(ext.repo).toBe('someone/ext')
    } finally {
      communityRegistry.fetchRegistry = originalFetchRegistry
    }
  })

  describe('getEffectiveDevMode', () => {
    it('returns store in packaged builds regardless of settings', () => {
      process.env.MOMAI_IS_PACKAGED = '1'
      expect(getEffectiveDevMode('symlink')).toBe('store')
      expect(getEffectiveDevMode('store_test')).toBe('store')
      expect(getEffectiveDevMode(undefined)).toBe('store')
    })

    it('returns settings dev_mode in development', () => {
      delete process.env.MOMAI_IS_PACKAGED
      expect(getEffectiveDevMode('symlink')).toBe('symlink')
      expect(getEffectiveDevMode('store_test')).toBe('store_test')
    })

    it('defaults to symlink in development when no setting is provided', () => {
      delete process.env.MOMAI_IS_PACKAGED
      expect(getEffectiveDevMode(undefined)).toBe('symlink')
      expect(getEffectiveDevMode(null)).toBe('symlink')
    })
  })
})
