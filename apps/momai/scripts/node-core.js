/**
 * MomAI Node Core - Entry Point
 *
 * This file loads the modular composer from ./node-core/index.js
 * and starts the server when run as the main script.
 */

const path = require('node:path')
const fs = require('node:fs')

// Check if modular structure exists
const modularIndex = path.join(__dirname, 'node-core', 'index.js')
const isModular = fs.existsSync(modularIndex)

if (isModular) {
  // Load the modular composer (explicit index.js to avoid self-reference)
  const composer = require('./node-core/index.js')

  // Export everything from the composer
  module.exports = composer

  // If this file is the main entry point, start the server
  if (require.main === module) {
    const { startServer } = composer
    if (typeof startServer === 'function') {
      startServer()
    } else {
      console.error('[NodeCore] startServer not exported from modular composer')
      process.exit(1)
    }
  }
} else {
  console.error('[NodeCore] Modular structure not found at ./node-core/index.js')
  process.exit(1)
}
