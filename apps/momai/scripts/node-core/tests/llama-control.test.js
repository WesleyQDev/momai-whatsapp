describe('llama control routes', () => {
  test('POST /llama/stop calls stopLlamaServer and returns stopped: true', async () => {
    let stopped = false
    let lastStatus, lastData
    const ctx = {
      stopLlamaServer: async () => {
        stopped = true
      },
      ensureLlamaReady: async () => ({ ready: true, is_loading: false }),
      sendJson: (res, status, data) => {
        lastStatus = status
        lastData = data
      },
      llamaState: { ready: true }
    }

    const { createStatusRoutes } = require('../api/routes/status.routes')
    const handler = createStatusRoutes(ctx)

    const req = { method: 'POST' }
    const res = {}
    const handled = await handler(req, res, '/llama/stop', { searchParams: new URLSearchParams() })

    expect(handled).toBe(true)
    expect(stopped).toBe(true)
    expect(lastStatus).toBe(200)
    expect(lastData).toEqual({ stopped: true })
  })

  test('POST /llama/start calls ensureLlamaReady and returns ready state', async () => {
    let started = false
    let lastStatus, lastData
    const ctx = {
      stopLlamaServer: async () => {},
      ensureLlamaReady: async (force) => {
        started = true
        return { ready: true, is_loading: false }
      },
      sendJson: (res, status, data) => {
        lastStatus = status
        lastData = data
      },
      llamaState: { ready: true }
    }

    const { createStatusRoutes } = require('../api/routes/status.routes')
    const handler = createStatusRoutes(ctx)

    const req = { method: 'POST' }
    const res = {}
    const handled = await handler(req, res, '/llama/start', { searchParams: new URLSearchParams() })

    expect(handled).toBe(true)
    expect(started).toBe(true)
    expect(lastStatus).toBe(200)
    expect(lastData).toEqual({ ready: true, is_loading: false })
  })
})
