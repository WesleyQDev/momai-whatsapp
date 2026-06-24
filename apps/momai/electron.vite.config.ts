import { existsSync, createReadStream } from 'fs'
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
        const mime = MIME_BY_EXT[extname(fullPath).toLowerCase()] || 'application/octet-stream'
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'no-cache')
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
