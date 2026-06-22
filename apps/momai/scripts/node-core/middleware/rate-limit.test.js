const { createRateLimiter } = require('./rate-limit.js')

function makeReqRes() {
  return {
    req: { ip: '127.0.0.1' },
    res: {
      writeHead: function (s, h) { this.statusCode = s; this.headers = h || {} },
      end: function (b) { this.body = b },
      statusCode: 200,
      headers: {},
      body: null
    },
    next: () => {}
  }
}

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 0.0001 })
    for (let i = 0; i < 3; i++) {
      const { res, next } = makeReqRes()
      limiter({ req: { ip: '1.2.3.4' } }, res, next)
      expect(res.statusCode || 200).toBe(200)
    }
  })

  it('returns 429 when capacity is exceeded', () => {
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 0.0001 })
    const ip = '5.6.7.8'
    const r1 = makeReqRes(); limiter({ req: { ip } }, r1.res, r1.next)
    const r2 = makeReqRes(); limiter({ req: { ip } }, r2.res, r2.next)
    const r3 = makeReqRes(); limiter({ req: { ip } }, r3.res, r3.next)
    expect(r3.res.statusCode).toBe(429)
  })

  it('tracks buckets per IP independently', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 0.0001 })
    const r1 = makeReqRes(); limiter({ req: { ip: 'a' } }, r1.res, r1.next)
    const r2 = makeReqRes(); limiter({ req: { ip: 'a' } }, r2.res, r2.next)
    const r3 = makeReqRes(); limiter({ req: { ip: 'b' } }, r3.res, r3.next)
    expect(r2.res.statusCode).toBe(429)
    expect(r3.res.statusCode).toBe(200)
  })

  it('uses a fallback key when req.ip is missing', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 0.0001 })
    const r1 = makeReqRes(); limiter({ req: {} }, r1.res, r1.next)
    const r2 = makeReqRes(); limiter({ req: {} }, r2.res, r2.next)
    expect(r2.res.statusCode).toBe(429)
  })
})
