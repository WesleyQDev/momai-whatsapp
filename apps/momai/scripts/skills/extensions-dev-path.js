const path = require('node:path')
const os = require('node:os')

/**
 * Resolve the well-known extensions-dev/ directory path for the current
 * platform. This is the directory where `momai-sdk dev` copies built
 * extension files, and where MomAI scans for dev extensions.
 *
 * Platform paths:
 *   Windows: %APPDATA%/MomAI/extensions-dev/
 *   macOS:   ~/Library/Application Support/MomAI/extensions-dev/
 *   Linux:   ~/.config/MomAI/extensions-dev/
 *
 * NOTE: This is different from extensionsDevDir (data/extensions/.dev)
 * which is an internal symlink layer for monorepo development.
 * extensions-dev/ is for EXTERNAL developers using the CLI.
 *
 * @param {string} [userDataDir] - Optional override (used in tests).
 *        When omitted, resolves using OS conventions.
 * @returns {string} Absolute path to extensions-dev/
 */
function getExtensionsDevPath(userDataDir) {
  if (userDataDir) {
    return path.join(userDataDir, 'extensions-dev')
  }

  const platform = process.platform
  const home = os.homedir()

  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    return path.join(appData, 'MomAI', 'extensions-dev')
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'MomAI', 'extensions-dev')
  }
  // Linux and others
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config')
  return path.join(xdg, 'MomAI', 'extensions-dev')
}

module.exports = { getExtensionsDevPath }
