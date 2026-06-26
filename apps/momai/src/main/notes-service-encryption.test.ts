import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('enc:' + s, 'utf-8')),
    decryptString: vi.fn((b: Buffer) => {
      const s = b.toString('utf-8')
      return s.startsWith('enc:') ? s.slice(4) : ''
    })
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return mockUserData
      return '/mock/default'
    }),
    getVersion: vi.fn(() => '1.0.0'),
    getName: vi.fn(() => 'MomAI'),
    getLocale: vi.fn(() => 'pt-BR'),
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    isPackaged: false,
    getAppPath: vi.fn(() => '/mock/app-path'),
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false }))
  },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
  safeStorage: mockSafeStorage
}))

let mockUserData = ''

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import {
  createNote,
  getNote,
  updateNote,
  listNotes,
  migratePlainNotesToEncrypted,
  loadIndexCache,
  __resetIndexCacheForTesting
} from './notesService'

describe('notes-service encryption', () => {
  let tempDir: string

  beforeEach(() => {
    __resetIndexCacheForTesting()
    mockSafeStorage.isEncryptionAvailable.mockImplementation(() => true)
    mockSafeStorage.encryptString.mockImplementation((s: string) =>
      Buffer.from('enc:' + s, 'utf-8')
    )
    mockSafeStorage.decryptString.mockImplementation((b: Buffer) => {
      const s = b.toString('utf-8')
      return s.startsWith('enc:') ? s.slice(4) : ''
    })
    mockSafeStorage.encryptString.mockClear()
    mockSafeStorage.decryptString.mockClear()
    mockSafeStorage.isEncryptionAvailable.mockClear()
    tempDir = mkdtempSync(join(tmpdir(), 'momai-notes-svc-'))
    mockUserData = tempDir
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createNote writes an encrypted file with .md.enc extension', async () => {
    const note = await createNote('Secret', 'senha = 12345')
    expect(note.content).toBe('senha = 12345')

    const onDisk = readFileSync(join(tempDir, 'data', 'notes', `${note.id}.md.enc`), 'utf8')
    expect(onDisk).not.toContain('senha')
    expect(onDisk).not.toContain('12345')
  })

  it('getNote decrypts the file content back to plaintext', async () => {
    const created = await createNote('Secret', 'top secret content')
    const loaded = await getNote(created.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.content).toBe('top secret content')
  })

  it('updateNote re-encrypts the new content', async () => {
    const created = await createNote('Title', 'original')
    const updated = await updateNote(created.id, { content: 'updated secret' })
    expect(updated!.content).toBe('updated secret')
    const reloaded = await getNote(created.id)
    expect(reloaded!.content).toBe('updated secret')

    const onDisk = readFileSync(join(tempDir, 'data', 'notes', `${created.id}.md.enc`), 'utf8')
    expect(onDisk).not.toContain('updated secret')
  })

  it('listNotes returns notes with their content decrypted', async () => {
    const a = await createNote('A', 'content A')
    const b = await createNote('B', 'content B')
    const list = await listNotes()
    const ids = list.map((n) => n.id)
    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
    expect(list.find((n) => n.id === a.id)?.preview).toBe('content A')
  })

  it('migrates plain .md files to .md.enc', async () => {
    const notesDir = join(tempDir, 'data', 'notes')
    require('fs').mkdirSync(notesDir, { recursive: true })
    writeFileSync(join(notesDir, 'plain-id.md'), 'plain text content', 'utf8')
    writeFileSync(join(notesDir, 'another.md'), 'another content', 'utf8')

    const migrated = await migratePlainNotesToEncrypted()
    expect(migrated.length).toBe(2)
    expect(migrated.some((p) => p.endsWith('plain-id.md.enc'))).toBe(true)
    expect(migrated.some((p) => p.endsWith('another.md.enc'))).toBe(true)

    expect(existsSync(join(notesDir, 'plain-id.md'))).toBe(false)
    expect(existsSync(join(notesDir, 'another.md'))).toBe(false)
    expect(existsSync(join(notesDir, 'plain-id.md.enc'))).toBe(true)
    expect(existsSync(join(notesDir, 'another.md.enc'))).toBe(true)
  })

  it('migrates pending .md files from .pending/ subdirectory', async () => {
    const pendingDir = join(tempDir, 'data', 'notes', '.pending')
    require('fs').mkdirSync(pendingDir, { recursive: true })
    writeFileSync(join(pendingDir, 'pending-id.md'), 'pending content', 'utf8')

    const migrated = await migratePlainNotesToEncrypted()
    expect(migrated.some((p) => p.endsWith('pending-id.md.enc'))).toBe(true)
    expect(migrated.some((p) => p.includes('.pending'))).toBe(false)

    const notesDir = join(tempDir, 'data', 'notes')
    expect(existsSync(join(notesDir, 'pending-id.md.enc'))).toBe(true)
    expect(existsSync(pendingDir)).toBe(false)
  })

  it('migrated notes can be read back via getNote', async () => {
    const notesDir = join(tempDir, 'data', 'notes')
    require('fs').mkdirSync(notesDir, { recursive: true })
    writeFileSync(join(notesDir, 'abc-123.md'), 'migrated secret', 'utf8')

    await migratePlainNotesToEncrypted()
    await loadIndexCache()
    const loaded = await getNote('abc-123')
    expect(loaded).not.toBeNull()
    expect(loaded!.content).toBe('migrated secret')
  })

  it('does not migrate if no plain files exist', async () => {
    const notesDir = join(tempDir, 'data', 'notes')
    require('fs').mkdirSync(notesDir, { recursive: true })

    const migrated = await migratePlainNotesToEncrypted()
    expect(migrated).toEqual([])
  })

  it('index.json path is updated to point to .md.enc after migration', async () => {
    const notesDir = join(tempDir, 'data', 'notes')
    require('fs').mkdirSync(notesDir, { recursive: true })
    writeFileSync(join(notesDir, 'legacy.md'), 'legacy content', 'utf8')

    await migratePlainNotesToEncrypted()
    await loadIndexCache()
    const list = await listNotes()
    const found = list.find((n) => n.id === 'legacy')
    expect(found).toBeDefined()
    expect(found!.path).toMatch(/legacy\.md\.enc$/)
  })

  it('updates pre-existing index.json paths when plain files are migrated', async () => {
    const dataDir = join(tempDir, 'data')
    const notesDir = join(dataDir, 'notes')
    require('fs').mkdirSync(notesDir, { recursive: true })

    const noteId = 'pre-existing-id'
    writeFileSync(join(notesDir, `${noteId}.md`), 'stale-indexed content', 'utf8')
    writeFileSync(
      join(notesDir, '.index.json'),
      JSON.stringify(
        [
          {
            id: noteId,
            title: 'stale title',
            path: `notes/${noteId}.md`,
            source: 'local',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            preview: 'stale-indexed content'
          }
        ],
        null,
        2
      ),
      'utf8'
    )

    await migratePlainNotesToEncrypted()
    await loadIndexCache()
    const list = await listNotes()
    const found = list.find((n) => n.id === noteId)
    expect(found).toBeDefined()
    expect(found!.path).toBe(`notes/${noteId}.md.enc`)

    const loaded = await getNote(noteId)
    expect(loaded).not.toBeNull()
    expect(loaded!.content).toBe('stale-indexed content')
  })

  it('getNote returns null when the underlying file is missing (defense in depth)', async () => {
    const note = await createNote('Ghost', 'phantom content')
    const fs = require('fs')
    fs.unlinkSync(join(tempDir, 'data', 'notes', `${note.id}.md.enc`))

    const loaded = await getNote(note.id)
    expect(loaded).toBeNull()
  })

  it('loadIndexCache heals a stale .md path when only .md.enc exists on disk', async () => {
    const notesDir = join(tempDir, 'data', 'notes')
    require('fs').mkdirSync(notesDir, { recursive: true })

    const created = await createNote('orphan title', 'orphan content')
    const noteId = created.id

    writeFileSync(
      join(notesDir, '.index.json'),
      JSON.stringify(
        [
          {
            id: noteId,
            title: 'orphan title',
            path: `notes/${noteId}.md`,
            source: 'local',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            preview: 'orphan content'
          }
        ],
        null,
        2
      ),
      'utf8'
    )

    __resetIndexCacheForTesting()
    await loadIndexCache()
    const loaded = await getNote(noteId)
    expect(loaded).not.toBeNull()
    expect(loaded!.content).toBe('orphan content')
    expect(loaded!.path).toBe(`notes/${noteId}.md.enc`)
  })
})
