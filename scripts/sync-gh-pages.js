const { execSync } = require('child_process')
const { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } = require('fs')
const { join, resolve } = require('path')

const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'apps', 'landing-page', 'dist')

const PRESERVE = new Set([
  'node_modules', '.git', '.turbo', '.venv',
  'v1', 'saude', 'apps', 'data', 'docs', 'posts', 'politicas',
  'scratch', 'scripts',
  '.nojekyll', 'CNAME',
])

function isPreserved(name) {
  if (PRESERVE.has(name)) return true
  return name.startsWith('.') && name !== '.nojekyll'
}

function removeOldAssets(rootDir) {
  const oldDirs = ['assets', 'images']
  for (const dir of oldDirs) {
    const fullPath = join(rootDir, dir)
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      rmSync(fullPath, { recursive: true, force: true })
    }
  }
}

function copyDistToRoot(srcDir, destDir) {
  if (!existsSync(srcDir)) {
    console.error('ERROR: dist not found at ' + srcDir + '. Run the landing-page build first.')
    process.exit(1)
  }

  removeOldAssets(destDir)

  const items = readdirSync(srcDir)
  for (const item of items) {
    const srcPath = join(srcDir, item)
    const destPath = join(destDir, item)

    if (statSync(srcPath).isDirectory()) {
      if (item === 'saude') {
        console.log('  SKIP   ' + item + '/ (preserved)')
        continue
      }
      cpSync(srcPath, destPath, { recursive: true, force: true })
      console.log('  COPY   ' + item + '/')
    } else {
      copyFileSync(srcPath, destPath)
      console.log('  COPY   ' + item)
    }
  }
}

function main() {
  const PREVIOUS_DIR = process.cwd()

  process.chdir(join(ROOT, 'apps', 'landing-page'))

  console.log('Building landing-page...')
  execSync('pnpm build', { stdio: 'inherit' })

  process.chdir(PREVIOUS_DIR)

  console.log('\nSyncing dist to root...\n')
  copyDistToRoot(DIST, ROOT)

  console.log('\nSync complete! Landing page deployed to root.')
  console.log('(v1/, saude/, CNAME, and other files preserved)')
}

main()
