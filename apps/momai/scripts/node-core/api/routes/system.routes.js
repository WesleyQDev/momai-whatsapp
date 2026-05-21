async function searchSteamStore(term) {
  const url = `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(term)}&cc=us&l=en`
  const res = await fetch(url)
  if (!res.ok) return null
  const body = await res.json()
  if (body && body.items && body.items.length > 0) {
    const item = body.items[0]
    if (item.header_image) return item.header_image
    if (item.id)
      return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`
  }
  return null
}

async function fetchCoverFromSteamStore(gameName) {
  try {
    const clean = gameName.replace(/\.exe["']?\s*$/i, '').trim()
    const terms = [clean]
    const stripped = clean.replace(/\s*(Updater|Launcher|Installer|Setup|Patcher)\s*$/i, '').trim()
    if (stripped !== clean) terms.push(stripped)
    const words = clean.split(/\s+/)
    if (words.length > 2) terms.push(words.slice(0, 2).join(' '))
    for (const term of terms) {
      const result = await searchSteamStore(term)
      if (result) return result
    }
    return null
  } catch {
    return null
  }
}

function createSystemRoutes(context) {
  const { store, sendJson, saveStore } = context

  return async function handleSystemRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/system/gaming-apps' && req.method === 'GET') {
      let changed = false
      for (const app of store.gaming_apps) {
        if (!app.cover_url) {
          app.cover_url = (await fetchCoverFromSteamStore(app.name)) || null
          changed = true
        }
      }
      if (changed) saveStore()
      sendJson(res, 200, store.gaming_apps)
      return true
    }

    if (pathname === '/system/gaming-apps' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const rawName = String(payload.name || 'Game')
      const gameName = rawName
        .replace(/\.exe["']?\s*$/i, '')
        .replace(/\s*(Updater|Launcher|Installer)\s*$/i, '')
        .trim()
      const coverUrl = await fetchCoverFromSteamStore(gameName)

      const appItem = {
        id: store.next_gaming_app_id++,
        name: gameName,
        executable: String(payload.executable || ''),
        cover_url: coverUrl,
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
