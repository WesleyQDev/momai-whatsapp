// TDD: Verify the minimal pure-Node ZIP writer produces a valid archive that
// can be read back with yauzl (the same library MomAI uses elsewhere).
// Used by the privacy/export endpoint to bundle user data for download.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const yauzl = require('yauzl')

const { createZip, addFileToZip, finalizeZip, createZipFromFiles } = require('../utils/zip-writer')

function readEntries(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)
      const entries = []
      zipfile.on('entry', (entry) => {
        entries.push({ fileName: entry.fileName, uncompressedSize: entry.uncompressedSize })
        zipfile.readEntry()
      })
      zipfile.on('end', () => resolve(entries))
      zipfile.on('error', reject)
      zipfile.readEntry()
    })
  })
}

function readEntryContent(zipPath, fileName) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)
      zipfile.on('entry', (entry) => {
        if (entry.fileName === fileName) {
          zipfile.openReadStream(entry, (err2, stream) => {
            if (err2) return reject(err2)
            const chunks = []
            stream.on('data', (c) => chunks.push(c))
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
            stream.on('error', reject)
          })
        } else {
          zipfile.readEntry()
        }
      })
      zipfile.on('end', () => reject(new Error('not found')))
      zipfile.on('error', reject)
      zipfile.readEntry()
    })
  })
}

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'momai-zip-')), 'out.zip')
}

describe('zip-writer', () => {
  test('createZip + addFile + finalizeZip produces a readable empty-or-non-empty archive', async () => {
    const zipPath = tmpFile()
    const out = createZip(zipPath)
    addFileToZip(out, 'hello.txt', 'world')
    await finalizeZip(out)
    expect(fs.existsSync(zipPath)).toBe(true)
    const entries = await readEntries(zipPath)
    expect(entries.map((e) => e.fileName)).toContain('hello.txt')
    const content = await readEntryContent(zipPath, 'hello.txt')
    expect(content).toBe('world')
  })

  test('createZipFromFiles supports nested directory paths', async () => {
    const zipPath = tmpFile()
    await createZipFromFiles(zipPath, {
      'top.json': JSON.stringify({ a: 1 }),
      'messages/t1.json': JSON.stringify({ id: 't1' }),
      'notes/note-1.md': '# Note 1\nbody',
      'README.md': '# Export'
    })
    const entries = await readEntries(zipPath)
    const names = entries.map((e) => e.fileName).sort()
    expect(names).toEqual(['README.md', 'messages/t1.json', 'notes/note-1.md', 'top.json'])

    expect(JSON.parse(await readEntryContent(zipPath, 'top.json'))).toEqual({ a: 1 })
    expect(JSON.parse(await readEntryContent(zipPath, 'messages/t1.json'))).toEqual({ id: 't1' })
    expect(await readEntryContent(zipPath, 'notes/note-1.md')).toBe('# Note 1\nbody')
  })

  test('handles unicode file names and binary content', async () => {
    const zipPath = tmpFile()
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe])
    await createZipFromFiles(zipPath, {
      'acentos-aééíóú.txt': 'olá mundo',
      'binary.bin': buf
    })
    const content = await readEntryContent(zipPath, 'acentos-aééíóú.txt')
    expect(content).toBe('olá mundo')
    const entries = await readEntries(zipPath)
    const binEntry = entries.find((e) => e.fileName === 'binary.bin')
    expect(binEntry).toBeTruthy()
  })
})
