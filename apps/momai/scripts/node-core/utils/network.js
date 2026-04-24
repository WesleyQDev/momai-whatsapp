const net = require('node:net')
const { LLAMA_HOST, LLAMA_PORT } = require('../config/constants')
const { portReservations } = require('../infrastructure/process-manager')

function checkPortAvailable(port, host = LLAMA_HOST) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => {
      resolve(false)
    })
    server.listen({ port, host }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function pickAvailablePort(preferredPort, maxAttempts = 20) {
  const base = Number(preferredPort || LLAMA_PORT)
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = base + i
    if (portReservations.has(candidate)) continue
    // eslint-disable-next-line no-await-in-loop
    const available = await checkPortAvailable(candidate)
    if (available) {
      portReservations.add(candidate)
      return candidate
    }
  }
  return base
}

function withTimeout(promise, timeoutMs, timeoutReason) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutReason)), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

module.exports = {
  checkPortAvailable,
  pickAvailablePort,
  withTimeout
}
