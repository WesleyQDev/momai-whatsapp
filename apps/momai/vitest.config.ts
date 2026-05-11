import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 35,
        branches: 30,
        functions: 35,
        lines: 36
      }
    },
    projects: [
      {
        test: {
          name: 'scripts',
          root: resolve(__dirname, 'scripts/node-core'),
          environment: 'node',
          include: ['**/*.test.js'],
          coverage: {
            include: ['scripts/node-core/**/*.js'],
            exclude: ['scripts/node-core/**/*.test.js']
          }
        }
      },
      {
        test: {
          name: 'main',
          root: resolve(__dirname, 'src/main'),
          environment: 'node',
          include: ['**/*.test.ts'],
          setupFiles: [resolve(__dirname, 'src/main/test-setup.ts')],
          coverage: {
            include: ['src/main/**/*.ts'],
            exclude: ['src/main/**/*.test.ts', 'src/main/test-setup.ts', 'src/main/index.ts']
          }
        }
      },
      {
        test: {
          name: 'renderer',
          root: resolve(__dirname, 'src/renderer/src'),
          environment: 'jsdom',
          include: ['**/*.test.{ts,tsx}'],
          setupFiles: [resolve(__dirname, 'src/renderer/src/test-setup.ts')],
          coverage: {
            include: ['src/renderer/src/**/*.{ts,tsx}'],
            exclude: [
              'src/renderer/src/**/*.test.{ts,tsx}',
              'src/renderer/src/test-setup.ts',
              'src/renderer/src/main.tsx',
              'src/renderer/src/env.d.ts'
            ]
          },
          globals: true
        }
      }
    ]
  }
})
