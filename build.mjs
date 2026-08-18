import { build, context } from 'esbuild'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))

const entries = []
if (manifest.ui?.page && existsSync(path.join(__dirname, 'src/page.tsx')))
  entries.push({ in: 'src/page.tsx', out: 'page' })
if (manifest.ui?.panel && existsSync(path.join(__dirname, 'src/panel.tsx')))
  entries.push({ in: 'src/panel.tsx', out: 'panel' })

if (entries.length === 0) {
  console.log('[skill:build] No UI entries in manifest. Nothing to do.')
  process.exit(0)
}

mkdirSync(path.join(__dirname, 'dist'), { recursive: true })

// Fornece react/react-dom/jsx-runtime/momai:sdk via window globals setados pelo host
// (window.React, window.ReactDOM, window.JSXRuntime, window.MomAISDK). Nada fica
// "external" — o bundle não emite `import ... from "react"` nem `from "momai:sdk"`,
// então o static server não reescreve para /vendor/* (que quebraria no appx).
const makeHostGlobalsPlugin = {
  name: 'make-host-globals',
  setup(build) {
    const mapGlobal = (filter, globalName, namespace) => {
      build.onResolve({ filter }, (args) => {
        return { path: args.path, namespace }
      })
      build.onLoad({ filter, namespace }, () => {
        return {
          contents: `module.exports = ${globalName};`,
          loader: 'js'
        }
      })
    }
    mapGlobal(/^react$/, 'window.React', 'react-global')
    mapGlobal(/^react-dom$/, 'window.ReactDOM', 'react-dom-global')
    mapGlobal(/^react\/jsx-runtime$/, 'window.JSXRuntime', 'react-jsx-runtime-global')
    mapGlobal(/^momai:sdk$/, 'window.MomAISDK', 'sdk-global')
  }
}

// Detect where the momai source folder is
let momaiSrcDir = path.resolve(__dirname, '../../../../src/renderer/src')
if (!existsSync(momaiSrcDir)) {
  // Try sibling directory structure (if cloned as a sibling to momai)
  momaiSrcDir = path.resolve(__dirname, '../momai/apps/momai/src/renderer/src')
}
if (!existsSync(momaiSrcDir)) {
  console.error('[skill:build] Error: Could not find momai source directory. Make sure momai repository is a sibling or parent of this extension.')
  process.exit(1)
}

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: entries.map((e) => ({ in: e.in, out: e.out })),
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'react',
  target: 'es2022',
  platform: 'browser',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  outdir: 'dist',
  logLevel: 'info',
  // O build injeta fontes do renderer da MomAI via alias (momai:image-viewer, etc.).
  // Esses arquivos podem importar pacotes de runtime do renderer (ex: @heroicons/react)
  // que só existem no node_modules da própria extensão no CI. `nodePaths` faz o esbuild
  // resolver esses bare imports também a partir do node_modules da extensão.
  nodePaths: [path.join(__dirname, 'node_modules')],
  plugins: [makeHostGlobalsPlugin],
  alias: {
    'momai:registry': path.resolve(momaiSrcDir, 'components/chat/SkillResponseRegistry.ts'),
    'momai:events': path.resolve(momaiSrcDir, 'hooks/useExtensionEvents.ts'),
    'momai:api': path.resolve(momaiSrcDir, 'services/api.ts'),
    'momai:constants': path.resolve(momaiSrcDir, 'constants.ts'),
    'momai:text': path.resolve(momaiSrcDir, 'utils/text.ts'),
    'momai:tts-service': path.resolve(momaiSrcDir, 'services/ttsService.ts'),
    'momai:image-viewer': path.resolve(momaiSrcDir, 'components/ImageViewer.tsx')
  }
}

if (process.argv.includes('--watch')) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('[skill:build] Watching for changes...')
} else {
  await build(options)
  console.log('[skill:build] Built →', entries.map((e) => e.out + '.js').join(', '))
}
