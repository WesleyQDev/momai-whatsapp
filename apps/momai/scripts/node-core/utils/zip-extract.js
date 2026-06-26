const fs = require('node:fs')
const path = require('node:path')
const yauzl = require('yauzl')

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

/**
 * Extracts a ZIP archive into a destination directory using yauzl (pure JS,
 * no shell). Rejects paths that try to escape destDir (Zip Slip defense).
 *
 * @param {string} zipPath absolute path to the .zip file
 * @param {string} destDir absolute path to the destination directory (created if missing)
 * @param {object} [options]
 * @param {number} [options.timeoutMs=30000] per-extraction timeout in milliseconds
 * @returns {Promise<void>}
 */
function extractZip(zipPath, destDir, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    if (typeof zipPath !== 'string' || !zipPath) {
      return reject(new Error('extractZip: zipPath must be a non-empty string'))
    }
    if (typeof destDir !== 'string' || !destDir) {
      return reject(new Error('extractZip: destDir must be a non-empty string'))
    }

    const resolvedRoot = path.resolve(destDir)
    fs.mkdirSync(resolvedRoot, { recursive: true })

    const timer = setTimeout(() => {
      reject(new Error(`extractZip timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) {
        clearTimeout(timer)
        return reject(err)
      }

      let aborted = false
      const abort = (e) => {
        if (aborted) return
        aborted = true
        clearTimeout(timer)
        try {
          zipfile.close()
        } catch {}
        reject(e)
      }

      zipfile.on('error', abort)
      zipfile.on('end', () => {
        if (aborted) return
        clearTimeout(timer)
        resolve()
      })

      zipfile.on('entry', (entry) => {
        if (aborted) return
        if (isUnsafeEntryPath(entry.fileName)) {
          return abort(new Error(`Refusing unsafe zip entry: ${entry.fileName}`))
        }
        const destPath = path.resolve(resolvedRoot, entry.fileName)
        if (destPath !== resolvedRoot && !destPath.startsWith(resolvedRoot + path.sep)) {
          return abort(new Error(`Zip Slip detected: ${entry.fileName}`))
        }
        if (entry.fileName.endsWith('/')) {
          try {
            fs.mkdirSync(destPath, { recursive: true })
          } catch (e) {
            return abort(e)
          }
          return zipfile.readEntry()
        }
        try {
          fs.mkdirSync(path.dirname(destPath), { recursive: true })
        } catch (e) {
          return abort(e)
        }
        zipfile.openReadStream(entry, (rsErr, readStream) => {
          if (rsErr) return abort(rsErr)
          const writeStream = fs.createWriteStream(destPath)
          readStream.on('error', abort)
          writeStream.on('error', abort)
          writeStream.on('close', () => {
            if (aborted) return
            zipfile.readEntry()
          })
          readStream.pipe(writeStream)
        })
      })

      zipfile.readEntry()
    })
  })
}

module.exports = { extractZip, isUnsafeEntryPath, DEFAULT_TIMEOUT_MS }
