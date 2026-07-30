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

      let userExtensionsDir = ''
      if (process.platform === 'win32') {
        userExtensionsDir = join(
          process.env.APPDATA || '',
          'MomAI-Dev',
          'data',
          'extensions',
          skillId
        )
      } else if (process.platform === 'darwin') {
        userExtensionsDir = join(
          process.env.HOME || '',
          'Library',
          'Application Support',
          'MomAI-Dev',
          'data',
          'extensions',
          skillId
        )
      } else {
        userExtensionsDir = join(
          process.env.HOME || '',
          '.config',
          'MomAI-Dev',
          'data',
          'extensions',
          skillId
        )
      }

      const candidates = [
        resolve(__dirname, 'data/extensions/.dev', skillId),
        resolve(__dirname, 'data/extensions', skillId),
        userExtensionsDir
      ].filter(Boolean)

      const skillDir = candidates.find((d) => {
        if (!existsSync(d)) return false
        const full = join(d, 'dist', filePath)
        return existsSync(full)
      })
      if (!skillDir) return null
      const fullPath = join(skillDir, 'dist', filePath)
      this.addWatchFile(fullPath)
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
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        'momai:sdk': resolve(__dirname, 'src/sdk/runtime.ts')
      },
      dedupe: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
        '@codemirror/lang-markdown'
      ]
    },
    plugins: [react(), skillBundlesPlugin()],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-markdown',
        'react-router',
        'remark-gfm',
        '@tanstack/react-virtual'
      ]
    }
  }
})
