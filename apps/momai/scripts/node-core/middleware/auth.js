const { sendJson } = require('../infrastructure/http-helpers.js')

function authMiddleware(req, res, next) {
  const expected = process.env.MOMAI_SESSION_TOKEN
  if (!expected) {
    return sendJson(res, 500, { ok: false, error: 'server misconfigured: no session token' })
  }
  const auth = req.headers['authorization']
  if (auth !== `Bearer ${expected}`) {
    return sendJson(res, 401, { ok: false, error: 'unauthorized' })
  }
  next()
}

module.exports = { authMiddleware }
