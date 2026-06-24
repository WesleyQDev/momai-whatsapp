// apps/momai/scripts/test-vite-skill-bundles.mjs
// Standalone test for the skillBundlesPlugin Vite middleware
// Usage: node scripts/test-vite-skill-bundles.mjs

import { createServer } from 'vite'
import { resolve, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, createReadStream, readFileSync } from 'node:fs'
import http from 'node:http'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const APP_DIR = resolve(__dirname, '..')

const MIME_BY_EXT = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.map': 'application/json',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}

const BARE_TO_ABS = {
  react: '/@id/react',
  'react-dom': '/@id/react-dom',
  'react-dom/client': '/@id/react-dom/client',
  'react/jsx-runtime': '/@id/react/jsx-runtime',
  'react/jsx-dev-runtime': '/@id/react/jsx-dev-runtime'
}
const BARE_IMPORT_RE = /((?:from|import)\s*['"])([^'"./][^'"]*)(['"])/g

function skillBundlesPlugin() {
  return {
    name: 'skill-bundles-dev',
    configureServer(server) {
      console.log('[test] configureServer called')
      console.log('[test] stack len before use:', server.middlewares.stack.length)
      server.middlewares.use('/extensions', (req, res, next) => {
        console.log('[test] MIDDLEWARE HIT:', req.url)
        const url = (req.url || '').split('?')[0]
        const match = url.match(/^\/([^/]+)\/dist\/(.+)$/)
        if (!match) return next()
        const [, skillId, filePath] = match
        if (filePath.includes('..') || filePath.includes('\\')) {
          res.statusCode = 400
          return res.end('invalid_path')
        }
        const candidates = [
          resolve(APP_DIR, 'scripts/skills/packaged', skillId),
          resolve(APP_DIR, 'data/extensions', skillId)
        ]
        const skillDir = candidates.find((d) => existsSync(d))
        if (!skillDir) {
          res.statusCode = 404
          return res.end('skill_not_found')
        }
        const fullPath = join(skillDir, 'dist', filePath)
        if (!existsSync(fullPath)) {
          res.statusCode = 404
          return res.end('file_not_found')
        }
        const ext = extname(fullPath).toLowerCase()
        const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'no-cache')
        if (ext === '.js' || ext === '.mjs') {
          const rewritten = readFileSync(fullPath, 'utf8').replace(
            BARE_IMPORT_RE,
            (match, prefix, specifier, suffix) => {
              const abs = BARE_TO_ABS[specifier]
              return abs ? `${prefix}${abs}${suffix}` : match
            }
          )
          res.end(rewritten)
          return
        }
        createReadStream(fullPath).pipe(res)
      })
      console.log('[test] stack len after use:', server.middlewares.stack.length)
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
  console.log('=== Skill bundle middleware test ===\n')

  // Inline config (don't use electron-vite config file — it has 3 sub-configs)
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

  // Sanity ping
  try {
    const ping = await request(port, '/')
    console.log(`[ping] /  status=${ping.status}  body=${ping.body.length}b\n`)
  } catch (e) {
    console.log(`[ping ERR] ${e.message}\n`)
  }

  const tests = [
    { label: 'skill bundle (page.js)', path: '/extensions/whatsapp/dist/page.js' },
    { label: 'react /@id/react', path: '/@id/react' },
    { label: 'react-dom /@id/react-dom', path: '/@id/react-dom' },
    { label: 'react-dom/client /@id/react-dom/client', path: '/@id/react-dom/client' },
    { label: 'react/jsx-runtime /@id/react/jsx-runtime', path: '/@id/react/jsx-runtime' }
  ]

  for (const t of tests) {
    try {
      const res = await request(port, t.path)
      const len = res.body.length
      const preview =
        res.body.length > 120
          ? res.body.slice(0, 120).replace(/\n/g, ' ') + '…'
          : res.body.replace(/\n/g, ' ')
      console.log(`[${res.status}] ${t.label}`)
      console.log(`       path: ${t.path}`)
      console.log(`       length: ${len} bytes`)
      console.log(`       preview: ${preview}\n`)
    } catch (e) {
      console.log(`[ERR] ${t.label}  path=${t.path}  err=${e.message}\n`)
    }
  }

  // Print Vite's metadata for optimized deps
  const fs = await import('node:fs/promises')
  try {
    const meta = JSON.parse(
      await fs.readFile(resolve(APP_DIR, 'node_modules/.vite/deps/_metadata.json'), 'utf8')
    )
    console.log('=== Vite optimized deps (_metadata.json) ===')
    for (const [pkg, info] of Object.entries(meta.optimized)) {
      if (pkg.startsWith('react') || pkg === 'react' || pkg === 'react-dom') {
        console.log(`  ${pkg}  →  /node_modules/.vite/deps/${info.file}?v=${info.fileHash}`)
      }
    }
  } catch (e) {
    console.log('No _metadata.json found:', e.message)
  }

  await server.close()
  console.log('\nDone.')
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
