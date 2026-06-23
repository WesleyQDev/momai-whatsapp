const { getSessionToken } = require('../config/security.js')

function extractWsToken(url) {
  const token = url.searchParams.get('token')
  if (!token || token.length === 0) return null
  return token
}

function isValidWsUpgrade(url) {
  const expected = getSessionToken()
  if (!expected) return false
  const provided = extractWsToken(url)
  if (!provided) return false
  return provided === expected
}

module.exports = { extractWsToken, isValidWsUpgrade }
