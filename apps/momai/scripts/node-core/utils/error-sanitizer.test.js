const { sanitizeError, isSafeErrorMessage } = require('./error-sanitizer.js')

describe('sanitizeError', () => {
  it('returns generic message for production', () => {
    const out = sanitizeError(new Error("ENOENT: no such file or directory, open '/etc/passwd'"), { isDev: false })
    expect(out.status).toBe(500)
    expect(out.body).toEqual({ ok: false, error: 'Internal server error' })
  })

  it('returns dev message when isDev', () => {
    const out = sanitizeError(new Error('boom'), { isDev: true })
    expect(out.body.error).toBe('boom')
  })
})

describe('isSafeErrorMessage', () => {
  it('accepts generic messages', () => {
    expect(isSafeErrorMessage('Internal error')).toBe(true)
    expect(isSafeErrorMessage('Service unavailable')).toBe(true)
    expect(isSafeErrorMessage('Bad request')).toBe(true)
  })

  it('rejects messages with stack traces', () => {
    expect(isSafeErrorMessage('Error: foo at /path/to/file.js:42:5')).toBe(false)
  })

  it('rejects messages with file paths', () => {
    expect(isSafeErrorMessage('ENOENT: /etc/passwd')).toBe(false)
    expect(isSafeErrorMessage('C:\\Users\\admin\\file.txt not found')).toBe(false)
  })
})
