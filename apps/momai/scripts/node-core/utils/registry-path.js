const path = require('node:path')

/** apps/momai/registry.json — copied from monorepo root at build time */
function getRegistryPath() {
  return path.resolve(__dirname, '..', '..', '..', 'registry.json')
}

module.exports = { getRegistryPath }
