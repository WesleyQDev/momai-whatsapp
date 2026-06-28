import { describe, expect, it, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { app } from 'electron'
import {
  resolveRendererAssetPath,
  ensureRendererStaticServer,
  stopRendererStaticServer,
  getActiveRendererOrigin
} from './renderer-static-server'

describe('resolveRendererAssetPath', () => {
  it('serves existing files from the renderer root', () => {
    const root = mkdtempSync(join(tmpdir(), 'momai-renderer-'))
    writeFileSync(join(root, 'app.js'), 'console.log("ok")')

    expect(resolveRendererAssetPath(root, '/app.js')).toBe(join(root, 'app.js'))
  })

  it('falls back to index.html for SPA routes', () => {
    const root = mkdtempSync(join(tmpdir(), 'momai-renderer-'))
    writeFileSync(join(root, 'index.html'), '<html></html>')

    expect(resolveRendererAssetPath(root, '/extensions/foo/page.js')).toBe(join(root, 'index.html'))
  })

  it('resolves extension files from userData or packaged directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'momai-renderer-'))
    writeFileSync(join(root, 'index.html'), '<html></html>')

    const tempAppDir = mkdtempSync(join(tmpdir(), 'momai-mock-app-'))
    const tempUserDir = mkdtempSync(join(tmpdir(), 'momai-mock-user-'))

    const originalGetAppPath = app.getAppPath
    const originalGetPath = app.getPath

    app.getAppPath = vi.fn().mockReturnValue(tempAppDir)
    app.getPath = vi.fn().mockImplementation((name: string) => {
      if (name === 'userData') return tempUserDir
      return '/mock/default'
    })

    try {
      // 1. Test resolution from packaged skills
      const packagedDistDir = join(tempAppDir, 'scripts', 'skills', 'packaged', 'myext', 'dist')
      mkdirSync(packagedDistDir, { recursive: true })
      writeFileSync(join(packagedDistDir, 'page.js'), 'console.log("packaged")')

      expect(resolveRendererAssetPath(root, '/extensions/myext/dist/page.js')).toBe(
        join(packagedDistDir, 'page.js')
      )

      // 2. Test resolution from userData (installed extension)
      const userDistDir = join(tempUserDir, 'data', 'extensions', 'myext2', 'dist')
      mkdirSync(userDistDir, { recursive: true })
      writeFileSync(join(userDistDir, 'page.js'), 'console.log("user")')

      expect(resolveRendererAssetPath(root, '/extensions/myext2/dist/page.js')).toBe(
        join(userDistDir, 'page.js')
      )
    } finally {
      app.getAppPath = originalGetAppPath
      app.getPath = originalGetPath
    }
  })

  it('blocks path traversal attempts', () => {
    const root = mkdtempSync(join(tmpdir(), 'momai-renderer-'))
    writeFileSync(join(root, 'index.html'), '<html></html>')
    mkdirSync(join(root, 'nested'))
    writeFileSync(join(root, 'nested', 'secret.txt'), 'secret')

    expect(resolveRendererAssetPath(root, '/../secret.txt')).toBeNull()
    expect(resolveRendererAssetPath(root, '/nested/../../secret.txt')).toBeNull()
  })
})

describe('ensureRendererStaticServer', () => {
  afterEach(() => {
    stopRendererStaticServer()
  })

  it('serves renderer assets over localhost HTTP for production embeds', async () => {
    const root = mkdtempSync(join(tmpdir(), 'momai-renderer-http-'))
    writeFileSync(join(root, 'index.html'), '<html><body>MomAI</body></html>')

    const baseUrl = await ensureRendererStaticServer(root)
    expect(baseUrl).toMatch(/^http:\/\/localhost:\d+$/)
    expect(getActiveRendererOrigin()).toBe(baseUrl)

    const response = await fetch(`${baseUrl}/index.html`)
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain('MomAI')
  })
})
