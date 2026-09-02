import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const version = pkg.version
const zipName = `momai-whatsapp-v${version}.zip`
const zipOldName = `momai-whatsapp-extension-v${version}.zip`

console.log(`[package] Empacotando MomAI WhatsApp v${version}...`)

// 1. Build UI
console.log('[package] Buildando UI...')
execSync('node build.mjs', { cwd: rootDir, stdio: 'inherit' })

// 2. Prune dev dependencies
console.log('[package] Limpando devDependencies (pnpm prune --prod)...')
execSync('pnpm prune --prod', { cwd: rootDir, stdio: 'inherit' })

// 3. Compactar arquivos necessários
console.log('[package] Compactando ZIP final...')
const items = [
  'manifest.json',
  'SKILL.md',
  'package.json',
  'runtime.ts',
  'background-worker.ts',
  'worker-utils.ts',
  'baileys-cred-migration.ts',
  'fs-permissions.ts',
  'secure-storage-bridge.ts',
  'icon.svg',
  'dist',
  'locales',
  'node_modules'
].join(',')

const psCmd = `Compress-Archive -Path ${items} -DestinationPath ${zipName} -Force`
execSync(`powershell -NoProfile -Command "${psCmd}"`, { cwd: rootDir, stdio: 'inherit' })

fs.copyFileSync(path.join(rootDir, zipName), path.join(rootDir, zipOldName))

// 4. Calcular SHA256 e tamanho
const zipBuf = fs.readFileSync(path.join(rootDir, zipName))
const hash = crypto.createHash('sha256').update(zipBuf).digest('hex')
const sizeMB = (zipBuf.length / (1024 * 1024)).toFixed(2)

console.log(`\n✅ Pacote gerado com sucesso!`)
console.log(`📦 Arquivo:  ${zipName}`)
console.log(`📊 Tamanho:  ${sizeMB} MB`)
console.log(`🔒 SHA256:   ${hash}\n`)

// 5. Restore full dev dependencies for ongoing local work
console.log('[package] Restaurando dependências de desenvolvimento (pnpm install)...')
execSync('pnpm install', { cwd: rootDir, stdio: 'inherit' })
