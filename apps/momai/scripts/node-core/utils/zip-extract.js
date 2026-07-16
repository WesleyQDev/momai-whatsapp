const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { fork } = require('node:child_process')

const DEFAULT_TIMEOUT_MS = 120000
const WORKER_PATH = path.join(__dirname, 'zip-extract-worker.js')

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
 * Extracts a ZIP archive into a destination directory.
 *
 * Runs the actual extraction in a forked child process so the parent event
 * loop is never blocked by native I/O. If the child hangs (e.g. yauzl +
 * libzip native call stuck on a Windows file lock from Defender), the
 * parent enforces a real timeout by sending SIGKILL to the child. JS
 * `setTimeout` cannot fire while the event loop is blocked in native code,
 * which is why the extraction itself has to be offloaded.
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

    const jobFile = path.join(os.tmpdir(), `momai-zip-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(
      jobFile,
      JSON.stringify({ zipPath, destDir: resolvedRoot }),
      'utf8'
    )

    const child = fork(WORKER_PATH, [jobFile], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    let settled = false
    const settle = (fn, value) => {
      if (settled) return
      settled = true
      try {
        fs.unlinkSync(jobFile)
      } catch {}
      fn(value)
    }

    const killer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
      settle(reject, new Error(`extractZip timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.on('message', (msg) => {
      if (msg && msg.ok === true) {
        clearTimeout(killer)
        settle(resolve, undefined)
        try {
          child.kill()
        } catch {}
      } else if (msg && msg.ok === false) {
        clearTimeout(killer)
        settle(reject, new Error(msg.error || 'extract failed'))
        try {
          child.kill()
        } catch {}
      }
    })

    child.on('exit', (code) => {
      clearTimeout(killer)
      if (!settled) {
        if (code === 0) {
          settle(resolve, undefined)
        } else {
          settle(reject, new Error(`extractZip worker exited with code ${code}`))
        }
      }
    })

    child.on('error', (err) => {
      clearTimeout(killer)
      settle(reject, err)
    })
  })
}

module.exports = { extractZip, isUnsafeEntryPath, DEFAULT_TIMEOUT_MS }
