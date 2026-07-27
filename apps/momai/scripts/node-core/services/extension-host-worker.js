/**
 * MomAI Extension Host Worker
 *
 * Runs in a separate process to provide isolation for extensions.
 */

const path = require('node:path')
const fs = require('node:fs/promises')
const [skillId, skillPath] = process.argv.slice(2)

const { createRequireInterceptor } = require('../config/extension-allowlist.js')

const Module = require('node:module')
const originalRequire = Module.prototype.require
Module.prototype.require = createRequireInterceptor(originalRequire)

const dataDir = process.env.MOMAI_DATA_DIR || path.resolve(__dirname, '..', '..', 'data')

const storageBase = path.join(dataDir, 'extensions', skillId)

// Storage API for extensions
const SAFE_KEY = /^[a-zA-Z0-9_-]+$/
const storage = {
  storageDir: storageBase,
  async get(key) {
    if (typeof key !== 'string' || !SAFE_KEY.test(key)) {
      throw new Error('Invalid storage key')
    }
    const filePath = path.join(storageBase, `${key}.json`)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  },

  async set(key, value) {
    if (typeof key !== 'string' || !SAFE_KEY.test(key)) {
      throw new Error('Invalid storage key')
    }
    await fs.mkdir(storageBase, { recursive: true })
    const serialized = JSON.stringify(value, null, 2)
    if (serialized.length > 1024 * 1024) {
      throw new Error('Storage quota exceeded: max 1MB per extension')
    }
    await fs.writeFile(path.join(storageBase, `${key}.json`), serialized, 'utf-8')
  }
}

// MomAI API bridge injected into runtime.execute()
const momai = {
  log: (msg) => process.send({ type: 'log', message: msg }),
  sendEvent: (eventType, data) => process.send({ type: 'event', eventType, data }),
  sendStructuredResponse: (data) => process.send({ type: 'structured_response', data }),
  storage
}

let runtime = null

async function init() {
  try {
    const runtimePath = path.join(skillPath, 'runtime.js')
    // Using dynamic import to support both CJS and ESM (including top-level await)
    // We use pathToFileURL to ensure absolute paths work correctly on all platforms
    const { pathToFileURL } = require('node:url')
    const imported = await import(pathToFileURL(runtimePath).href)

    // Handle both module.exports (CJS) and export default (ESM)
    runtime = imported.default || imported

    // Signal ready
    process.send({ type: 'log', message: `Host initialized (PID: ${process.pid})` })
    process.send({ type: 'ready' })
  } catch (err) {
    process.send({ type: 'log', message: `Failed to load extension: ${err.message}` })
    process.exit(1)
  }
}

init()

// Send heartbeat to parent process every 30 seconds
setInterval(() => {
  if (typeof process.send === 'function') {
    process.send({ type: 'heartbeat', timestamp: Date.now() })
  }
}, 30000)

process.on('message', async (msg) => {
  if (msg.type === 'execute') {
    try {
      const { requestId, payload } = msg

      // Execute the extension logic
      // The payload contains content, context (limited), manifest, etc.
      const result = await runtime.execute({
        ...payload,
        momai // Inject the bridge
      })

      process.send({
        type: 'response',
        requestId,
        result
      })

      // Reset state between commands by reloading the runtime module
      if (msg.reset !== false) {
        const { pathToFileURL } = require('node:url')
        delete require.cache[require.resolve(path.join(skillPath, 'runtime.js'))]
        const imported = await import(pathToFileURL(path.join(skillPath, 'runtime.js')).href)
        runtime = imported.default || imported
      }
    } catch (err) {
      process.send({
        type: 'response',
        requestId: msg.requestId,
        result: { ok: false, error: err.message }
      })
    }
  } else if (msg.type === 'shutdown') {
    process.exit(0)
  }
})
