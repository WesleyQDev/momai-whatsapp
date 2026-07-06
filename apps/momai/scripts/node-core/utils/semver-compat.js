/**
 * Lightweight semver utilities for extension version compatibility.
 * No external dependencies — handles the subset of semver needed by MomAI.
 */

function parseVersion(str) {
  if (!str || typeof str !== 'string') return null
  const cleaned = str.trim().replace(/^v/i, '')
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw: cleaned
  }
}

function compareVersions(a, b) {
  const va = typeof a === 'string' ? parseVersion(a) : a
  const vb = typeof b === 'string' ? parseVersion(b) : b
  if (!va && !vb) return 0
  if (!va) return -1
  if (!vb) return 1
  if (va.major !== vb.major) return va.major - vb.major
  if (va.minor !== vb.minor) return va.minor - vb.minor
  return va.patch - vb.patch
}

/**
 * Check if `version` satisfies a single comparator like ">=1.4.0" or "<2.0.0".
 */
function satisfiesComparator(version, comparator) {
  const match = comparator.trim().match(/^(>=|<=|>|<|=|~|\^)?(.+)$/)
  if (!match) return false
  const op = match[1] || '='
  const target = parseVersion(match[2])
  const ver = typeof version === 'string' ? parseVersion(version) : version
  if (!target || !ver) return false

  const cmp = compareVersions(ver, target)

  switch (op) {
    case '>=':
      return cmp >= 0
    case '<=':
      return cmp <= 0
    case '>':
      return cmp > 0
    case '<':
      return cmp < 0
    case '=':
      return cmp === 0
    case '^':
      if (target.major > 0) {
        return ver.major === target.major && cmp >= 0
      }
      if (target.minor > 0) {
        return ver.major === 0 && ver.minor === target.minor && cmp >= 0
      }
      return ver.major === 0 && ver.minor === 0 && ver.patch === target.patch && cmp >= 0
    case '~':
      // ~1.4.0 means >=1.4.0 <1.5.0 (same major.minor)
      return ver.major === target.major && ver.minor === target.minor && cmp >= 0
    default:
      return cmp === 0
  }
}

/**
 * Check if `version` satisfies a range string.
 * Supports space-separated comparators (AND logic): ">=1.4.0 <2.0.0"
 * If range is empty/null, returns true (no constraint = always compatible).
 */
function satisfiesRange(version, range) {
  if (!range || typeof range !== 'string' || !range.trim()) return true
  const ver = typeof version === 'string' ? parseVersion(version) : version
  if (!ver) return false

  const comparators = range.trim().split(/\s+/)
  return comparators.every((comp) => satisfiesComparator(ver, comp))
}

/**
 * From a list of releases, find the best (highest version) that is compatible
 * with the given appVersion.
 */
function findBestCompatibleRelease(releases, appVersion) {
  if (!releases || !releases.length) return null
  const compatible = releases
    .filter((r) => satisfiesRange(appVersion, r.momai_compat))
    .sort((a, b) => compareVersions(b.version, a.version))
  return compatible[0] || null
}

/**
 * Categorize releases into compatible and incompatible groups.
 */
function categorizeReleases(releases, appVersion) {
  const compatible = []
  const incompatible = []
  for (const release of releases) {
    if (satisfiesRange(appVersion, release.momai_compat)) {
      compatible.push({ ...release, compatible: true })
    } else {
      incompatible.push({ ...release, compatible: false })
    }
  }
  compatible.sort((a, b) => compareVersions(b.version, a.version))
  incompatible.sort((a, b) => compareVersions(b.version, a.version))
  return { compatible, incompatible }
}

module.exports = {
  parseVersion,
  compareVersions,
  satisfiesRange,
  satisfiesComparator,
  findBestCompatibleRelease,
  categorizeReleases
}
