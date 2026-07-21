// apps/momai/scripts/test-vite-skill-bundles.mjs
// Standalone test for the skillBundlesPlugin Vite plugin
// Usage: node scripts/test-vite-skill-bundles.mjs
//
// Validates that Vite can serve skill bundles via resolveId + load hooks,
// and that Vite's import analysis handles CJS interop (named imports
// from pre-bundled CJS deps like react/jsx-runtime).

import { createServer } from 'vite'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import http from 'node:http'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const APP_DIR = resolve(__dirname, '..')

function skillBundlesPlugin() {
  return {
    name: 'skill-bundles-dev',
    enforce: 'pre',
    resolveId(source) {
      const clean = source.split('?')[0]
      const match = clean.match(/^\/extensions\/([^/]+)\/dist\/(.+)$/)
      if (match) return clean
      return null
    },
    load(id) {
      const clean = id.split('?')[0]
      const match = clean.match(/^\/extensions\/([^/]+)\/dist\/(.+)$/)
      if (!match) return null
      const [, skillId, filePath] = match
      if (filePath.includes('..') || filePath.includes('\\')) return null
      const candidates = [
        resolve(APP_DIR, 'data/extensions', skillId)
      ]
      const skillDir = candidates.find((d) => existsSync(d))
      if (!skillDir) return null
      const fullPath = join(skillDir, 'dist', filePath)
      if (!existsSync(fullPath)) return null
      return readFileSync(fullPath, 'utf-8')
    }
  }
}

const request = (port, path) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, headers: { 'Accept-Encoding': 'identity' } }, (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
      })
      .on('error', reject)
  })

async function main() {
  console.log('=== Skill bundle plugin test (resolveId + load) ===\n')

  const server = await createServer({
    root: APP_DIR,
    logLevel: 'info',
    configFile: false,
    plugins: [skillBundlesPlugin()],
    server: { port: 5174, strictPort: true, host: '127.0.0.1' }
  })

  server.httpServer?.on('error', (e) => console.error('[server error]', e))
  process.on('uncaughtException', (e) => console.error('[uncaught]', e))

  await server.listen()
  await new Promise((r) => setTimeout(r, 2000))
  const port = server.config.server.port
  console.log(`\nVite listening on http://127.0.0.1:${port}\n`)

  const tests = [
    {
      label: 'skill bundle (page.js)',
      path: '/extensions/whatsapp/dist/page.js',
      expect: 'should contain import analysis rewrite (no bare specifiers)'
    },
    {
      label: 'skill bundle via ?import',
      path: '/extensions/whatsapp/dist/page.js?import',
      expect: 'should still work with query'
    }
  ]

  for (const t of tests) {
    try {
      const res = await request(port, t.path)
      const len = res.body.length
      const hasBareImport = /from\s+["']react["']/.test(res.body)
      const hasViteRewrite = /from\s+["']\/.*react/.test(res.body)
      const hasCjsInterop =
        /__vite__cjsImport|import\s+\{[^}]*\}\s+from\s+["']\/node_modules\/\.vite/.test(res.body)
      const preview =
        res.body.length > 200
          ? res.body.slice(0, 200).replace(/\n/g, ' ') + '…'
          : res.body.replace(/\n/g, ' ')
      console.log(`[${res.status}] ${t.label}`)
      console.log(`       path: ${t.path}`)
      console.log(`       length: ${len} bytes`)
      console.log(`       bare react import: ${hasBareImport ? 'YES (BAD)' : 'NO (good)'}`)
      console.log(`       vite rewrite: ${hasViteRewrite ? 'YES (good)' : 'NO'}`)
      console.log(`       cjs interop: ${hasCjsInterop ? 'YES (good)' : 'NO'}`)
      console.log(`       preview: ${preview}\n`)
    } catch (e) {
      console.log(`[ERR] ${t.label}  path=${t.path}  err=${e.message}\n`)
    }
  }

  await server.close()
  console.log('Done.')
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
