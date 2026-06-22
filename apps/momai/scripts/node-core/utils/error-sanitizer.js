const SAFE_MESSAGES = new Set([
  'Internal server error',
  'Service unavailable',
  'Bad request',
  'Not found',
  'Unauthorized',
  'Forbidden',
  'Conflict',
  'Unprocessable entity'
])

function isSafeErrorMessage(msg) {
  if (typeof msg !== 'string' || msg.length === 0) return false
  if (SAFE_MESSAGES.has(msg)) return true
  if (msg.length > 100) return false
  if (/at\s+\S+\.\w+:\d+/.test(msg)) return false
  if (/\/(?:etc|home|users|var|tmp|root)\//i.test(msg)) return false
  if (/[A-Z]:\\/.test(msg)) return false
  if (/Error:\s/.test(msg)) return false
  return true
}

function sanitizeError(err, { isDev = false, fallback = 'Internal server error' } = {}) {
  if (isDev) {
    return { status: 500, body: { ok: false, error: String(err?.message || err || 'unknown') } }
  }
  const safe = isSafeErrorMessage(fallback) ? fallback : 'Internal server error'
  return { status: 500, body: { ok: false, error: safe } }
}

module.exports = { sanitizeError, isSafeErrorMessage, SAFE_MESSAGES }
