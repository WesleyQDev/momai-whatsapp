const { sendSseHeaders, writeSse } = require('../infrastructure/http-helpers')

const clients = new Set()
const lastEventByType = new Map()
const KEEPALIVE_INTERVAL_MS = 15000

function addClient(res) {
  sendSseHeaders(res)
  clients.add(res)
  for (const [, payload] of lastEventByType) {
    if (!writeSse(res, payload)) {
      clients.delete(res)
      return
    }
  }
  res.on('close', () => {
    clients.delete(res)
  })
  res.on('error', () => {
    clients.delete(res)
  })
}

function broadcast(eventType, data) {
  const payload = { type: 'extension_event', eventType, data }
  lastEventByType.set(eventType, payload)
  for (const client of clients) {
    if (!writeSse(client, payload)) {
      clients.delete(client)
    }
  }
}

setInterval(() => {
  for (const client of clients) {
    try {
      client.write(': keepalive\n\n')
    } catch {
      clients.delete(client)
    }
  }
}, KEEPALIVE_INTERVAL_MS).unref()

function getClientCount() {
  return clients.size
}

module.exports = { addClient, broadcast, getClientCount }
