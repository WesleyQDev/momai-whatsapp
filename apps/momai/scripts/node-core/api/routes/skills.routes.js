const { routeByKeyword } = require('../../services/keyword-router')

function createSkillsRoutes(context) {
  const { sendJson, readJsonBody, store, saveStore, skillRegistry } = context

  return async function handleSkillsRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/skills/keywords' && req.method === 'GET') {
      sendJson(res, 200, store.skillKeywords || {})
      return true
    }

    if (pathname === '/skills/keywords/check' && req.method === 'GET') {
      const text = parsedUrl.searchParams?.get('text') || ''
      if (!text.trim() || !skillRegistry) {
        sendJson(res, 200, { matched: false })
        return true
      }
      const match = routeByKeyword(text, skillRegistry)
      sendJson(res, 200, { matched: !!match, skillId: match?.skillId || null })
      return true
    }

    const routeMatch = pathname.match(/^\/skills\/keywords\/([^/]+)$/)
    if (routeMatch && req.method === 'PUT') {
      const skillId = routeMatch[1]
      const body = await readJsonBody(req).catch(() => ({}))
      const keywords = Array.isArray(body.keywords) ? body.keywords : []
      const normalized = keywords.map((k) => String(k).trim()).filter(Boolean)

      if (!store.skillKeywords) store.skillKeywords = {}
      store.skillKeywords[skillId] = normalized

      // Fix: Ensure we call the correct save function from context
      if (typeof context.saveStoreNow === 'function') {
        context.saveStoreNow()
      } else {
        saveStore()
      }

      sendJson(res, 200, { ok: true, keywords: normalized })
      return true
    }

    return false
  }
}

module.exports = { createSkillsRoutes }
