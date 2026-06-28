import { describe, expect, it } from 'vitest'
import { resolveRendererLoadUrl } from './renderer-load-path'

describe('resolveRendererLoadUrl', () => {
  it('uses the Vite dev server in development', () => {
    expect(
      resolveRendererLoadUrl({
        isDev: true,
        electronRendererUrl: 'http://localhost:5173'
      })
    ).toBe('http://localhost:5173')
  })

  it('uses localhost HTTP in production instead of file://', () => {
    expect(
      resolveRendererLoadUrl({
        isDev: false,
        productionBaseUrl: 'http://localhost:48291'
      })
    ).toBe('http://localhost:48291/index.html')
  })

  it('supports overlay hash routes in production', () => {
    expect(
      resolveRendererLoadUrl({
        isDev: false,
        productionBaseUrl: 'http://localhost:48291',
        routeHash: 'overlay'
      })
    ).toBe('http://localhost:48291/index.html#/overlay')
  })
})
