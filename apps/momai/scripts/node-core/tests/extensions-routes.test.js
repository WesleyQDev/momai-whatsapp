const { createExtensionsRoutes } = require('../api/routes/extensions.routes')

function makeMockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      res.statusCode = code
      return res
    },
    json(data) {
      res.body = data
      return res
    }
  }
  return res
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

const fakeSkillManifest = {
  name: 'Fake Skill',
  routes: [{ method: 'POST', path: '/disconnect', tool: 'disconnect' }]
}

function makeRegistryWithSkill(skill) {
  return {
    refresh: async () => {},
    extensionsDir: '/tmp/exts',
    getById: (id) => (id === skill.id ? skill : null),
    getAll: () => [skill],
    loadExtensions: async () => {},
    executeHook: async () => {}
  }
}

describe('dynamic skill route mounting', () => {
  it('mounts POST /extensions/<id>/<path> from manifest.routes and dispatches to hostManager', async () => {
    const sendToPersistent = vi.fn().mockResolvedValue({ ok: true, message: 'done' })
    const { ctx } = makeCtx({
      skillRegistry: makeRegistryWithSkill({ id: 'fake-skill', manifest: fakeSkillManifest }),
      extensionHostManager: { sendToPersistent },
      readJsonBody: async () => ({ force: true })
    })
    const handler = createExtensionsRoutes(ctx)
    const res = makeMockRes()

    const handled = await handler(
      { method: 'POST' },
      res,
      '/extensions/fake-skill/disconnect',
      { searchParams: new URLSearchParams() }
    )

    expect(handled).toBe(true)
    expect(sendToPersistent).toHaveBeenCalledWith('fake-skill', {
      toolName: 'disconnect',
      args: { force: true }
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, message: 'done' })
  })

  it('mounts GET /extensions/<id>/panel and wraps the result in a structured response', async () => {
    const sendToPersistent = vi.fn().mockResolvedValue({
      connected: true,
      whitelist: [{ name: 'Pai', number: '5511' }]
    })
    const { ctx, calls } = makeCtx({
      skillRegistry: makeRegistryWithSkill({ id: 'fake-skill', manifest: fakeSkillManifest }),
      extensionHostManager: { sendToPersistent }
    })
    const handler = createExtensionsRoutes(ctx)

    const handled = await handler(
      { method: 'GET' },
      {},
      '/extensions/fake-skill/panel',
      { searchParams: new URLSearchParams() }
    )

    expect(handled).toBe(true)
    expect(sendToPersistent).toHaveBeenCalledWith('fake-skill', {
      toolName: 'panel',
      args: {}
    })
    expect(calls.status).toBe(200)
    expect(calls.data.connected).toBe(true)
    expect(calls.data.structuredResponse.type).toBe('generic-extension')
  })

  it('returns 500 on hostManager.sendToPersistent error for mounted route', async () => {
    const sendToPersistent = vi.fn().mockRejectedValue(new Error('boom'))
    const { ctx } = makeCtx({
      skillRegistry: makeRegistryWithSkill({ id: 'fake-skill', manifest: fakeSkillManifest }),
      extensionHostManager: { sendToPersistent }
    })
    const handler = createExtensionsRoutes(ctx)
    const res = makeMockRes()

    const handled = await handler(
      { method: 'POST' },
      res,
      '/extensions/fake-skill/disconnect',
      { searchParams: new URLSearchParams() }
    )

    expect(handled).toBe(true)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ ok: false, error: 'boom' })
  })

  it('falls through to the next handler when no skill declares the route', async () => {
    const { ctx } = makeCtx({
      skillRegistry: makeRegistryWithSkill({ id: 'fake-skill', manifest: {} })
    })
    const handler = createExtensionsRoutes(ctx)
    const res = makeMockRes()

    const handled = await handler(
      { method: 'POST' },
      res,
      '/launcher/open',
      { searchParams: new URLSearchParams() }
    )

    expect(handled).toBe(false)
    expect(res.statusCode).toBe(200)
  })
})
