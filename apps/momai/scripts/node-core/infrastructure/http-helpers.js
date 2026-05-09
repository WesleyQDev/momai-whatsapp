function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  })
  res.end(JSON.stringify(payload))
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  })
  res.end()
}

function sendSseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
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
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 3 * 1024 * 1024) reject(new Error('Payload too large'))
    })
    req.on('end', () => {
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

module.exports = {
  sendJson,
  sendNoContent,
  sendSseHeaders,
  writeSse,
  endSse,
  readJsonBody
}
