const { computeCompatStatus, isSkillEnabledByStore } = require('../services/skill-orchestrator')
const shared = require('../services/shared-state')

describe('computeCompatStatus', () => {
  it('returns "unknown" when momai_compat is null/undefined/empty', () => {
    expect(computeCompatStatus('1.5.2', null)).toBe('unknown')
    expect(computeCompatStatus('1.5.2', undefined)).toBe('unknown')
    expect(computeCompatStatus('1.5.2', '')).toBe('unknown')
  })

  it('returns "compatible" when appVersion satisfies momai_compat range', () => {
    expect(computeCompatStatus('1.5.2', '>=1.4.0 <2.0.0')).toBe('compatible')
    expect(computeCompatStatus('1.5.2', '>=1.5.0')).toBe('compatible')
    expect(computeCompatStatus('1.5.2', '1.5.2')).toBe('compatible')
  })

  it('returns "incompatible" when appVersion does NOT satisfy momai_compat range', () => {
    expect(computeCompatStatus('1.5.2', '>=2.0.0')).toBe('incompatible')
    expect(computeCompatStatus('1.5.2', '<1.5.0')).toBe('incompatible')
    expect(computeCompatStatus('1.5.2', '>=1.4.0 <1.5.0')).toBe('incompatible')
  })

  it('works with pre-release versions', () => {
    expect(computeCompatStatus('1.5.2', '>=1.0.0 <2.0.0')).toBe('compatible')
  })
})

describe('isSkillEnabledByStore — mode-stable key', () => {
  afterEach(() => {
    delete shared.store
  })

  it('reads the mode-stable key `id` in symlink mode', () => {
    shared.store = {
      settings: { dev_mode: 'symlink' },
      extensions: [{ id: 'whatsapp', enabled: false, source: 'symlink' }]
    }
    expect(isSkillEnabledByStore({ id: 'whatsapp', kind: 'extension' })).toBe(false)
  })

  it('reads the mode-stable key `id` in store_test mode', () => {
    shared.store = {
      settings: { dev_mode: 'store_test' },
      extensions: [{ id: 'whatsapp', enabled: true, source: 'store_test' }]
    }
    expect(isSkillEnabledByStore({ id: 'whatsapp', kind: 'extension' })).toBe(true)
  })

  it('falls back to legacy `<id>_dev` entry when no base entry exists', () => {
    shared.store = {
      settings: { dev_mode: 'symlink' },
      extensions: [{ id: 'whatsapp_dev', enabled: true }]
    }
    expect(isSkillEnabledByStore({ id: 'whatsapp', kind: 'extension' })).toBe(true)
  })

  it('returns false for an extension with no matching store entry', () => {
    shared.store = { settings: { dev_mode: 'symlink' }, extensions: [] }
    expect(isSkillEnabledByStore({ id: 'whatsapp', kind: 'extension' })).toBe(false)
  })

  it('builtin skills default to enabled when no store entry exists', () => {
    shared.store = { settings: { dev_mode: 'symlink' }, extensions: [] }
    expect(isSkillEnabledByStore({ id: 'memory', kind: 'builtin' })).toBe(true)
  })
})
