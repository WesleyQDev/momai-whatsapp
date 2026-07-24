function setupWebSocket({ server, store, llamaState, info, HOST, PORT }) {
  let WebSocketServer = null
  try {
    WebSocketServer = require('ws').WebSocketServer
  } catch {
    /* ws module not available */
  }

  let wss = null
  const wsClients = new Set()
  let pythonWs = null

  const { syncWakeWordState, syncPythonCallModeState } = require('../services/tts-service')

  function broadcast(payload) {
    if (!wss) return
    const data = JSON.stringify(payload)
    for (const client of wsClients) {
      if (client.readyState === 1) client.send(data)
    }
  }

  function emitInitProgress() {
    broadcast({
      type: 'init_progress',
      data: {
        message: store.init_status.message,
        progress: store.init_status.progress
      }
    })
  }

  async function sendResourceUsage() {
    const mem = process.memoryUsage()
    const ramMb = Math.round(mem.rss / 1024 / 1024)
    let runtime = null
    try {
      const { fetchLlamaRuntimeTelemetry } = require('../services/llama-manager')
      runtime = await fetchLlamaRuntimeTelemetry().catch(() => null)
    } catch {
      runtime = null
    }

    broadcast({
      type: 'resource_usage',
      data: {
        ram_mb: ramMb,
        vram_used_mb: Math.max(0, Number(runtime?.vramUsedMb || llamaState.vramUsedMb || 0)),
        vram_total_mb: Math.max(0, Number(runtime?.vramTotalMb || llamaState.vramTotalMb || 0)),
        context_used_tokens: Math.max(
          0,
          Number(
            runtime?.kvUsedTokens ||
              llamaState.kvCacheUsedTokens ||
              llamaState.contextUsedTokens ||
              0
          )
        ),
        context_total_tokens: Math.max(
          0,
          Number(
            runtime?.kvTotalTokens ||
              llamaState.kvCacheTotalTokens ||
              llamaState.contextTotalTokens ||
              8192
          )
        )
      }
    })
  }

  const PYTHON_HOST = process.env.MOMAI_PYTHON_SIDECAR_HOST || '127.0.0.1'
  const PYTHON_PORT = Number(process.env.MOMAI_PYTHON_SIDECAR_PORT || 8001)

  let reconnectDelay = 5000
  const MAX_RECONNECT_DELAY = 60000

  function resetReconnectDelay() {
    reconnectDelay = 5000
  }

  function connectPythonSidecar() {
    if (!WebSocketServer) return
    const WebSocket = require('ws')
    const url = `ws://${PYTHON_HOST}:${PYTHON_PORT}/voice/ws`

    if (pythonWs) {
      try {
        pythonWs.close()
      } catch (e) {
        /* ignore */
      }
    }

    pythonWs = new WebSocket(url)

    pythonWs.on('open', () => {
      info(`[NodeCore] Connected to Python sidecar WebSocket at ${url}`)
      resetReconnectDelay()
      syncPythonCallModeState('ws_reconnect')
      syncWakeWordState('ws_reconnect')
    })

    pythonWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (
          [
            'tts_start',
            'tts_stop',
            'voice_bands',
            'voice_status',
            'voice_partial',
            'voice_error'
          ].includes(msg.type)
        ) {
          broadcast(msg)
        }
      } catch (e) {
        /* ignore */
      }
    })

    pythonWs.on('error', () => {
      // Suppress error logs to avoid noise if Python is starting up
    })

    pythonWs.on('close', () => {
      pythonWs = null
      setTimeout(() => {
        connectPythonSidecar()
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
      }, reconnectDelay)
    })
  }

  if (WebSocketServer && server) {
    wss = new WebSocketServer({ noServer: true })
    info('[WS] WebSocket server created (noServer mode)')

    const { isValidWsUpgrade } = require('../middleware/ws-auth.js')

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
      if (url.pathname !== '/ws') {
        socket.destroy()
        return
      }
      const provided = require('../middleware/ws-auth.js').extractWsToken(url)
      const expected = require('../config/security.js').getSessionToken()
      if (!isValidWsUpgrade(url)) {
        info(`[WS] Rejected: provided="${provided?.slice(0, 12)}..." expected="${expected?.slice(0, 12)}..."`)
        info(`[WS] Full token comparison: provided=${provided === expected}`)
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
      info('[WS] Upgrade accepted')

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    })

    wss.on('connection', (ws) => {
      wsClients.add(ws)
      sendResourceUsage()
      emitInitProgress()

      ws.on('message', (raw) => {
        let parsed
        try {
          parsed = JSON.parse(String(raw))
        } catch {
          return
        }
        if (parsed?.type === 'session_sync') {
          ws.send(JSON.stringify({ type: 'session_sync', ok: true }))
          if (parsed.thread_id && pythonWs?.readyState === WebSocket.OPEN) {
            pythonWs.send(JSON.stringify({ type: 'session_sync', thread_id: parsed.thread_id }))
          }
        }
      })

      ws.on('close', () => {
        wsClients.delete(ws)
      })
    })
  }

  return {
    wss,
    wsClients,
    pythonWs,
    broadcast,
    emitInitProgress,
    sendResourceUsage,
    connectPythonSidecar
  }
}

module.exports = { setupWebSocket }
