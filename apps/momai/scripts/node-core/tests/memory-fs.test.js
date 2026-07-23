const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createMemoryFS, ALLOWED_FILENAMES } = require('../infrastructure/memory-fs')

describe('memory-fs', () => {
  let memfs
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-fs-test-'))
    fs.mkdirSync(path.join(tmpDir, 'memories'))
    memfs = createMemoryFS({ memoriesDir: path.join(tmpDir, 'memories') })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('ALLOWED_FILENAMES', () => {
    it('allows usuario, persona, conhecimento', () => {
      expect(ALLOWED_FILENAMES).toEqual(['usuario', 'persona', 'conhecimento'])
    })
  })

  describe('readMemoryFile', () => {
    it('returns default content for usuario when file missing', () => {
      const result = memfs.readMemoryFile('usuario')
      expect(result.name).toBe('usuario')
      expect(result.content.length).toBeGreaterThan(0)
      expect(result.entries.length).toBeGreaterThan(0)
    })

    it('returns content for existing file', () => {
      const testPath = path.join(tmpDir, 'memories', 'usuario.md')
      fs.writeFileSync(testPath, 'foo\n§\nbar', 'utf8')
      const result = memfs.readMemoryFile('usuario')
      expect(result.name).toBe('usuario')
      expect(result.content).toBe('foo\n§\nbar')
      expect(result.entries).toEqual(['foo', 'bar'])
    })

    it('returns default content for persona when file missing', () => {
      const result = memfs.readMemoryFile('persona')
      expect(result.name).toBe('persona')
      expect(result.content.length).toBeGreaterThan(0)
      expect(result.entries.length).toBeGreaterThan(0)
    })

    it('rejects invalid filename', () => {
      expect(() => memfs.readMemoryFile('../../etc/passwd')).toThrow('Invalid filename')
    })
  })

  describe('writeMemoryFile', () => {
    it('writes content atomically and returns parsed entries', () => {
      const result = memfs.writeMemoryFile('persona', 'linha 1\n§\nlinha 2')
      expect(result.entries).toEqual(['linha 1', 'linha 2'])
      const fileContent = fs.readFileSync(path.join(tmpDir, 'memories', 'persona.md'), 'utf8')
      expect(fileContent).toBe('linha 1\n§\nlinha 2')
    })

    it('rejects content over 2200 chars', () => {
      const long = 'a'.repeat(2201)
      expect(() => memfs.writeMemoryFile('usuario', long)).toThrow('exceeds 2200')
    })

    it('rejects invalid filename', () => {
      expect(() => memfs.writeMemoryFile('hack', 'content')).toThrow('Invalid filename')
    })
  })

  describe('addMemoryEntry', () => {
    it('inserts new fact into the template replacing empty bullet', () => {
      memfs.addMemoryEntry('usuario', 'novo fato')
      const result = memfs.readMemoryFile('usuario')
      expect(result.content).toContain('- novo fato')
      expect(result.content).not.toContain('## Preferences\n- \n')
    })

    it('rejects entry over 1375 chars', () => {
      const long = 'b'.repeat(1376)
      expect(() => memfs.addMemoryEntry('usuario', long)).toThrow('exceeds 1375')
    })

    it('rejects target persona (read-only for IA)', () => {
      expect(() => memfs.addMemoryEntry('persona', 'edit')).toThrow('read-only')
    })
  })

  describe('deleteMemoryEntry', () => {
    it('removes matching entry by substring', () => {
      memfs.addMemoryEntry('conhecimento', 'gosta de pizza')
      memfs.addMemoryEntry('conhecimento', 'gosta de sorvete')
      memfs.deleteMemoryEntry('conhecimento', 'pizza')
      const result = memfs.readMemoryFile('conhecimento')
      expect(result.entries).toContain('gosta de sorvete')
      expect(result.entries).not.toContain('gosta de pizza')
    })
  })
})
