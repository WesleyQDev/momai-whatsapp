const { writeSse } = require('../../infrastructure/http-helpers')

async function sseWrite(res, data) {
  const result = writeSse(res, data)
  if (result instanceof Promise) await result
  return result
}

module.exports = { sseWrite }
