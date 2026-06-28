const { isOriginAllowed } = require('../config/cors.js')
const { getSessionToken } = require('../config/security')

function corsHeaders(req) {
  const origin = req && req.headers ? req.headers['origin'] : undefined
  return {
    'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(res.req)
  })
  res.end(JSON.stringify(payload))
}

function sendNoContent(res) {
  res.writeHead(204, corsHeaders(res.req))
  res.end()
}

function sendSseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...corsHeaders(res.req)
  })
}

function writeSse(res, payload) {
  if (res.destroyed || res.writableEnded) return false
  const chunk = `data: ${JSON.stringify(payload)}\n\n`
  const canContinue = res.write(chunk)
  if (!canContinue) {
    return new Promise((resolve) => {
      res.once('drain', () => resolve(true))
    })
  }
  return true
}

function endSse(res) {
  if (!res.destroyed && !res.writableEnded) {
    res.end()
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > 3 * 1024 * 1024) {
        reject(new Error('Payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      if (!body) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sidecarHeaders(extra) {
  const token = getSessionToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  }
}

module.exports = {
  corsHeaders,
  sendJson,
  sendNoContent,
  sendSseHeaders,
  writeSse,
  endSse,
  readJsonBody,
  sidecarHeaders
}
