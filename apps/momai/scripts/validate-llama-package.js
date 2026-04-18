const fs = require('node:fs')
const path = require('node:path')

const resourcesRootArg = process.argv[2]
const defaultResourcesRoot = path.join(process.cwd(), 'dist', 'win-unpacked', 'resources')
const resourcesRoot = resourcesRootArg
  ? path.resolve(process.cwd(), resourcesRootArg)
  : defaultResourcesRoot

const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
const required = [
  path.join(resourcesRoot, 'bin', 'llama', 'vulkan', exeName),
  path.join(resourcesRoot, 'bin', 'llama', 'cpu', exeName)
]

const missing = required.filter((p) => !fs.existsSync(p))
if (missing.length > 0) {
  console.error('[validate-llama-package] Missing required llama binaries:')
  for (const file of missing) console.error(` - ${file}`)
  process.exit(1)
}

console.log('[validate-llama-package] OK: CPU + Vulkan llama-server binaries found.')
