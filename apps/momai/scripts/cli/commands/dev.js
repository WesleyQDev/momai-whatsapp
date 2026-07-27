const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { execSync, spawn } = require('node:child_process')

function getExtensionsDevDir() {
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

function resolveCorePort() {
  if (process.env.MOMAI_CORE_PORT) {
    return parseInt(process.env.MOMAI_CORE_PORT, 10)
  }
  // Try common variant ports
  const candidates = [8050, 8100, 8200, 8300]
  for (const port of candidates) {
    try {
      const res = http.getSync(`http://127.0.0.1:${port}/health`, { timeout: 1000 })
      if (res.statusCode === 200) return port
    } catch {}
  }
  return 8050 // default to dev variant
}

function notifyMomaiReload(port, extId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ extId })
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/extensions/dev-reload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 2000
    }, (res) => {
      resolve(res.statusCode === 200)
      res.resume()
    })
    req.on('error', () => resolve(false))
    req.write(body)
    req.end()
  })
}

function copyExtensionFiles(projectDir, extId, showLogs) {
  const extDir = path.join(getExtensionsDevDir(), extId)
  const distDir = path.join(projectDir, 'dist')
  const manifestPath = path.join(projectDir, 'manifest.json')
  const stylesPath = path.join(projectDir, 'styles.css')
  const mainJsPath = path.join(distDir, 'main.js')

  if (!fs.existsSync(mainJsPath)) {
    if (showLogs) console.log(`[momai-sdk] Waiting for build... (${path.basename(mainJsPath)} not found)`)
    return false
  }
  if (!fs.existsSync(manifestPath)) {
    console.error(`[momai-sdk] Error: manifest.json not found in ${projectDir}`)
    return false
  }

  fs.mkdirSync(extDir, { recursive: true })

  // Copy manifest.json
  fs.copyFileSync(manifestPath, path.join(extDir, 'manifest.json'))

  // Copy dist/main.js
  fs.mkdirSync(path.join(extDir, 'dist'), { recursive: true })
  fs.copyFileSync(mainJsPath, path.join(extDir, 'dist', 'main.js'))

  // Copy styles.css if exists
  if (fs.existsSync(stylesPath)) {
    fs.copyFileSync(stylesPath, path.join(extDir, 'styles.css'))
  }

  if (showLogs) console.log(`[momai-sdk] Copied extension files to ${extDir}`)
  return true
}

exports.command = 'dev'
exports.describe = 'Watch mode — build extension and copy to extensions-dev/ on changes'
exports.builder = {
  'logs': {
    type: 'boolean',
    default: false,
    describe: 'Show extension console.log output in terminal'
  }
}

exports.handler = async function (argv) {
  const showLogs = argv.logs || false
  const projectDir = process.cwd()
  const manifestPath = path.join(projectDir, 'manifest.json')

  if (!fs.existsSync(manifestPath)) {
    console.error('Error: manifest.json not found in current directory')
    console.error('Run this command from the root of your extension project')
    process.exit(1)
  }

  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    console.error('Error: invalid manifest.json:', err.message)
    process.exit(1)
  }

  const extId = manifest.id || path.basename(projectDir)
  const port = resolveCorePort()
  const extDir = path.join(getExtensionsDevDir(), extId)

  console.log(`[momai-sdk] Watching ${projectDir}`)
  console.log(`[momai-sdk] Extension ID: ${extId}`)
  console.log(`[momai-sdk] Output: ${extDir}`)
  console.log(`[momai-sdk] MomAI port: ${port}`)
  if (showLogs) console.log('[momai-sdk] Extension logs will be shown in terminal')

  // Initial build
  console.log('[momai-sdk] Running initial build...')
  try {
    execSync('node build.mjs', { cwd: projectDir, stdio: showLogs ? 'inherit' : 'pipe' })
  } catch (err) {
    console.error('[momai-sdk] Initial build failed:', err.message)
    process.exit(1)
  }

  // Initial copy
  copyExtensionFiles(projectDir, extId, showLogs)
  await notifyMomaiReload(port, extId)

  // Watch for changes with chokidar
  let buildTimeout = null
  const debouncedBuild = () => {
    if (buildTimeout) clearTimeout(buildTimeout)
    buildTimeout = setTimeout(async () => {
      console.log('[momai-sdk] Change detected, rebuilding...')
      try {
        execSync('node build.mjs', { cwd: projectDir, stdio: showLogs ? 'inherit' : 'pipe' })
        if (copyExtensionFiles(projectDir, extId, showLogs)) {
          await notifyMomaiReload(port, extId)
        }
      } catch (err) {
        console.error('[momai-sdk] Build error:', err.message)
      }
    }, 300)
  }

  const chokidar = require('chokidar')
  const watcher = chokidar.watch([
    path.join(projectDir, 'src'),
    path.join(projectDir, 'manifest.json'),
    path.join(projectDir, 'styles.css')
  ], {
    ignored: /node_modules/,
    persistent: true,
    ignoreInitial: true
  })

  watcher.on('change', debouncedBuild)
  watcher.on('add', debouncedBuild)
  watcher.on('unlink', debouncedBuild)

  process.on('SIGINT', () => {
    console.log('\n[momai-sdk] Stopping...')
    watcher.close()
    process.exit(0)
  })

  console.log('[momai-sdk] Watching for changes... (Ctrl+C to stop)')
}
