const {
  usesLocalInstallRegistry,
  loadInstallRegistry,
  _setInstallRegistryForTests,
  _clearInstallRegistryCache
} = require('./install-registry')

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
})
