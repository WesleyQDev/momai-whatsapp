const { computeSha256, verifyChecksum } = require('./extension-checksum.js')

describe('computeSha256', () => {
  it('returns the hex SHA-256 of a buffer', () => {
    const data = Buffer.from('hello world')
    const expected = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    expect(computeSha256(data)).toBe(expected)
  })

  it('produces stable output for the same input', () => {
    const a = computeSha256(Buffer.from('test'))
    const b = computeSha256(Buffer.from('test'))
    expect(a).toBe(b)
  })
})

describe('verifyChecksum', () => {
  it('returns { ok: true } when the checksum matches', () => {
    const data = Buffer.from('match me')
    const sha = computeSha256(data)
    expect(verifyChecksum(data, sha)).toEqual({ ok: true })
  })

  it('returns { ok: false, reason: "mismatch" } when the checksum differs', () => {
    const data = Buffer.from('actual content')
    expect(
      verifyChecksum(data, '0000000000000000000000000000000000000000000000000000000000000000')
    ).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('returns { ok: false, reason: "missing" } when expected is null/undefined/empty', () => {
    expect(verifyChecksum(Buffer.from('x'), null)).toEqual({ ok: false, reason: 'missing' })
    expect(verifyChecksum(Buffer.from('x'), undefined)).toEqual({ ok: false, reason: 'missing' })
    expect(verifyChecksum(Buffer.from('x'), '')).toEqual({ ok: false, reason: 'missing' })
  })

  it('returns { ok: false, reason: "invalid_format" } when expected is not 64 hex chars', () => {
    expect(verifyChecksum(Buffer.from('x'), 'too-short')).toEqual({
      ok: false,
      reason: 'invalid_format'
    })
    expect(verifyChecksum(Buffer.from('x'), 'Z'.repeat(64))).toEqual({
      ok: false,
      reason: 'invalid_format'
    })
  })
})
