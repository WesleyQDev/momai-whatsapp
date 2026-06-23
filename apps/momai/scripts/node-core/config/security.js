function getSessionToken() {
  const arg = process.argv.find((a) => a.startsWith('--momai-session-token='))
  if (arg) {
    const value = arg.slice('--momai-session-token='.length)
    if (value) return value
  }
  return process.env.MOMAI_SESSION_TOKEN || null
}

module.exports = { getSessionToken }
