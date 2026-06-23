import { describe, it, expect } from 'vitest'
import { secureWriteFileSync, secureWriteFile } from './fs-permissions'
import { readFileSync, statSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('secureWriteFileSync', () => {
  it('writes file and sets 0600 on Unix', () => {
    if (process.platform === 'win32') return // skip
    const p = join(tmpdir(), `test-${Date.now()}`)
    secureWriteFileSync(p, 'secret')
    try {
      const mode = statSync(p).mode & 0o777
      expect(mode).toBe(0o600)
    } finally {
      try {
        rmSync(p, { force: true })
      } catch {}
    }
  })

  it('writes the exact bytes provided', () => {
    const p = join(tmpdir(), `test-content-${Date.now()}`)
    secureWriteFileSync(p, 'hello-world')
    try {
      expect(readFileSync(p, 'utf8')).toBe('hello-world')
    } finally {
      try {
        rmSync(p, { force: true })
      } catch {}
    }
  })

  it('does not throw on Windows when chmod fails', () => {
    if (process.platform !== 'win32') return
    const p = join(tmpdir(), `test-win-${Date.now()}`)
    expect(() => secureWriteFileSync(p, 'data')).not.toThrow()
    expect(existsSync(p)).toBe(true)
    try {
      rmSync(p, { force: true })
    } catch {}
  })
})

describe('secureWriteFile (async)', () => {
  it('writes file and sets 0600 on Unix', async () => {
    if (process.platform === 'win32') return
    const p = join(tmpdir(), `test-async-${Date.now()}-${Math.random()}`)
    await secureWriteFile(p, Buffer.from('async-secret'))
    try {
      const mode = statSync(p).mode & 0o777
      expect(mode).toBe(0o600)
      expect(readFileSync(p, 'utf8')).toBe('async-secret')
    } finally {
      try {
        rmSync(p, { force: true })
      } catch {}
    }
  })

  it('does not throw on Windows when chmod fails', async () => {
    if (process.platform !== 'win32') return
    const p = join(tmpdir(), `test-async-win-${Date.now()}-${Math.random()}`)
    await expect(secureWriteFile(p, 'data')).resolves.not.toThrow()
    expect(existsSync(p)).toBe(true)
    try {
      rmSync(p, { force: true })
    } catch {}
  })
})
