const fs = require('node:fs')
const path = require('node:path')

const source = path.resolve(__dirname, '..', '..', '..', 'dev-extensions.json')
const target = path.resolve(__dirname, '..', 'dev-extensions.json')

try {
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target)
    console.log(`[MomAI] Copied dev-extensions.json from monorepo root to: ${target}`)
  } else {
    console.warn(`[MomAI] Source dev-extensions.json not found at: ${source}`)
  }
} catch (err) {
  console.error('[MomAI] Failed to copy dev-extensions.json:', err.message)
}
