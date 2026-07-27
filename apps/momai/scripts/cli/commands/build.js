const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

exports.command = 'build'
exports.describe = 'Build the extension using esbuild'
exports.builder = {
  'production': {
    type: 'boolean',
    default: false,
    describe: 'Minify output for production'
  }
}

exports.handler = function (argv) {
  const projectDir = process.cwd()
  const buildScript = path.join(projectDir, 'build.mjs')

  if (!fs.existsSync(buildScript)) {
    console.error('Error: build.mjs not found in current directory')
    process.exit(1)
  }

  console.log('[momai-sdk] Building extension...')
  const args = argv.production ? ['--production'] : []

  try {
    execSync(`node build.mjs ${args.join(' ')}`, {
      cwd: projectDir,
      stdio: 'inherit'
    })
    console.log('[momai-sdk] Build complete')
  } catch (err) {
    console.error('[momai-sdk] Build failed:', err.message)
    process.exit(1)
  }
}
