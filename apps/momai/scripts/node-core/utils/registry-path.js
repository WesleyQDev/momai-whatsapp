const path = require('node:path')

/** apps/momai/dev-extensions.json — copied from monorepo root at build time */
function getRegistryPath() {
  return path.resolve(__dirname, '..', '..', '..', 'dev-extensions.json')
}

module.exports = { getRegistryPath }
