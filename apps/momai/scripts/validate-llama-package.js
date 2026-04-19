const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)

let resourcesRootArg = null
let targetPlatform = process.platform

for (const arg of args) {
  if (arg.startsWith('--platform=')) {
    targetPlatform = arg.slice('--platform='.length).trim() || process.platform
  } else if (!resourcesRootArg) {
    resourcesRootArg = arg
  }
}

const isWinTarget = targetPlatform === 'win32'
const defaultResourcesRoot = path.join(
  process.cwd(),
  'dist',
  isWinTarget ? 'win-unpacked' : 'linux-unpacked',
  'resources'
)
const resourcesRoot = resourcesRootArg
  ? path.resolve(process.cwd(), resourcesRootArg)
  : defaultResourcesRoot

const exeName = isWinTarget ? 'llama-server.exe' : 'llama-server'
const required = [
  path.join(resourcesRoot, 'bin', 'llama', 'vulkan', exeName),
  path.join(resourcesRoot, 'bin', 'llama', 'cpu', exeName)
]

const missing = required.filter((p) => !fs.existsSync(p))
if (missing.length > 0) {
  console.error('[validate-llama-package] Missing required llama binaries:')
  for (const file of missing) console.error(` - ${file}`)
  if (!isWinTarget) {
    console.error(
      '[validate-llama-package] Linux build precisa de binários ELF em bin/llama/<backend>/llama-server (sem .exe).'
    )
  }
  process.exit(1)
}

console.log(
  `[validate-llama-package] OK (${targetPlatform}): CPU + Vulkan llama-server binaries found.`
)
