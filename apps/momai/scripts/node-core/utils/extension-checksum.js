const crypto = require('node:crypto')

function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

const SHA256_RE = /^[0-9a-f]{64}$/i

function verifyChecksum(data, expected) {
  if (expected === null || expected === undefined || expected === '') {
    return { ok: false, reason: 'missing' }
  }
  if (typeof expected !== 'string' || !SHA256_RE.test(expected)) {
    return { ok: false, reason: 'invalid_format' }
  }
  const actual = computeSha256(data)
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true }
}

module.exports = { computeSha256, verifyChecksum }
