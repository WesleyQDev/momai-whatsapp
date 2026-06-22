const mockSpawn = vi.fn(() => ({
  on: vi.fn(),
  unref: vi.fn()
}))

const cp = require('node:child_process')
const realSpawn = cp.spawn
cp.spawn = mockSpawn

const { createExtensionsRoutes } = require('../api/routes/extensions.routes')

function restoreSpawn() {
  cp.spawn = realSpawn
}

function makeCtx(overrides = {}) {
  const calls = { status: null, data: null }
  const ctx = {
    skillRegistry: {
      refresh: async () => {},
      extensionsDir: '/tmp/exts',
      getById: () => null,
      getAll: () => [],
      loadExtensions: async () => {},
      executeHook: async () => {}
    },
    buildExtensionsPayload: async () => ({ installed: [], registry: [] }),
    sendJson: (res, status, data) => {
      calls.status = status
      calls.data = data
    },
    readJsonBody: async () => ({}),
    store: { extensions: [], settings: {} },
    saveStore: () => {},
    ensureDir: () => {},
    llamaState: { process: null },
    semanticState: { embedding: { process: null } },
    extensionHostManager: {
      sendToPersistent: async () => ({ ok: false, error: 'not_available' })
    },
    ...overrides
  }
  return { ctx, calls }
}

describe('launcher/open handler', () => {
  beforeEach(() => {
    mockSpawn.mockClear()
  })

  afterAll(() => {
    restoreSpawn()
  })

  it('uses spawn with arg array, never exec with string interpolation', async () => {
    const maliciousPath = 'C:\\test"; calc.exe; "'
    const { ctx, calls } = makeCtx({
      readJsonBody: async () => ({ path: maliciousPath })
    })
    const fs = require('node:fs')
    const origExistsSync = fs.existsSync
    fs.existsSync = () => true
    try {
      const handler = createExtensionsRoutes(ctx)

      await handler({ method: 'POST' }, {}, '/launcher/open', {
        searchParams: new URLSearchParams()
      })

      expect(mockSpawn).toHaveBeenCalled()
      const args = mockSpawn.mock.calls[0][1]
      expect(Array.isArray(args)).toBe(true)
      expect(args).toContain(maliciousPath)
      const command = mockSpawn.mock.calls[0][0]
      expect(command).not.toContain('calc')
      expect(command).not.toContain('&')
      expect(command).not.toContain(';')
      expect(calls.status).toBe(200)
    } finally {
      fs.existsSync = origExistsSync
    }
  })

  it('returns 400 when path is missing', async () => {
    const { ctx, calls } = makeCtx({
      readJsonBody: async () => ({})
    })
    const handler = createExtensionsRoutes(ctx)

    await handler({ method: 'POST' }, {}, '/launcher/open', {
      searchParams: new URLSearchParams()
    })

    expect(mockSpawn).not.toHaveBeenCalled()
    expect(calls.status).toBe(400)
  })

  it('returns 400 when path does not exist on disk', async () => {
    const { ctx, calls } = makeCtx({
      readJsonBody: async () => ({ path: 'C:\\nonexistent\\does-not-exist-xyz' })
    })
    const handler = createExtensionsRoutes(ctx)

    await handler({ method: 'POST' }, {}, '/launcher/open', {
      searchParams: new URLSearchParams()
    })

    expect(mockSpawn).not.toHaveBeenCalled()
    expect(calls.status).toBe(400)
  })
})
