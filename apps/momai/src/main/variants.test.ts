import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('variants', () => {
  const ORIGINAL_ENV = process.env.MOMAI_VARIANT

  beforeEach(() => {
    delete process.env.MOMAI_VARIANT
    vi.resetModules()
  })

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.MOMAI_VARIANT
    } else {
      process.env.MOMAI_VARIANT = ORIGINAL_ENV
    }
    vi.resetModules()
  })

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

  it('no two variants share the same (corePort, pythonPort) pair', async () => {
    const { VARIANTS } = await loadFresh()
    const pairs = Object.values(VARIANTS).map((v: any) => `${v.corePort}/${v.pythonPort}`)
    expect(new Set(pairs).size).toBe(pairs.length)
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
})
