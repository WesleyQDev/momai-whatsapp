function createEconomyRoutes(context) {
  const { store, sendJson, saveStore, readJsonBody } = context

  return async function handleEconomyRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/economy/config' && req.method === 'GET') {
      sendJson(res, 200, store.economy)
      return true
    }

    if (pathname === '/economy/config' && req.method === 'PATCH') {
      const payload = await readJsonBody(req).catch(() => ({}))
      if (typeof payload.gaming_mode_enabled === 'boolean') {
        store.economy.gaming_mode_enabled = payload.gaming_mode_enabled
      }
      if (typeof payload.idle_timeout_app_open === 'number') {
        store.economy.idle_timeout_app_open = payload.idle_timeout_app_open
      }
      if (typeof payload.idle_timeout_minimized === 'number') {
        store.economy.idle_timeout_minimized = payload.idle_timeout_minimized
      }
      if (typeof payload.auto_detect_known_games === 'boolean') {
        store.economy.auto_detect_known_games = payload.auto_detect_known_games
      }
      saveStore()
      sendJson(res, 200, { ok: true })
      return true
    }

    if (pathname === '/economy/status' && req.method === 'GET') {
      sendJson(res, 200, {
        active: store.economy.gaming_mode_enabled,
        reason: null,
        detected_games: []
      })
      return true
    }

    return false
  }
}

module.exports = { createEconomyRoutes }
