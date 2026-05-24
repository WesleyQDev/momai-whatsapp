describe('economy routes', () => {
  function makeCtx(overrides = {}) {
    const store = {
      economy: {
        gaming_mode_enabled: false,
        idle_timeout_app_open: 5,
        idle_timeout_minimized: 1,
        auto_detect_known_games: true,
        gaming_apps: [],
        next_gaming_app_id: 1
      }
    }
    let lastStatus, lastData
    const ctx = {
      store,
      sendJson: (res, status, data) => {
        lastStatus = status
        lastData = data
      },
      saveStore: () => {},
      readJsonBody: async () => ({}),
      ...overrides
    }
    return { ctx, getLast: () => ({ status: lastStatus, data: lastData }) }
  }

  test('GET /economy/config returns economy config', async () => {
    const { ctx, getLast } = makeCtx()
    const { createEconomyRoutes } = require('../api/routes/economy.routes')
    const handler = createEconomyRoutes(ctx)

    const handled = await handler({ method: 'GET' }, {}, '/economy/config', {
      searchParams: new URLSearchParams()
    })

    expect(handled).toBe(true)
    expect(getLast().status).toBe(200)
    expect(getLast().data).toHaveProperty('gaming_mode_enabled')
    expect(getLast().data).toHaveProperty('idle_timeout_app_open')
    expect(getLast().data).toHaveProperty('idle_timeout_minimized')
    expect(getLast().data).toHaveProperty('gaming_apps')
  })

  test('PATCH /economy/config updates economy config', async () => {
    let savedStore = null
    const { ctx, getLast } = makeCtx({
      saveStore: () => {
        savedStore = { ...ctx.store }
      },
      readJsonBody: async () => ({ gaming_mode_enabled: true, idle_timeout_app_open: 10 })
    })
    const { createEconomyRoutes } = require('../api/routes/economy.routes')
    const handler = createEconomyRoutes(ctx)

    const handled = await handler({ method: 'PATCH' }, {}, '/economy/config', {
      searchParams: new URLSearchParams()
    })

    expect(handled).toBe(true)
    expect(getLast().status).toBe(200)
    expect(getLast().data).toEqual({ ok: true })
    expect(ctx.store.economy.gaming_mode_enabled).toBe(true)
    expect(ctx.store.economy.idle_timeout_app_open).toBe(10)
    expect(savedStore).not.toBeNull()
  })

  test('GET /economy/status returns current economy state', async () => {
    const { ctx, getLast } = makeCtx()
    const { createEconomyRoutes } = require('../api/routes/economy.routes')
    const handler = createEconomyRoutes(ctx)

    const handled = await handler({ method: 'GET' }, {}, '/economy/status', {
      searchParams: new URLSearchParams()
    })

    expect(handled).toBe(true)
    expect(getLast().status).toBe(200)
    expect(getLast().data).toHaveProperty('active', false)
    expect(getLast().data).toHaveProperty('reason')
    expect(getLast().data).toHaveProperty('detected_games')
  })
})
