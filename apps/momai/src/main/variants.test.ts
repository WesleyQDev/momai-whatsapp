import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { app } from 'electron'

describe('variants', () => {
  const ORIGINAL_ENV = process.env.MOMAI_VARIANT
  const ORIGINAL_IS_PACKAGED = app.isPackaged
  const ORIGINAL_PLATFORM = process.platform
  let originalGetPath: any
  let originalGetName: any

  beforeEach(() => {
    delete process.env.MOMAI_VARIANT
    originalGetPath = app.getPath
    originalGetName = app.getName
    vi.resetModules()
  })

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.MOMAI_VARIANT
    } else {
      process.env.MOMAI_VARIANT = ORIGINAL_ENV
    }
    Object.defineProperty(app, 'isPackaged', {
      value: ORIGINAL_IS_PACKAGED,
      configurable: true
    })
    app.getPath = originalGetPath
    app.getName = originalGetName
    Object.defineProperty(process, 'platform', {
      value: ORIGINAL_PLATFORM,
      configurable: true
    })
    vi.resetModules()
  })

  function setPlatform(platform: string) {
    Object.defineProperty(process, 'platform', {
      value: platform,
      configurable: true
    })
  }

  function mockApp(isPackaged: boolean, exePath: string, appName: string) {
    Object.defineProperty(app, 'isPackaged', {
      value: isPackaged,
      configurable: true
    })
    app.getPath = vi.fn().mockImplementation((name: string) => {
      if (name === 'exe') return exePath
      return '/mock/default'
    })
    app.getName = vi.fn().mockReturnValue(appName)
  }

  async function loadFresh() {
    // Re-evaluate variants module so CURRENT_VARIANT picks up the current env
    return await import('./variants')
  }

  it('exports all 4 variants in the table', async () => {
    const { VARIANTS, CURRENT_VARIANT } = await loadFresh()
    expect(Object.keys(VARIANTS).sort()).toEqual(['appx-store', 'appx-test', 'dev', 'nsis'])
    expect(CURRENT_VARIANT.variant).toBe('dev')
  })

  it('defaults to dev when MOMAI_VARIANT is unset', async () => {
    delete process.env.MOMAI_VARIANT
    const { CURRENT_VARIANT } = await loadFresh()
    expect(CURRENT_VARIANT.variant).toBe('dev')
    expect(CURRENT_VARIANT.appId).toBe('com.wesleyqdev.momai.dev')
    expect(CURRENT_VARIANT.corePort).toBe(8050)
  })

  it('picks the nsis entry when MOMAI_VARIANT=nsis', async () => {
    process.env.MOMAI_VARIANT = 'nsis'
    const { CURRENT_VARIANT } = await loadFresh()
    expect(CURRENT_VARIANT.appId).toBe('com.wesleyqdev.momai.nsis')
    expect(CURRENT_VARIANT.appName).toBe('MomAI')
    expect(CURRENT_VARIANT.corePort).toBe(8100)
    expect(CURRENT_VARIANT.pythonPort).toBe(8101)
    expect(CURRENT_VARIANT.llamaPort).toBe(8102)
    expect(CURRENT_VARIANT.embeddingPort).toBe(8103)
  })

  it('picks the appx-store entry when MOMAI_VARIANT=appx-store', async () => {
    process.env.MOMAI_VARIANT = 'appx-store'
    const { CURRENT_VARIANT } = await loadFresh()
    expect(CURRENT_VARIANT.appId).toBe('com.wesleyqdev.momai')
    expect(CURRENT_VARIANT.corePort).toBe(8200)
  })

  it('picks the appx-test entry when MOMAI_VARIANT=appx-test', async () => {
    process.env.MOMAI_VARIANT = 'appx-test'
    const { CURRENT_VARIANT } = await loadFresh()
    expect(CURRENT_VARIANT.appId).toBe('com.wesleyqdev.momai.test')
    expect(CURRENT_VARIANT.corePort).toBe(8300)
  })

  it('falls back to dev for unknown MOMAI_VARIANT values', async () => {
    process.env.MOMAI_VARIANT = 'mystery'
    const { CURRENT_VARIANT } = await loadFresh()
    expect(CURRENT_VARIANT.variant).toBe('dev')
  })

  it('no two variants share the same appId', async () => {
    const { VARIANTS } = await loadFresh()
    const ids = Object.values(VARIANTS).map((v: any) => v.appId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no two variants share the same (corePort, pythonPort, llamaPort, embeddingPort) tuple', async () => {
    const { VARIANTS } = await loadFresh()
    const tuples = Object.values(VARIANTS).map(
      (v: any) => `${v.corePort}/${v.pythonPort}/${v.llamaPort}/${v.embeddingPort}`
    )
    expect(new Set(tuples).size).toBe(tuples.length)
  })

  it('isValidVariant returns true for known variants and false otherwise', async () => {
    const { isValidVariant } = await loadFresh()
    expect(isValidVariant('dev')).toBe(true)
    expect(isValidVariant('nsis')).toBe(true)
    expect(isValidVariant('appx-store')).toBe(true)
    expect(isValidVariant('appx-test')).toBe(true)
    expect(isValidVariant('mystery')).toBe(false)
    expect(isValidVariant('')).toBe(false)
  })

  describe('dynamic runtime detection (when MOMAI_VARIANT is unset)', () => {
    it('detects dev when isPackaged is false', async () => {
      mockApp(false, '/path/to/exe', 'MomAI')
      const { CURRENT_VARIANT } = await loadFresh()
      expect(CURRENT_VARIANT.variant).toBe('dev')
    })

    it('detects nsis when isPackaged is true and path is regular', async () => {
      mockApp(true, '/path/to/momai.exe', 'MomAI')
      const { CURRENT_VARIANT } = await loadFresh()
      expect(CURRENT_VARIANT.variant).toBe('nsis')
    })

    it('detects appx-store when isPackaged is true, win32, and path has WindowsApps', async () => {
      setPlatform('win32')
      mockApp(
        true,
        'C:\\Program Files\\WindowsApps\\com.wesleyqdev.momai_1.0.0.0_x64__pubid\\momai.exe',
        'MomAI'
      )
      const { CURRENT_VARIANT } = await loadFresh()
      expect(CURRENT_VARIANT.variant).toBe('appx-store')
    })

    it('detects appx-test when isPackaged is true, win32, path has WindowsApps, and name has Teste', async () => {
      setPlatform('win32')
      mockApp(
        true,
        'C:\\Program Files\\WindowsApps\\com.wesleyqdev.momai.test_1.0.0.0_x64__pubid\\momai.exe',
        'MomAI - Teste'
      )
      const { CURRENT_VARIANT } = await loadFresh()
      expect(CURRENT_VARIANT.variant).toBe('appx-test')
    })
  })
})
