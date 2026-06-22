const encryptPending = new Map()
const decryptPending = new Map()
let msgId = 0
let installed = false

function ensureHandlerInstalled() {
  if (installed) return
  if (typeof process.send !== 'function' || typeof process.on !== 'function') {
    installed = true
    return
  }
  process.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'keychain:encrypt-result' && msg.requestId) {
      const pending = encryptPending.get(msg.requestId)
      if (!pending) return
      encryptPending.delete(msg.requestId)
      clearTimeout(pending.timer)
      if (msg.ok) pending.resolve(msg.payload)
      else pending.reject(new Error(msg.error || 'keychain encrypt failed'))
      return
    }
    if (msg.type === 'keychain:decrypt-result' && msg.requestId) {
      const pending = decryptPending.get(msg.requestId)
      if (!pending) return
      decryptPending.delete(msg.requestId)
      clearTimeout(pending.timer)
      if (msg.ok) pending.resolve(msg.payload)
      else pending.reject(new Error(msg.error || 'keychain decrypt failed'))
    }
  })
  installed = true
}

function nextRequestId(prefix) {
  msgId += 1
  return `${prefix}-${msgId}-${Date.now()}`
}

function isAvailable() {
  return typeof process.send === 'function'
}

async function callMain(type, payload, timeoutMs = 5000) {
  ensureHandlerInstalled()
  if (!isAvailable()) {
    throw new Error('OS keychain is not available: no IPC to main process')
  }
  const requestId = nextRequestId(type)
  const isEncrypt = type === 'keychain:encrypt'
  const target = isEncrypt ? encryptPending : decryptPending
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.delete(requestId)
      reject(new Error(`${type} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    target.set(requestId, { resolve, reject, timer })
  })
  process.send({ type, requestId, payload })
  return promise
}

async function encryptForStorage(plain) {
  if (typeof plain !== 'string' || plain === '') return ''
  return callMain('keychain:encrypt', plain)
}

async function decryptFromStorage(encryptedB64) {
  if (typeof encryptedB64 !== 'string' || encryptedB64 === '') return ''
  return callMain('keychain:decrypt', encryptedB64)
}

module.exports = {
  isAvailable,
  encryptForStorage,
  decryptFromStorage
}
