/**
 * MomAI Extension Host Worker
 *
 * Runs in a separate process to provide isolation for extensions.
 */

const path = require('node:path')
const [skillId, skillPath] = process.argv.slice(2)

// Mock/Proxy for MomAI API
const momai = {
  log: (msg) => process.send({ type: 'log', message: msg })
  // Future: Add more APIs here (network, storage, etc.)
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
    } catch (err) {
      process.send({
        type: 'response',
        requestId: msg.requestId,
        result: { ok: false, error: err.message }
      })
    }
  }
})
