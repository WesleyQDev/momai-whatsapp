const { execSync } = require('child_process')
const path = require('path')

const dir = process.argv[2] || 'dist'
const absolute = path.resolve(dir)

const platform = process.platform
let cmd
if (platform === 'win32') {
  cmd = `explorer "${absolute}"`
} else if (platform === 'darwin') {
  cmd = `open "${absolute}"`
} else {
  cmd = `xdg-open "${absolute}"`
}

try {
  execSync(cmd, { stdio: 'inherit' })
} catch {
  // ignore errors (e.g., explorer already open)
}
