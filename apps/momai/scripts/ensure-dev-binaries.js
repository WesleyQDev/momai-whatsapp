const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const binDir = path.join(rootDir, 'bin')
const llamaDir = path.join(binDir, 'llama')
const cpuDir = path.join(llamaDir, 'cpu')
const vulkanDir = path.join(llamaDir, 'vulkan')

const isWin = process.platform === 'win32'

function exists(p) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function runHydrate() {
  const cmd = isWin
    ? 'powershell -ExecutionPolicy Bypass -File scripts/hydrate-bin.ps1'
    : 'bash scripts/hydrate-bin.sh'

  console.log('[MomAI] Native binaries missing/incompatible for dev. Running hydration...')
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' })
}

if (!isWin) {
  process.exit(0)
}

const cpuExe = path.join(cpuDir, 'llama-server.exe')
const vulkanExe = path.join(vulkanDir, 'llama-server.exe')

const hasExpected = exists(cpuExe) && exists(vulkanExe)
if (hasExpected) {
  console.log('[MomAI] Dev binary check: OK (Windows llama CPU+Vulkan present).')
  process.exit(0)
}

runHydrate()
