const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { extractZip, isUnsafeEntryPath } = require('../utils/zip-extract-worker')

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'momai-zip-worker-test-'))
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function buildZip(entries) {
  const localParts = []
  const central = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const isDir = entry.data === null
    const data = entry.data === null ? Buffer.alloc(0) : Buffer.from(entry.data, 'utf8')
    const crc = isDir ? 0 : crc32(data)
    const size = data.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    const relativeOffset = offset
    localParts.push(local, nameBuf, data)
    offset += local.length + nameBuf.length + data.length
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(size, 20)
    cd.writeUInt32LE(size, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(relativeOffset, 42)
    central.push(cd, nameBuf)
  }
  const localSection = Buffer.concat(localParts)
  const cdSection = Buffer.concat(central)
  const cdOffset = localSection.length
  const cdSize = cdSection.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([localSection, cdSection, eocd])
}

function writeZip(zipPath, entries) {
  fs.writeFileSync(zipPath, buildZip(entries))
}

describe('isUnsafeEntryPath (worker)', () => {
  it('accepts a normal relative path', () => {
    expect(isUnsafeEntryPath('foo/bar.txt')).toBe(false)
  })
  it('rejects parent traversal', () => {
    expect(isUnsafeEntryPath('../escape.txt')).toBe(true)
  })
  it('rejects absolute paths', () => {
    expect(isUnsafeEntryPath('/etc/passwd')).toBe(true)
    expect(isUnsafeEntryPath('C:\\Windows\\System32')).toBe(true)
  })
  it('rejects empty / non-string', () => {
    expect(isUnsafeEntryPath('')).toBe(true)
    expect(isUnsafeEntryPath(null)).toBe(true)
  })
})

describe('extractZip (worker)', () => {
  let workDir
  let zipPath
  let destDir

  beforeEach(() => {
    workDir = makeTempDir()
    zipPath = path.join(workDir, 'fixture.zip')
    destDir = path.join(workDir, 'out')
  })

  afterEach(() => {
    try {
      fs.rmSync(workDir, { recursive: true, force: true })
    } catch {}
  })

  it('extracts a simple flat archive', async () => {
    writeZip(zipPath, [
      { name: 'hello.txt', data: 'hi there' },
      { name: 'README.md', data: '# Title' }
    ])
    await extractZip(zipPath, destDir)
    expect(fs.readFileSync(path.join(destDir, 'hello.txt'), 'utf8')).toBe('hi there')
    expect(fs.readFileSync(path.join(destDir, 'README.md'), 'utf8')).toBe('# Title')
  })

  it('extracts nested directories', async () => {
    writeZip(zipPath, [{ name: 'a/b/c.txt', data: 'deep' }])
    await extractZip(zipPath, destDir)
    expect(fs.readFileSync(path.join(destDir, 'a', 'b', 'c.txt'), 'utf8')).toBe('deep')
  })

  it('extracts empty directory entries', async () => {
    writeZip(zipPath, [
      { name: 'empty-dir/', data: null },
      { name: 'empty-dir/file.txt', data: 'inside' }
    ])
    await extractZip(zipPath, destDir)
    expect(fs.statSync(path.join(destDir, 'empty-dir')).isDirectory()).toBe(true)
    expect(fs.readFileSync(path.join(destDir, 'empty-dir', 'file.txt'), 'utf8')).toBe('inside')
  })

  it('creates the destination directory if it does not exist', async () => {
    writeZip(zipPath, [{ name: 'file.txt', data: 'x' }])
    const nested = path.join(destDir, 'created', 'on-demand')
    await extractZip(zipPath, nested)
    expect(fs.readFileSync(path.join(nested, 'file.txt'), 'utf8')).toBe('x')
  })

  it('refuses an entry that traverses outside destDir (Zip Slip)', async () => {
    writeZip(zipPath, [
      { name: 'safe.txt', data: 'fine' },
      { name: '../escape.txt', data: 'pwned' }
    ])
    await expect(extractZip(zipPath, destDir)).rejects.toThrow()
    expect(fs.existsSync(path.join(workDir, 'escape.txt'))).toBe(false)
  })

  it('refuses absolute and drive-letter paths', async () => {
    writeZip(zipPath, [{ name: '/etc/passwd', data: 'x' }])
    await expect(extractZip(zipPath, destDir)).rejects.toThrow()
  })

  it('rejects a missing zip file', async () => {
    await expect(extractZip(path.join(workDir, 'nope.zip'), destDir)).rejects.toThrow()
  })

  /**
   * Regression test for the cf04160c race condition. The worker now uses
   * PowerShell `Expand-Archive` (or `unzip` on non-Windows) to perform the
   * actual extraction — that backend serializes its own writes internally
   * and is not subject to the yauzl native-I/O block we hit on Windows.
   * Validation that every entry lands on disk is the regression guard.
   */
  it('extracts multiple entries end-to-end without truncation', async () => {
    writeZip(zipPath, [
      { name: 'a.txt', data: 'A'.repeat(1024) },
      { name: 'b.txt', data: 'B'.repeat(1024) },
      { name: 'c.txt', data: 'C'.repeat(1024) }
    ])
    await extractZip(zipPath, destDir)
    expect(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8').length).toBe(1024)
    expect(fs.readFileSync(path.join(destDir, 'b.txt'), 'utf8').length).toBe(1024)
    expect(fs.readFileSync(path.join(destDir, 'c.txt'), 'utf8').length).toBe(1024)
    expect(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8')[0]).toBe('A')
    expect(fs.readFileSync(path.join(destDir, 'b.txt'), 'utf8')[0]).toBe('B')
    expect(fs.readFileSync(path.join(destDir, 'c.txt'), 'utf8')[0]).toBe('C')
  })
})
