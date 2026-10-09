import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

describe('baileys dependency pin (item 22)', () => {
  it('pins the exact baileys version with the group-send patch applied', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@whiskeysockets/baileys']).toBe('6.17.16')
    expect(pkg.pnpm?.patchedDependencies?.['@whiskeysockets/baileys']).toBe(
      'patches/@whiskeysockets__baileys.patch'
    )
  })

  it('keeps the lockfile specifier and patch hash in sync with the pin', () => {
    const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8')
    expect(lock).toContain('specifier: 6.17.16')
    expect(lock).toContain('patch_hash=')
  })

  it('keeps the per-JID assertSessions patch for group sends', () => {
    const patch = fs.readFileSync(
      path.join(root, 'patches/@whiskeysockets__baileys.patch'),
      'utf8'
    )
    expect(patch).toContain('messages-send.js')
    expect(patch).toContain('assertSessions')
  })
})
