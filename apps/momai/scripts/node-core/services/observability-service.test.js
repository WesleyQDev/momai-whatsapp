// TDD: verifies the legacy observability-metrics file at <DATA_DIR>/ is
// migrated to <DATA_DIR>/cache/ when migrateLegacyMetricsFile() is called.
// The migration is:
//   - idempotent: no-op when the legacy file is absent
//   - guarded: never overwrites an existing file at the new location
//   - atomic: file is moved (rename), not copied
//   - error-safe: filesystem errors are caught and reported via info()
//
// See Task 2.4 of the privacy plan:
//   docs/superpowers/plans/2026-06-23-momai-privacy-data-cleanup.md (R004)

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

describe('observability-service: legacy metrics file migration (R004)', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-obs-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('moves the legacy file to the new location and preserves its contents', () => {
    const { migrateLegacyMetricsFile } = require('../services/observability-service')
    const legacyPath = path.join(tmpDir, 'observability-metrics.json')
    const newPath = path.join(tmpDir, 'cache', 'observability-metrics.json')
    const seed = [{ timestamp: 1, duration_ms: 100, tokens_per_second: 50 }]
    fs.writeFileSync(legacyPath, JSON.stringify(seed), 'utf8')

    const moved = migrateLegacyMetricsFile(legacyPath, newPath)

    expect(moved).toBe(true)
    expect(fs.existsSync(legacyPath)).toBe(false)
    expect(fs.existsSync(newPath)).toBe(true)
    expect(JSON.parse(fs.readFileSync(newPath, 'utf8'))).toEqual(seed)
  })

  it('creates the destination directory if it does not exist', () => {
    const { migrateLegacyMetricsFile } = require('../services/observability-service')
    const legacyPath = path.join(tmpDir, 'observability-metrics.json')
    const newPath = path.join(tmpDir, 'cache', 'observability-metrics.json')
    fs.writeFileSync(legacyPath, '[]', 'utf8')

    expect(fs.existsSync(path.dirname(newPath))).toBe(false)
    expect(migrateLegacyMetricsFile(legacyPath, newPath)).toBe(true)
    expect(fs.existsSync(newPath)).toBe(true)
  })

  it('is a no-op when the legacy file is absent (fresh install)', () => {
    const { migrateLegacyMetricsFile } = require('../services/observability-service')
    const legacyPath = path.join(tmpDir, 'observability-metrics.json')
    const newPath = path.join(tmpDir, 'cache', 'observability-metrics.json')

    expect(fs.existsSync(legacyPath)).toBe(false)
    expect(migrateLegacyMetricsFile(legacyPath, newPath)).toBe(false)
    expect(fs.existsSync(newPath)).toBe(false)
  })

  it('does NOT overwrite a pre-existing file at the new location', () => {
    const { migrateLegacyMetricsFile } = require('../services/observability-service')
    const legacyPath = path.join(tmpDir, 'observability-metrics.json')
    const newPath = path.join(tmpDir, 'cache', 'observability-metrics.json')
    fs.writeFileSync(legacyPath, JSON.stringify([{ from: 'legacy' }]), 'utf8')
    fs.mkdirSync(path.dirname(newPath), { recursive: true })
    fs.writeFileSync(newPath, JSON.stringify([{ from: 'new' }]), 'utf8')

    expect(migrateLegacyMetricsFile(legacyPath, newPath)).toBe(false)

    // legacy file is preserved untouched (migration skipped)
    expect(fs.existsSync(legacyPath)).toBe(true)
    // destination kept the user's data
    expect(JSON.parse(fs.readFileSync(newPath, 'utf8'))).toEqual([{ from: 'new' }])
  })

  it('returns false and does not throw when given missing or empty paths', () => {
    const { migrateLegacyMetricsFile } = require('../services/observability-service')
    expect(migrateLegacyMetricsFile('', '')).toBe(false)
    expect(migrateLegacyMetricsFile(null, null)).toBe(false)
    expect(migrateLegacyMetricsFile(undefined, undefined)).toBe(false)
  })
})
