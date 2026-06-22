import { describe, it, expect } from 'vitest'
import { buildEnv, checkWritePermission } from './python/utils/fs-helpers'

describe('buildEnv', () => {
  it('returns object with required keys', () => {
    const result = buildEnv('/fake/venv', '/fake/data', '/fake/uv')
    expect(result).toHaveProperty('PATH')
    expect(result).toHaveProperty('VIRTUAL_ENV')
    expect(result).toHaveProperty('MOMAI_DATA_DIR')
    expect(result).toHaveProperty('MOMAI_UV_BIN')
  })

  it('VIRTUAL_ENV matches the venvPath argument', () => {
    const result = buildEnv('/test/venv', '/test/data', '/test/uv')
    expect(result.VIRTUAL_ENV).toBe('/test/venv')
  })

  it('MOMAI_DATA_DIR matches the dataDir argument', () => {
    const result = buildEnv('/test/venv', '/test/data', '/test/uv')
    expect(result.MOMAI_DATA_DIR).toBe('/test/data')
  })

  it('MOMAI_UV_BIN matches the uvExe argument', () => {
    const result = buildEnv('/test/venv', '/test/data', '/test/uv')
    expect(result.MOMAI_UV_BIN).toBe('/test/uv')
  })

  it('forwards MOMAI_SESSION_TOKEN from process.env so Python backend inherits it', () => {
    const original = process.env.MOMAI_SESSION_TOKEN
    try {
      process.env.MOMAI_SESSION_TOKEN = 'test-token-abc123'
      const result = buildEnv('/fake/venv', '/fake/data', '/fake/uv')
      expect(result.MOMAI_SESSION_TOKEN).toBe('test-token-abc123')
    } finally {
      if (original === undefined) {
        delete process.env.MOMAI_SESSION_TOKEN
      } else {
        process.env.MOMAI_SESSION_TOKEN = original
      }
    }
  })
})

describe('checkWritePermission', () => {
  it('returns a boolean', () => {
    const result = checkWritePermission('/tmp')
    expect(typeof result).toBe('boolean')
  })
})
