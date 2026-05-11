function createSkillsRoutes(context) {
  const { sendJson, readJsonBody, store, saveStore } = context

  return async function handleSkillsRoutes(req, res, pathname) {
    if (pathname === '/skills/keywords' && req.method === 'GET') {
      sendJson(res, 200, store.skillKeywords || {})
      return true
    }

    const match = pathname.match(/^\/skills\/keywords\/([^/]+)$/)
    if (match && req.method === 'PUT') {
      const skillId = match[1]
      const body = await readJsonBody(req).catch(() => ({}))
      const keywords = Array.isArray(body.keywords) ? body.keywords : []
      const normalized = keywords.map((k) => String(k).trim()).filter(Boolean)

      if (!store.skillKeywords) store.skillKeywords = {}
      store.skillKeywords[skillId] = normalized
      saveStore()
      sendJson(res, 200, { ok: true, keywords: normalized })
      return true
    }

    return false
  }
}

module.exports = { createSkillsRoutes }
