const fs = require('node:fs')
const { getRegistryPath } = require('./registry-path')
const communityRegistry = require('../services/community-registry')

let _cachedRegistry = null

/** Local dev-extensions.json is used only in dev (pnpm dev). Packaged builds use community-extensions.json. */
function usesLocalInstallRegistry() {
  return process.env.MOMAI_IS_PACKAGED !== '1'
}

function _normalizeCommunityCatalog(community) {
  const items = Array.isArray(community) ? community : []
  return {
    extensions: items.map((item) => ({
      ...item,
      is_official: item.is_official ?? item.author === 'WesleyQDev'
    }))
  }
}

async function loadInstallRegistry() {
  if (_cachedRegistry) return _cachedRegistry

  const community = await communityRegistry.fetchRegistry()
  const registry = _normalizeCommunityCatalog(community)

  if (usesLocalInstallRegistry()) {
    const registryPath = getRegistryPath()
    if (fs.existsSync(registryPath)) {
      try {
        const localData = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
        const localExts = localData.extensions || []
        for (const localExt of localExts) {
          const idx = registry.extensions.findIndex((e) => e.id === localExt.id)
          if (idx !== -1) {
            registry.extensions[idx] = {
              ...registry.extensions[idx],
              ...localExt
            }
          } else {
            registry.extensions.push(localExt)
          }
        }
      } catch (err) {
        console.error('[InstallRegistry] Error merging local dev-extensions.json:', err.message)
      }
    }
  }

  _cachedRegistry = registry
  return _cachedRegistry
}

function _setInstallRegistryForTests(registry) {
  _cachedRegistry = registry
}

function _clearInstallRegistryCache() {
  _cachedRegistry = null
}

module.exports = {
  usesLocalInstallRegistry,
  loadInstallRegistry,
  _setInstallRegistryForTests,
  _clearInstallRegistryCache
}
