const { sendJson } = require('../infrastructure/http-helpers.js')

function createRateLimiter({ capacity, refillPerSecond }) {
  if (!Number.isFinite(capacity) || capacity <= 0) throw new Error('capacity must be > 0')
  if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) {
    throw new Error('refillPerSecond must be > 0')
  }

  const buckets = new Map()

  function getKey(req) {
    return (
      req?.req?.ip ||
      req?.ip ||
      req?.req?.socket?.remoteAddress ||
      req?.socket?.remoteAddress ||
      'unknown'
    )
  }

  function refill(bucket, now) {
    const elapsed = (now - bucket.lastRefill) / 1000
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond)
    bucket.lastRefill = now
  }

  return function rateLimitMiddleware(req, res, next) {
    const key = getKey(req)
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now }
      buckets.set(key, bucket)
    } else {
      refill(bucket, now)
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      next()
      return
    }
    sendJson(res, 429, { ok: false, error: 'rate limit exceeded' })
  }
}

module.exports = { createRateLimiter }
