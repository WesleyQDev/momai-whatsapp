import { describe, it, expect } from 'vitest'
import { sanitizeLog } from './logger'

describe('sanitizeLog', () => {
  it('redacts user_name, api_key, password, token, bearer', () => {
    expect(sanitizeLog('user_name=john')).toContain('[REDACTED]')
    expect(sanitizeLog('api_key=sk-abc123')).toContain('[REDACTED]')
    expect(sanitizeLog('password=hunter2')).toContain('[REDACTED]')
    expect(sanitizeLog('token=abc.def.ghi')).toContain('[REDACTED]')
    expect(sanitizeLog('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toContain(
      '[REDACTED]'
    )
  })

  it('leaves normal text untouched', () => {
    expect(sanitizeLog('Starting model download')).toBe('Starting model download')
  })

  it('redacts JSON-style secrets (key comes before colon)', () => {
    expect(sanitizeLog('{"user_name": "john"}')).toContain('[REDACTED]')
    expect(sanitizeLog('{"user_name": "john"}')).not.toContain('john')
    expect(sanitizeLog('{"api_key": "sk-abc123"}')).toContain('[REDACTED]')
    expect(sanitizeLog('{"api_key": "sk-abc123"}')).not.toContain('sk-abc123')
    expect(sanitizeLog('{"password": "hunter2"}')).toContain('[REDACTED]')
    expect(sanitizeLog('{"password": "hunter2"}')).not.toContain('hunter2')
    expect(sanitizeLog('{"token": "abc.def.ghi"}')).toContain('[REDACTED]')
    expect(sanitizeLog('{"token": "abc.def.ghi"}')).not.toContain('abc.def.ghi')
    expect(sanitizeLog('{"Bearer": "eyJhbGciOiJIUzI1NiJ9"}')).toContain('[REDACTED]')
    expect(sanitizeLog('{"Bearer": "eyJhbGciOiJIUzI1NiJ9"}')).not.toContain('eyJhbGciOiJIUzI1NiJ9')
  })

  it('redacts compound OAuth-style token names', () => {
    expect(sanitizeLog('auth_token=secret123')).toContain('[REDACTED]')
    expect(sanitizeLog('auth_token=secret123')).not.toContain('secret123')
    expect(sanitizeLog('access_token=secret456')).toContain('[REDACTED]')
    expect(sanitizeLog('access_token=secret456')).not.toContain('secret456')
    expect(sanitizeLog('refresh_token=secret789')).toContain('[REDACTED]')
    expect(sanitizeLog('refresh_token=secret789')).not.toContain('secret789')
    expect(sanitizeLog('id_token=eyJabc.def.ghi')).toContain('[REDACTED]')
    expect(sanitizeLog('session_token=sess_xyz')).toContain('[REDACTED]')
  })

  it('does not redact "token" inside unrelated words like "tokenization"', () => {
    expect(sanitizeLog('tokenization=foo')).toBe('tokenization=foo')
    expect(sanitizeLog('The tokenization layer')).toBe('The tokenization layer')
  })
})
