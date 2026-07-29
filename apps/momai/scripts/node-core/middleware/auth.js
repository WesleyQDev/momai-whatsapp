const { sendJson } = require('../infrastructure/http-helpers.js')
const { getSessionToken } = require('../config/security.js')

function authMiddleware(req, res, next) {
  const expected = getSessionToken()
  if (!expected) {
    return sendJson(res, 500, { ok: false, error: 'server misconfigured: no session token' })
  }
  const auth = req.headers['authorization']
  const sessionToken = req.headers['x-session-token']
  if (auth !== `Bearer ${expected}` && sessionToken !== expected) {
    return sendJson(res, 401, { ok: false, error: 'unauthorized' })
  }
  next()
}

module.exports = { authMiddleware }
