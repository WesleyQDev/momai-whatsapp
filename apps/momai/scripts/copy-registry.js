const fs = require('node:fs')
const path = require('node:path')

const source = path.resolve(__dirname, '..', '..', '..', 'registry.json')
const target = path.resolve(__dirname, '..', 'registry.json')

try {
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target)
    console.log(`[MomAI] Copied registry.json from monorepo root to: ${target}`)
  } else {
    console.warn(`[MomAI] Source registry.json not found at: ${source}`)
  }
} catch (err) {
  console.error('[MomAI] Failed to copy registry.json:', err.message)
}
