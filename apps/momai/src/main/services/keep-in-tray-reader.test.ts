import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Mock electron's app.getPath so we can control userData
const mockUserData = vi.hoisted(() => ({ value: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => mockUserData.value }
}))

import { FileKeepInTrayReader } from './keep-in-tray-reader'

describe('FileKeepInTrayReader', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'momai-kit-'))
    mockUserData.value = tempDir
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  function writeStore(settings: unknown) {
    const dir = join(tempDir, 'data')
    require('fs').mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'node-core-store.json'), JSON.stringify({ settings }))
  }

  it('returns true when node-core-store.json is missing', () => {
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(true)
  })

  it('returns true when node-core-store.json is corrupted', () => {
    require('fs').mkdirSync(join(tempDir, 'data'), { recursive: true })
    writeFileSync(join(tempDir, 'data', 'node-core-store.json'), 'not json{')
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(true)
  })

  it('returns true when keep_in_tray field is absent', () => {
    writeStore({ user_name: 'Wesley' })
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(true)
  })

  it('returns true when keep_in_tray = true', () => {
    writeStore({ keep_in_tray: true })
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(true)
  })

  it('returns false when keep_in_tray = false', () => {
    writeStore({ keep_in_tray: false })
    const reader = new FileKeepInTrayReader()
    expect(reader.isEnabled()).toBe(false)
  })
})
