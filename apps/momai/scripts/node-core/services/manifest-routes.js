const { sendJson } = require('../infrastructure/http-helpers')

function mountSkillRoutes(app, skills, hostManager) {
  if (!Array.isArray(skills)) return
  for (const skill of skills) {
    const routes = skill?.manifest?.routes
    if (!Array.isArray(routes)) continue
    for (const route of routes) {
      const method = String(route.method || '').toLowerCase()
      if (typeof app[method] !== 'function') continue
      const fullPath = `/extensions/${skill.id}${route.path}`
      const handler = async (req, res) => {
        try {
          const result = await hostManager.sendToPersistent(skill.id, {
            toolName: route.tool,
            args: req.body || {}
          })
          sendJson(res, 200, result || { ok: true })
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err && err.message ? err.message : 'error' })
        }
      }
      app[method](fullPath, handler)
    }
  }
}

module.exports = { mountSkillRoutes }
