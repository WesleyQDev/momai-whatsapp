// scripts/skills/packaged/whatsapp/runtime.js
// LLM tools for WhatsApp
// Execution is routed to background-worker.js via sendToPersistent in registry.js

// Tool declarations come from manifest.json (single source of truth) so the
// runtime and the manifest can never drift (item 10).
const manifest = require('./manifest.json')

module.exports = {
  tools: manifest.tools,

  async execute({ content, context, args, toolName }) {
    // This is a fallback — for background skills, registry.js routes to sendToPersistent.
    // The background-worker.js handles tool execution and returns structured responses.
    // If this executes directly (no persistent worker), return a fallback error.
    return {
      tool: toolName || 'unknown',
      instruction: JSON.stringify({ error: 'Worker not connected', toolName, args }),
      directResponse: 'Extensão WhatsApp não está ativa. Verifique a conexão no painel.'
    }
  },

  hooks: {
    async onUninstall({ extId }) {
      const dataDir = process.env.MOMAI_DATA_DIR || process.env.MOMAI_NODE_CORE_DATA_DIR
      if (dataDir) {
        const path = require('node:path')
        const fs = require('node:fs')
        const storageDir = path.join(dataDir, 'extensions', extId)
        if (fs.existsSync(storageDir)) {
          try {
            fs.rmSync(storageDir, { recursive: true, force: true })
            console.log(`[whatsapp] Cleaned up storage directory on uninstall: ${storageDir}`)
          } catch (err) {
            console.error(`[whatsapp] Failed to clean up storage directory: ${err.message}`)
          }
        }
      }
    }
  }
}
