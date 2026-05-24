const { sendSseHeaders, writeSse } = require('../infrastructure/http-helpers')

const clients = new Set()

function addClient(res) {
  sendSseHeaders(res)
  clients.add(res)
  res.on('close', () => {
    clients.delete(res)
  })
}

function broadcast(eventType, data) {
  const payload = { type: 'extension_event', eventType, data }
  for (const client of clients) {
    if (!writeSse(client, payload)) {
      clients.delete(client)
    }
  }
}

function getClientCount() {
  return clients.size
}

module.exports = { addClient, broadcast, getClientCount }
