function extractWsToken(url) {
  const token = url.searchParams.get('token')
  if (!token || token.length === 0) return null
  return token
}

function isValidWsUpgrade(url) {
  const expected = process.env.MOMAI_SESSION_TOKEN
  if (!expected) return false
  const provided = extractWsToken(url)
  if (!provided) return false
  return provided === expected
}

module.exports = { extractWsToken, isValidWsUpgrade }
