function getSessionToken() {
  return process.env.MOMAI_SESSION_TOKEN || null
}

module.exports = { getSessionToken }
