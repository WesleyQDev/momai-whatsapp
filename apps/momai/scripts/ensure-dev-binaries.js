const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const binDir = path.join(rootDir, 'bin')
const llamaDir = path.join(binDir, 'llama')
const cpuDir = path.join(llamaDir, 'cpu')
const vulkanDir = path.join(llamaDir, 'vulkan')

const isWin = process.platform === 'win32'
const isLinux = process.platform === 'linux'

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

function removeRecursive(dir) {
  if (!exists(dir)) return
  try {
    fs.rmSync(dir, { recursive: true, force: true })
    console.log(`[MomAI] Removed stale: ${path.relative(rootDir, dir)}`)
  } catch (e) {
    console.log(`[MomAI] Could not remove ${dir}: ${e.message}`)
  }
}

/* On Windows, clean up Linux-only files left by Docker builds */
if (isWin) {
  ;['cpu', 'vulkan'].forEach((sub) => {
    const d = path.join(llamaDir, sub)
    if (!exists(d)) return
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.name.endsWith('.exe') || entry.name.endsWith('.dll')) continue
        const fp = path.join(d, entry.name)
        if (entry.isFile()) {
          try {
            fs.unlinkSync(fp)
            console.log(`[MomAI] Removed Linux file: ${path.relative(rootDir, fp)}`)
          } catch {}
        }
      }
    } catch {}
  })
  removeRecursive(path.join(binDir, 'python', 'linux'))
}

const cpuName = isWin ? 'llama-server.exe' : 'llama-server'
const vulkanName = isWin ? 'llama-server.exe' : 'llama-server'

const cpuExe = path.join(cpuDir, cpuName)
const vulkanExe = path.join(vulkanDir, vulkanName)

const hasExpected = exists(cpuExe) && exists(vulkanExe)
if (hasExpected) {
  const label = isWin ? 'Windows' : isLinux ? 'Linux' : 'macOS'
  console.log(`[MomAI] Dev binary check: OK (${label} llama CPU+Vulkan present).`)
  process.exit(0)
}

runHydrate()
