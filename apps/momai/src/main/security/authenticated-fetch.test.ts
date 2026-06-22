import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { getOrCreateSessionToken, resetSessionTokenForTesting } from './session-token'
import { authFetch } from './authenticated-fetch'

let server: Server
let baseUrl: string
let lastAuthHeader: string | undefined
let lastMethod: string | undefined
let lastBody: string | undefined
let lastContentType: string | undefined

beforeEach(async () => {
  resetSessionTokenForTesting()
  lastAuthHeader = undefined
  lastMethod = undefined
  lastBody = undefined
  lastContentType = undefined

  server = createServer((req, res) => {
    lastAuthHeader = req.headers['authorization']
    lastMethod = req.method
    lastContentType = req.headers['content-type']
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      lastBody = raw
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  vi.restoreAllMocks()
})

describe('authFetch', () => {
  it('adds Authorization header with the current session token', async () => {
    const token = getOrCreateSessionToken()
    const response = await authFetch(`${baseUrl}/anything`)
    expect(response.ok).toBe(true)
    expect(lastAuthHeader).toBe(`Bearer ${token}`)
  })

  it('forwards the HTTP method to the underlying request', async () => {
    await authFetch(`${baseUrl}/anything`, { method: 'POST' })
    expect(lastMethod).toBe('POST')
  })

  it('forwards JSON body and Content-Type header', async () => {
    const payload = { hello: 'world' }
    await authFetch(`${baseUrl}/anything`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    expect(lastContentType).toBe('application/json')
    expect(JSON.parse(lastBody || '{}')).toEqual(payload)
  })

  it('returns the underlying Response unchanged', async () => {
    const response = await authFetch(`${baseUrl}/anything`)
    const data = await response.json()
    expect(data).toEqual({ ok: true })
  })

  it('uses the current token even if it changes between calls', async () => {
    const firstToken = getOrCreateSessionToken()
    await authFetch(`${baseUrl}/first`)
    const headerAfterFirst = lastAuthHeader
    expect(headerAfterFirst).toBe(`Bearer ${firstToken}`)

    resetSessionTokenForTesting()
    const secondToken = getOrCreateSessionToken()
    expect(secondToken).not.toBe(firstToken)
    await authFetch(`${baseUrl}/second`)
    expect(lastAuthHeader).toBe(`Bearer ${secondToken}`)
  })
})
