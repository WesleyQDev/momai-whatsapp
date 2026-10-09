import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as migrationModule from '../baileys-cred-migration'

const migration = migrationModule as any
const createMigration = migration.createMigration || migration.default?.createMigration

function mockBridge() {
  return {
    encryptForStorage: async (plain: string) =>
      Buffer.from(`enc:${plain}`, 'utf8').toString('base64'),
    decryptFromStorage: async (b64: string) => {
      const raw = Buffer.from(b64, 'base64').toString('utf8')
      return raw.startsWith('enc:') ? raw.slice(4) : null
    }
  }
}

function makeAuthDir(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-vault-'))
  fs.writeFileSync(path.join(base, 'creds.json'), '{"me":true}')
  fs.writeFileSync(path.join(base, 'session-123.json'), 'signal-keys')
  fs.writeFileSync(path.join(base, 'worker.lock'), '1234')
  fs.writeFileSync(path.join(base, 'creds.json.enc'), 'legacy-backup')
  return base
}

describe('auth vault (item 1)', () => {
  it('encrypts every json auth file and removes the plain copies on request', async () => {
    const base = makeAuthDir()
    const migrate = createMigration(mockBridge())

    expect(await migrate.vaultAuthDir(base, { deletePlain: true })).toBe(true)

    expect(fs.existsSync(path.join(base, 'creds.json'))).toBe(false)
    expect(fs.existsSync(path.join(base, 'session-123.json'))).toBe(false)
    // Runtime lock and the legacy encrypted backup are never touched.
    expect(fs.existsSync(path.join(base, 'worker.lock'))).toBe(true)
    expect(fs.existsSync(path.join(base, 'creds.json.enc'))).toBe(true)
    expect(fs.existsSync(path.join(base, 'auth-vault.enc'))).toBe(true)
  })

  it('restores the plain files from the vault on the next startup', async () => {
    const base = makeAuthDir()
    const migrate = createMigration(mockBridge())
    await migrate.vaultAuthDir(base, { deletePlain: true })

    const restored = await migrate.restoreAuthVault(base)

    expect(restored.restored).toBe(2)
    expect(restored.failed).toBe(false)
    expect(fs.readFileSync(path.join(base, 'creds.json'), 'utf8')).toBe('{"me":true}')
    expect(fs.readFileSync(path.join(base, 'session-123.json'), 'utf8')).toBe('signal-keys')
  })

  it('keeps the plain files when encryption is unavailable', async () => {
    const base = makeAuthDir()
    const migrate = createMigration({
      encryptForStorage: async () => null,
      decryptFromStorage: async () => null
    })

    expect(await migrate.vaultAuthDir(base, { deletePlain: true })).toBe(false)
    expect(fs.existsSync(path.join(base, 'creds.json'))).toBe(true)
    expect(fs.existsSync(path.join(base, 'session-123.json'))).toBe(true)
    expect(fs.existsSync(path.join(base, 'auth-vault.enc'))).toBe(false)
  })

  it('reports failure and keeps the vault when decryption is unavailable', async () => {
    const base = makeAuthDir()
    const good = createMigration(mockBridge())
    await good.vaultAuthDir(base, { deletePlain: true })

    const broken = createMigration({
      encryptForStorage: async () => null,
      decryptFromStorage: async () => null
    })
    const restored = await broken.restoreAuthVault(base)

    expect(restored.failed).toBe(true)
    expect(restored.restored).toBe(0)
    expect(fs.existsSync(path.join(base, 'creds.json'))).toBe(false)
    expect(fs.existsSync(path.join(base, 'auth-vault.enc'))).toBe(true)
  })

  it('does not overwrite a live plain session with the vault', async () => {
    const base = makeAuthDir()
    const migrate = createMigration(mockBridge())
    await migrate.vaultAuthDir(base, { deletePlain: true })
    fs.writeFileSync(path.join(base, 'creds.json'), '{"fresh":true}')

    const restored = await migrate.restoreAuthVault(base)

    expect(restored.restored).toBe(0)
    expect(fs.readFileSync(path.join(base, 'creds.json'), 'utf8')).toBe('{"fresh":true}')
  })
})
