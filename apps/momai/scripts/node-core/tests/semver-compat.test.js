const {
  parseVersion,
  compareVersions,
  satisfiesRange,
  findBestCompatibleRelease,
  categorizeReleases
} = require('../utils/semver-compat')

test('parseVersion handles standard SemVer and v prefix', () => {
  expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, raw: '1.2.3' })
  expect(parseVersion('v2.0.1')).toEqual({ major: 2, minor: 0, patch: 1, raw: '2.0.1' })
  expect(parseVersion('  v0.4.15  ')).toEqual({ major: 0, minor: 4, patch: 15, raw: '0.4.15' })
  expect(parseVersion('invalid')).toBeNull()
})

test('compareVersions sorts versions correctly', () => {
  expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
  expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0)
  expect(compareVersions('1.5.0', '1.4.9')).toBeGreaterThan(0)
})

test('satisfiesRange checks constraints correctly', () => {
  // Empty ranges (no constraint) are always compatible
  expect(satisfiesRange('1.5.2', '')).toBe(true)
  expect(satisfiesRange('1.5.2', null)).toBe(true)

  // Single operators
  expect(satisfiesRange('1.5.2', '>=1.4.0')).toBe(true)
  expect(satisfiesRange('1.3.0', '>=1.4.0')).toBe(false)
  expect(satisfiesRange('1.5.2', '<2.0.0')).toBe(true)
  expect(satisfiesRange('2.0.1', '<2.0.0')).toBe(false)

  // Ranges
  expect(satisfiesRange('1.5.2', '>=1.4.0 <2.0.0')).toBe(true)
  expect(satisfiesRange('2.1.0', '>=1.4.0 <2.0.0')).toBe(false)
  expect(satisfiesRange('1.3.9', '>=1.4.0 <2.0.0')).toBe(false)

  // Caret (^) operator
  expect(satisfiesRange('1.5.2', '^1.4.0')).toBe(true)
  expect(satisfiesRange('2.0.0', '^1.4.0')).toBe(false)

  // Tilde (~) operator
  expect(satisfiesRange('1.4.5', '~1.4.0')).toBe(true)
  expect(satisfiesRange('1.5.0', '~1.4.0')).toBe(false)
})

test('findBestCompatibleRelease picks highest compatible version', () => {
  const releases = [
    { version: '0.3.15', momai_compat: '>=1.4.0 <2.0.0' },
    { version: '0.3.16', momai_compat: '>=1.4.0 <2.0.0' },
    { version: '0.4.0', momai_compat: '>=2.0.0' }
  ]

  const best = findBestCompatibleRelease(releases, '1.5.2')
  expect(best).not.toBeNull()
  expect(best.version).toBe('0.3.16')

  const bestV2 = findBestCompatibleRelease(releases, '2.1.0')
  expect(bestV2).not.toBeNull()
  expect(bestV2.version).toBe('0.4.0')
})

test('categorizeReleases groups compatible and incompatible versions', () => {
  const releases = [
    { version: '0.3.15', momai_compat: '>=1.4.0 <2.0.0' },
    { version: '0.3.16', momai_compat: '>=1.4.0 <2.0.0' },
    { version: '0.4.0', momai_compat: '>=2.0.0' }
  ]

  const { compatible, incompatible } = categorizeReleases(releases, '1.5.2')
  expect(compatible.map(r => r.version)).toEqual(['0.3.16', '0.3.15'])
  expect(incompatible.map(r => r.version)).toEqual(['0.4.0'])
})
