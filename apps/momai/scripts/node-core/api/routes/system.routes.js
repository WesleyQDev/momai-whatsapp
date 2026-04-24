function createSystemRoutes(context) {
  const { store, sendJson, saveStore } = context

  return async function handleSystemRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/system/gaming-apps' && req.method === 'GET') {
      sendJson(res, 200, store.gaming_apps)
      return true
    }

    if (pathname === '/system/gaming-apps' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const appItem = {
        id: store.next_gaming_app_id++,
        name: String(payload.name || 'Game'),
        executable: String(payload.executable || ''),
        is_active: false
      }
      store.gaming_apps.push(appItem)
      saveStore()
      sendJson(res, 200, appItem)
      return true
    }

    if (pathname.startsWith('/system/gaming-apps/') && req.method === 'DELETE') {
      const id = Number(pathname.split('/').pop())
      store.gaming_apps = store.gaming_apps.filter((item) => item.id !== id)
      saveStore()
      sendJson(res, 200, { ok: true })
      return true
    }

    return false
  }
}

module.exports = { createSystemRoutes }
