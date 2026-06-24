import { existsSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

function skillBundlesPlugin(): Plugin {
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
        resolve(__dirname, 'scripts/skills/packaged', skillId),
        resolve(__dirname, 'data/extensions', skillId)
      ]
      const skillDir = candidates.find((d) => existsSync(d))
      if (!skillDir) return null
      const fullPath = join(skillDir, 'dist', filePath)
      if (!existsSync(fullPath)) return null
      return readFileSync(fullPath, 'utf-8')
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
