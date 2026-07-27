import * as esbuild from 'esbuild'

const entry = 'src/index.ts'
const outfile = 'dist/main.js'

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  external: ['momai:sdk', 'react', 'react-dom', 'react/jsx-runtime'],
  sourcemap: true,
  minify: process.argv.includes('--production')
})

console.log(`Built ${entry} -> ${outfile}`)
