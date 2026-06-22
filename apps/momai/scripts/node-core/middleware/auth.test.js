const { authMiddleware } = require('./auth.js')

function makeReqRes(headers = {}) {
  const headersLower = {}
  for (const k of Object.keys(headers)) headersLower[k.toLowerCase()] = headers[k]
  const req = { headers: headersLower }
  let statusCode = null
  let body = null
  const res = {
    writeHead: (s, h) => {
      statusCode = s
      res._headers = h
    },
    end: (b) => {
      body = b
    },
    _status: () => statusCode,
    _body: () => body
  }
  let nextCalled = false
  const next = () => {
    nextCalled = true
  }
  return { req, res, next, nextCalled: () => nextCalled }
}

describe('authMiddleware', () => {
  const originalToken = process.env.MOMAI_SESSION_TOKEN

  beforeEach(() => {
    process.env.MOMAI_SESSION_TOKEN = 'test-token-abc123'
  })

  it('calls next() when Authorization header matches', () => {
    const { req, res, next, nextCalled } = makeReqRes({
      authorization: 'Bearer test-token-abc123'
    })
    authMiddleware(req, res, next)
    expect(nextCalled()).toBe(true)
  })

  it('returns 401 when Authorization header is missing', () => {
    const { req, res, next, nextCalled } = makeReqRes({})
    authMiddleware(req, res, next)
    expect(res._status()).toBe(401)
    expect(nextCalled()).toBe(false)
  })

  it('returns 401 when Authorization header is wrong', () => {
    const { req, res, next, nextCalled } = makeReqRes({
      authorization: 'Bearer wrong-token'
    })
    authMiddleware(req, res, next)
    expect(res._status()).toBe(401)
    expect(nextCalled()).toBe(false)
  })

  it('returns 500 when MOMAI_SESSION_TOKEN is not set', () => {
    delete process.env.MOMAI_SESSION_TOKEN
    const { req, res, next, nextCalled } = makeReqRes({
      authorization: 'Bearer whatever'
    })
    authMiddleware(req, res, next)
    expect(res._status()).toBe(500)
    expect(nextCalled()).toBe(false)
    if (originalToken === undefined) {
      delete process.env.MOMAI_SESSION_TOKEN
    } else {
      process.env.MOMAI_SESSION_TOKEN = originalToken
    }
  })
})
