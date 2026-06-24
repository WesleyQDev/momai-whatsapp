const { mountSkillRoutes } = require('../services/manifest-routes')

function makeApp() {
  const routes = []
  return {
    get: (path, handler) => routes.push({ method: 'GET', path, handler }),
    post: (path, handler) => routes.push({ method: 'POST', path, handler }),
    routes
  }
}

describe('mountSkillRoutes', () => {
  it('mounts a POST route declared in skill manifest', () => {
    const app = makeApp()
    const hostManager = { sendToPersistent: vi.fn().mockResolvedValue({ ok: true }) }
    const skills = [
      { id: 'whatsapp', manifest: { routes: [{ method: 'POST', path: '/disconnect', tool: 'disconnect' }] } }
    ]
    mountSkillRoutes(app, skills, hostManager)
    expect(app.routes).toEqual([{ method: 'POST', path: '/extensions/whatsapp/disconnect', handler: expect.any(Function) }])
  })

  it('skips skills without routes', () => {
    const app = makeApp()
    mountSkillRoutes(app, [{ id: 'launcher', manifest: {} }], { sendToPersistent: vi.fn() })
    expect(app.routes).toEqual([])
  })

  it('skips unsupported HTTP methods', () => {
    const app = makeApp()
    mountSkillRoutes(
      app,
      [{ id: 'x', manifest: { routes: [{ method: 'PATCH', path: '/p', tool: 't' }] } }],
      { sendToPersistent: vi.fn() }
    )
    expect(app.routes).toEqual([])
  })

  it('handler dispatches to hostManager.sendToPersistent with correct args', async () => {
    const app = makeApp()
    const hostManager = { sendToPersistent: vi.fn().mockResolvedValue({ ok: true, message: 'done' }) }
    const skills = [
      { id: 'whatsapp', manifest: { routes: [{ method: 'POST', path: '/disconnect', tool: 'disconnect' }] } }
    ]
    mountSkillRoutes(app, skills, hostManager)
    const fakeRes = { json: vi.fn(), status: vi.fn().mockReturnThis() }
    await app.routes[0].handler({ body: { force: true } }, fakeRes)
    expect(hostManager.sendToPersistent).toHaveBeenCalledWith('whatsapp', { toolName: 'disconnect', args: { force: true } })
    expect(fakeRes.json).toHaveBeenCalledWith({ ok: true, message: 'done' })
  })

  it('handler returns 500 on hostManager error', async () => {
    const app = makeApp()
    const hostManager = { sendToPersistent: vi.fn().mockRejectedValue(new Error('boom')) }
    const skills = [
      { id: 'whatsapp', manifest: { routes: [{ method: 'POST', path: '/disconnect', tool: 'disconnect' }] } }
    ]
    mountSkillRoutes(app, skills, hostManager)
    const fakeRes = { json: vi.fn(), status: vi.fn().mockReturnThis() }
    await app.routes[0].handler({}, fakeRes)
    expect(fakeRes.status).toHaveBeenCalledWith(500)
    expect(fakeRes.json).toHaveBeenCalledWith({ ok: false, error: 'boom' })
  })
})
