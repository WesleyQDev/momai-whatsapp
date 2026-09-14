import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const stub = (file: string): string =>
  fileURLToPath(new URL(`./tests/stubs/${file}`, import.meta.url))

// Extension UI imports host bridges (`momai:sdk`, `momai:image-viewer`) that
// only exist inside the MomAI renderer bundle; tests resolve them to stubs.
export default defineConfig({
  resolve: {
    alias: {
      'momai:sdk': stub('momai-sdk.ts'),
      'momai:image-viewer': stub('momai-image-viewer.tsx')
    }
  }
})
