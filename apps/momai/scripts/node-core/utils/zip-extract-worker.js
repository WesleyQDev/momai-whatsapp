const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')

const DEFAULT_TIMEOUT_MS = 30000

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

function validateArchive(zipPath, destDir) {
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
        if (
          destPath !== resolvedRoot &&
          !destPath.startsWith(resolvedRoot + path.sep)
        ) {
          return fail(new Error(`Zip Slip detected: ${entry.fileName}`))
        }
        zipfile.readEntry()
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

function extractWithPowerShell(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const ps = process.platform === 'win32' ? 'powershell.exe' : 'powershell'
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`
    ]
    execFile(ps, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr && stderr.toString()) || err.message
        return reject(new Error(`Expand-Archive failed: ${msg.trim()}`))
      }
      resolve()
    })
  })
}

function extractWithSystemUnzip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    execFile(
      'unzip',
      ['-o', zipPath, '-d', destDir],
      { windowsHide: true },
      (err) => (err ? reject(err) : resolve())
    )
  })
}

async function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  await validateArchive(zipPath, destDir)
  if (process.platform === 'win32') {
    return extractWithPowerShell(zipPath, destDir)
  }
  return extractWithSystemUnzip(zipPath, destDir)
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
