import { existsSync, createReadStream, readFileSync } from 'fs'
import { resolve, extname, join } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'

const MIME_BY_EXT: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.map': 'application/json',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}

const BARE_TO_ABS: Record<string, string> = {
  react: '/node_modules/react/index.js?import',
  'react-dom': '/node_modules/react-dom/index.js?import',
  'react-dom/client': '/node_modules/react-dom/client.js?import',
  'react/jsx-runtime': '/node_modules/react/jsx-runtime.js?import',
  'react/jsx-dev-runtime': '/node_modules/react/jsx-dev-runtime.js?import'
}

const BARE_IMPORT_RE = /((?:from|import)\s*['"])([^'"./][^'"]*)(['"])/g

function skillBundlesPlugin() {
  return {
    name: 'skill-bundles-dev',
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use('/extensions', (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const match = url.match(/^\/([^/]+)\/dist\/(.+)$/)
        if (!match) return next()
        const [, skillId, filePath] = match
        if (filePath.includes('..') || filePath.includes('\\')) {
          res.statusCode = 400
          return res.end('invalid_path')
        }
        const candidates = [
          resolve(__dirname, 'scripts/skills/packaged', skillId),
          resolve(__dirname, 'data/extensions', skillId)
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
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main')
      }
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts')
      },
      rollupOptions: {
        external: ['edge-tts-universal', 'say']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@preload': resolve(__dirname, 'src/preload')
      }
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react(), skillBundlesPlugin()]
  }
})
