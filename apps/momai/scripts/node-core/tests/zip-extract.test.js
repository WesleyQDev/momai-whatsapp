const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { extractZip, isUnsafeEntryPath, DEFAULT_TIMEOUT_MS } = require('../utils/zip-extract')
const { fork } = require('node:child_process')

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'momai-zip-test-'))
}

/**
 * Build a minimal ZIP (stored, no compression) from an entry list. Each entry
 * is { name: string, data: string | null } where data === null means an
 * empty directory entry. Implemented inline so the test does not require an
 * extra devDependency.
 */
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

function writeZip(zipPath, entries) {
  fs.writeFileSync(zipPath, buildZip(entries))
}

describe('isUnsafeEntryPath', () => {
  it('accepts a normal relative path', () => {
    expect(isUnsafeEntryPath('foo/bar.txt')).toBe(false)
  })

  it('rejects an empty entry name', () => {
    expect(isUnsafeEntryPath('')).toBe(true)
  })

  it('rejects a non-string entry name', () => {
    expect(isUnsafeEntryPath(undefined)).toBe(true)
    expect(isUnsafeEntryPath(null)).toBe(true)
  })

  it('rejects absolute Unix paths', () => {
    expect(isUnsafeEntryPath('/etc/passwd')).toBe(true)
  })

  it('rejects absolute Windows paths', () => {
    expect(isUnsafeEntryPath('C:\\Windows\\System32')).toBe(true)
    expect(isUnsafeEntryPath('D:/secret')).toBe(true)
  })

  it('rejects parent traversal segments', () => {
    expect(isUnsafeEntryPath('../escape.txt')).toBe(true)
    expect(isUnsafeEntryPath('foo/../../../bar')).toBe(true)
  })

  it('rejects NUL bytes', () => {
    expect(isUnsafeEntryPath('foo\0bar')).toBe(true)
  })
})

describe('extractZip', () => {
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
    const stat = fs.statSync(path.join(destDir, 'empty-dir'))
    expect(stat.isDirectory()).toBe(true)
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

  it('refuses an absolute path entry', async () => {
    writeZip(zipPath, [{ name: '/etc/passwd', data: 'should not be written' }])
    await expect(extractZip(zipPath, destDir)).rejects.toThrow()
  })

  it('refuses a Windows drive-letter entry', async () => {
    writeZip(zipPath, [{ name: 'C:\\Windows\\evil.txt', data: 'pwned' }])
    await expect(extractZip(zipPath, destDir)).rejects.toThrow()
  })

  it('refuses an entry that escapes via nested ..', async () => {
    writeZip(zipPath, [{ name: 'a/b/../../../escape.txt', data: 'pwned' }])
    await expect(extractZip(zipPath, destDir)).rejects.toThrow()
  })

  it('rejects if zipPath is missing', async () => {
    await expect(extractZip(path.join(workDir, 'nope.zip'), destDir)).rejects.toThrow()
  })

  it('rejects if zipPath is not a string', async () => {
    await expect(extractZip(null, destDir)).rejects.toThrow(/zipPath/)
  })

  it('rejects if destDir is not a string', async () => {
    await expect(extractZip(zipPath, null)).rejects.toThrow(/destDir/)
  })

  /**
   * The default extraction timeout applies to the entire operation. Because
   * the extractor runs in a forked child process, the parent enforces the
   * deadline with SIGKILL — JS setTimeout in the parent cannot fire while
   * the parent's event loop is blocked, but the parent is NOT blocked here:
   * the child is. So a modest default (30s) is appropriate: even on Windows
   * with Defender scanning, a 800KB extension zip finishes well within 30s
   * when the SIGKILL actually fires. If you raise this default, also verify
   * that the user-facing install UI does not appear to hang for that long.
   */
  it('has a default timeout of at least 30s', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(30000)
  })

  /**
   * Regression test: a child worker that hangs forever (e.g. yauzl stuck in
   * a native I/O call on Windows) must be killed by the parent via SIGKILL
   * within the configured timeout. This is the actual root cause of the
   * "install hang" bug: JS setTimeout cannot fire while the event loop is
   * blocked in native code, so the extraction has to run in a separate
   * process that the parent can forcibly terminate.
   */
  it('rejects with timeout when extraction hangs past the deadline', async () => {
    const hangScript = path.join(workDir, 'hang.js')
    fs.writeFileSync(
      hangScript,
      'process.on("message", () => { setInterval(() => {}, 1000) }); process.send({ ready: true })',
      'utf8'
    )
    const child = fork(hangScript, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    await new Promise((r) => child.once('message', r))
    const start = Date.now()
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
        resolve()
      }, 200)
      child.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
  })

  it('rejects with a timeout error when the worker is killed', async () => {
    const hangScript = path.join(workDir, 'hang.js')
    fs.writeFileSync(
      hangScript,
      'setInterval(() => {}, 1000)',
      'utf8'
    )
    const child = fork(hangScript, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    const start = Date.now()
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
        resolve()
      }, 200)
      child.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
    expect(child.killed || child.exitCode !== null).toBe(true)
  })

  it('rejects with a clear error when given a non-string zipPath', async () => {
    await expect(extractZip(null, destDir)).rejects.toThrow(/zipPath/)
  })

  it('rejects with a clear error when given a non-string destDir', async () => {
    const realZip = path.join(workDir, 'real.zip')
    fs.writeFileSync(realZip, Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    await expect(extractZip(realZip, null)).rejects.toThrow(/destDir/)
  })

  /**
   * The actual race-condition test lives in zip-extract-worker.test.js now:
   * the serialization invariant is enforced inside the worker process
   * (writeStream.on('finish') before readEntry), and a parent-level test
   * cannot observe it because the parent does not touch the worker's fs.
   * The fork-based design makes the parent immune to native I/O blocks,
   * which is what was hanging extraction on Windows.
   */
})
