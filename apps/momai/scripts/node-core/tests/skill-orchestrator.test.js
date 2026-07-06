const { computeCompatStatus } = require('../services/skill-orchestrator')

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
