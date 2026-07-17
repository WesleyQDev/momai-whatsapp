const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_TIMEOUT_MS = 120000

function isUnsafeEntryPath(entryName) {
  if (typeof entryName !== 'string' || entryName.length === 0) return true
  if (path.isAbsolute(entryName)) return true
  if (/^[A-Za-z]:[\\/]/.test(entryName)) return true
  if (entryName.includes('\0')) return true
  const parts = entryName.split(/[\\/]+/)
  for (const part of parts) {
    if (part === '..') return true
  }
  return false
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const yauzl = require('yauzl')
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) return reject(err)
      let bad = null
      const fail = (e) => {
        if (bad) return
        bad = e
        try {
          zipfile.close()
        } catch {}
        reject(e)
      }
      const resolvedRoot = path.resolve(destDir)
      zipfile.on('error', fail)
      zipfile.on('entry', (entry) => {
        if (isUnsafeEntryPath(entry.fileName)) {
          return fail(new Error(`Refusing unsafe zip entry: ${entry.fileName}`))
        }
        const destPath = path.resolve(resolvedRoot, entry.fileName)
        if (destPath !== resolvedRoot && !destPath.startsWith(resolvedRoot + path.sep)) {
          return fail(new Error(`Zip Slip detected: ${entry.fileName}`))
        }

        if (/\/$/.test(entry.fileName)) {
          // Directory entry
          fs.mkdir(destPath, { recursive: true }, (err) => {
            if (err) return fail(err)
            zipfile.readEntry()
          })
        } else {
          // File entry
          const parentDir = path.dirname(destPath)
          fs.mkdir(parentDir, { recursive: true }, (err) => {
            if (err) return fail(err)
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) return fail(err)
              const writeStream = fs.createWriteStream(destPath)
              writeStream.on('error', (err) => {
                fail(err)
              })
              writeStream.on('finish', () => {
                zipfile.readEntry()
              })
              readStream.pipe(writeStream)
            })
          })
        }
      })
      zipfile.on('end', () => {
        if (bad) return
        try {
          zipfile.close()
        } catch {}
        resolve()
      })
      zipfile.readEntry()
    })
  })
}

function send(result) {
  if (process.send) {
    process.send(result)
  } else {
    process.stdout.write(JSON.stringify(result) + '\n')
  }
}

if (require.main === module) {
  const input = process.argv[2]
  if (!input) {
    send({ ok: false, error: 'missing input file' })
    process.exit(1)
  }
  let job
  try {
    job = JSON.parse(fs.readFileSync(input, 'utf8'))
  } catch (e) {
    send({ ok: false, error: `bad input: ${e.message}` })
    process.exit(1)
  }
  extractZip(job.zipPath, job.destDir)
    .then(() => {
      send({ ok: true })
      process.exit(0)
    })
    .catch((err) => {
      send({ ok: false, error: err.message })
      process.exit(1)
    })
}

module.exports = { extractZip, isUnsafeEntryPath, DEFAULT_TIMEOUT_MS }
