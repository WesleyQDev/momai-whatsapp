/**
 * MomAI Extension Host Manager
 *
 * Manages isolated processes for running extensions.
 */

const { fork } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const { EventEmitter } = require('node:events')
const extensionEvents = require('./extension-events')

// Secure-storage bridge: forward safeStorage requests from extension workers
// to the Electron main process, which holds the OS keychain handle.
//
// Flow: worker → host (this file) → main (coreManager.ts) → safeStorage → back.
// We translate the worker's requestId to a host-local id so multiple workers
// can have concurrent in-flight requests without colliding.
const secureStoragePending = new Map() // hostRequestId → { child, workerRequestId, type }
let secureStorageNextId = 1
const SECURE_STORAGE_FORWARD_TIMEOUT_MS = 7000

if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return
    if (
      msg.type === 'secure-storage:encrypt-result' ||
      msg.type === 'secure-storage:decrypt-result'
    ) {
      const entry = secureStoragePending.get(msg.requestId)
      if (!entry) return
      secureStoragePending.delete(msg.requestId)
      clearTimeout(entry.timeout)
      try {
        entry.child.send({
          type: msg.type,
          requestId: entry.workerRequestId,
          ack: msg.ack || null
        })
      } catch {
        // worker may have died; nothing we can do
      }
    }
  })
}

function _forwardSecureStorageRequest(child, msg) {
  // No main process IPC (e.g. running standalone for tests) — fail fast.
  if (typeof process === 'undefined' || typeof process.send !== 'function') {
    try {
      child.send({ type: `${msg.type}-result`, requestId: msg.requestId, ack: null })
    } catch {}
    return
  }
  const hostRequestId = `sstorage-${secureStorageNextId++}-${Date.now()}`
  const timeout = setTimeout(() => {
    const entry = secureStoragePending.get(hostRequestId)
    if (!entry) return
    secureStoragePending.delete(hostRequestId)
    try {
      entry.child.send({
        type: `${entry.type}-result`,
        requestId: entry.workerRequestId,
        ack: null
      })
    } catch {}
  }, SECURE_STORAGE_FORWARD_TIMEOUT_MS)
  secureStoragePending.set(hostRequestId, {
    child,
    workerRequestId: msg.requestId,
    type: msg.type,
    timeout
  })
  try {
    process.send({ type: msg.type, requestId: hostRequestId, payload: msg.payload })
  } catch {
    secureStoragePending.delete(hostRequestId)
    clearTimeout(timeout)
    try {
      child.send({ type: `${msg.type}-result`, requestId: msg.requestId, ack: null })
    } catch {}
  }
}

const SAFE_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  SystemRoot: process.env.SystemRoot,
  WINDIR: process.env.WINDIR,
  APPDATA: process.env.APPDATA,
  LOCALAPPDATA: process.env.LOCALAPPDATA,
  TMP: process.env.TMP,
  TEMP: process.env.TEMP,
  NODE_PATH: process.env.NODE_PATH,
  ELECTRON_RUN_AS_NODE: '1'
}

function findAllNodeModules() {
  const found = []
  let dir = path.resolve(__dirname)
  for (let i = 0; i < 20; i++) {
    dir = path.dirname(dir)
    const nm = path.join(dir, 'node_modules')
    if (fs.existsSync(nm)) found.push(nm)
    if (path.dirname(dir) === dir) break
  }
  try {
    if (process.resourcesPath) {
      const asarNm = path.join(process.resourcesPath, 'app.asar', 'node_modules')
      if (fs.existsSync(asarNm)) found.push(asarNm)
      const unpackedNm = path.join(process.resourcesPath, 'app', 'node_modules')
      if (fs.existsSync(unpackedNm)) found.push(unpackedNm)
    }
  } catch {}
  return [...new Set(found.reverse())]
}

class ExtensionHostManager extends EventEmitter {
  constructor() {
    super()
    this.hosts = new Map()
    this.persistentHosts = new Map()
    this.pendingCalls = new Map()
    this.pendingReady = new Map()
    this.restartCounts = new Map()
    this.requestIdCounter = 0
  }

  _spawnHost(skillId, skillPath, extraEnv) {
    const hostPath = path.join(__dirname, 'extension-host-worker.js')
    const extNodeModules = path.join(skillPath, 'node_modules')
    const nmPaths = findAllNodeModules()
    const allPaths = [extNodeModules, ...nmPaths].filter(fs.existsSync)
    const nodePath = allPaths.join(path.delimiter)

    return fork(hostPath, [skillId, skillPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...SAFE_ENV,
        NODE_PATH: nodePath,
        MOMAI_DATA_DIR: process.env.MOMAI_DATA_DIR,
        MOMAI_EXTENSION_ID: skillId,
        ...extraEnv
      }
    })
  }

  async getHost(skillId, skillPath, manifest) {
    if (this.hosts.has(skillId)) {
      return this.hosts.get(skillId)
    }

    const child = this._spawnHost(skillId, skillPath)

    const hostRecord = { process: child, ready: false, manifest }
    this.hosts.set(skillId, hostRecord)

    child.on('message', (msg) => {
      if (msg.type === 'ready') {
        hostRecord.ready = true
        this.emit(`ready:${skillId}`)
      } else if (msg.type === 'response') {
        this._resolvePending(msg.requestId, msg.result)
      } else if (msg.type === 'log') {
        console.log(`[ext:${skillId}] ${msg.message}`)
      } else if (msg.type === 'secure-storage:encrypt' || msg.type === 'secure-storage:decrypt') {
        _forwardSecureStorageRequest(child, msg)
      }
    })

    child.on('exit', (code) => {
      console.log(`[ext:${skillId}] Host exited with code ${code}`)
      this.hosts.delete(skillId)
    })

    await new Promise((resolve) => {
      if (hostRecord.ready) resolve()
      else this.once(`ready:${skillId}`, resolve)
    })

    return hostRecord
  }

  async execute(skillId, skillPath, payload) {
    const host = await this.getHost(skillId, skillPath, payload.manifest)
    return this._sendRequest(host.process, payload)
  }

  async startPersistent(skillId, skillPath, manifest) {
    if (this.persistentHosts.has(skillId)) return

    const bgScript = manifest.backgroundScript || 'runtime.js'
    const hostPath = path.join(skillPath, bgScript)

    // Prevent path traversal via untrusted manifest.backgroundScript
    const resolvedBase = path.resolve(skillPath)
    const resolvedScript = path.resolve(skillPath, bgScript)
    if (!resolvedScript.startsWith(resolvedBase + path.sep) && resolvedScript !== resolvedBase) {
      throw new Error('backgroundScript path escapes extension directory')
    }
    const dataDir = process.env.MOMAI_NODE_CORE_DATA_DIR || process.env.MOMAI_DATA_DIR || ''

    const extNodeModules = path.join(skillPath, 'node_modules')
    const nmPaths = findAllNodeModules()
    const allPaths = [extNodeModules, ...nmPaths].filter(fs.existsSync)
    const nodePath = allPaths.join(path.delimiter)

    const child = fork(hostPath, [skillId, skillPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...SAFE_ENV,
        MOMAI_EXTENSION_ID: skillId,
        MOMAI_PERSISTENT: 'true',
        NODE_PATH: nodePath,
        ...(dataDir ? { MOMAI_DATA_DIR: dataDir, MOMAI_NODE_CORE_DATA_DIR: dataDir } : {})
      }
    })

    child.stderr.on('data', (data) => {
      console.error(`[ext:${skillId}:stderr]`, data.toString())
    })
    const entry = { child, skillId, manifest, startedAt: Date.now() }
    this.persistentHosts.set(skillId, entry)

    child.on('message', (msg) => {
      switch (msg.type) {
        case 'ready':
          this.emit(`${skillId}:ready`)
          break
        case 'event':
          if (typeof msg.eventType === 'string' && msg.eventType.length > 0) {
            extensionEvents.broadcast(msg.eventType, typeof msg.data === 'object' && msg.data !== null ? msg.data : {})
          }
          break
        case 'structured_response':
          if (msg.data && typeof msg.data.type === 'string') {
            extensionEvents.broadcast('structured_response', { skillId, ...msg.data })
          }
          break
        case 'response':
          this._resolvePending(msg.requestId, msg.result)
          break
        case 'log':
          console.log(`[ext:${skillId}]`, msg.message)
          break
        case 'secure-storage:encrypt':
        case 'secure-storage:decrypt':
          _forwardSecureStorageRequest(child, msg)
          break
      }
    })

    child.on('exit', (code) => {
      // Reject pending ready promise if worker died before becoming ready
      const pendingReject = this.pendingReady.get(skillId)
      if (pendingReject) {
        this.pendingReady.delete(skillId)
        pendingReject(new Error(`Worker exited with code ${code} before ready`))
      }

      // Reject all pending calls — the worker process is gone
      for (const [reqId, pending] of this.pendingCalls) {
        pending.reject(new Error(`Extension host ${skillId} exited unexpectedly (code ${code})`))
        this.pendingCalls.delete(reqId)
      }

      const count = (this.restartCounts.get(skillId) || 0) + 1
      this.restartCounts.set(skillId, count)

      const entry = this.persistentHosts.get(skillId)
      const ranLongEnough = entry && Date.now() - entry.startedAt > 60000

      this.persistentHosts.delete(skillId)

      if (count <= 3 && ranLongEnough) {
        const delay = Math.min(1000 * Math.pow(3, count - 1), 5000)
        setTimeout(() => this.startPersistent(skillId, skillPath, manifest), delay)
      } else {
        this.emit(`${skillId}:crashed`, { code, restartCount: count })
      }
    })

    return new Promise((resolve, reject) => {
      this.pendingReady.set(skillId, reject)
      const timeout = setTimeout(() => {
        this.pendingReady.delete(skillId)
        reject(new Error('Worker ready timeout'))
      }, 15000)
      this.once(`${skillId}:ready`, () => {
        this.pendingReady.delete(skillId)
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  _resolvePending(requestId, result) {
    const pending = this.pendingCalls.get(requestId)
    if (pending) {
      this.pendingCalls.delete(requestId)
      pending.resolve(result)
    }
  }

  _sendRequest(child, payload) {
    const requestId = ++this.requestIdCounter
    return new Promise((resolve, reject) => {
      this.pendingCalls.set(requestId, { resolve, reject })
      try {
        child.send({ type: 'execute', requestId, payload })
      } catch (err) {
        this.pendingCalls.delete(requestId)
        reject(new Error('Extension host is not available'))
        return
      }
      setTimeout(() => {
        if (this.pendingCalls.has(requestId)) {
          this.pendingCalls.delete(requestId)
          reject(new Error('Extension execution timeout'))
        }
      }, 30000)
    })
  }

  async sendToPersistent(skillId, message) {
    const entry = this.persistentHosts.get(skillId)
    if (!entry) throw new Error(`No persistent host for ${skillId}`)
    if (entry.child.killed || !entry.child.connected) {
      throw new Error(`Extension host ${skillId} is not connected`)
    }
    return this._sendRequest(entry.child, message)
  }

  stopPersistent(skillId) {
    const entry = this.persistentHosts.get(skillId)
    if (!entry) return Promise.resolve()
    const { child } = entry
    this.persistentHosts.delete(skillId)
    this.restartCounts.delete(skillId)
    try {
      child.send({ type: 'shutdown' })
    } catch {}
    const childRef = child
    return new Promise((resolve) => {
      const done = () => {
        childRef.removeListener('exit', done)
        resolve()
      }
      childRef.on('exit', done)
      // Give the worker enough headroom to finish an in-flight tool
      // (e.g. flush_credentials → reEncryptCredsAfterBaileys IPC roundtrip
      // to main for safeStorage) and then run its own shutdown handler
      // (re-encrypt + flush history). Without this margin, the SIGKILL
      // fallback below kills the worker mid-encrypt and the next launch
      // finds a stale .enc on disk.
      setTimeout(() => {
        try {
          if (!childRef.killed) childRef.kill()
        } catch {}
        done()
      }, 5000)
    })
  }

  async stopAllPersistent() {
    for (const id of [...this.persistentHosts.keys()]) {
      await this.stopPersistent(id)
    }
  }

  terminate(skillId) {
    const host = this.hosts.get(skillId)
    if (host) {
      host.process.kill()
      this.hosts.delete(skillId)
    }
  }

  terminateAll() {
    for (const skillId of this.hosts.keys()) {
      this.terminate(skillId)
    }
    this.stopAllPersistent()
  }
}

// Singleton instance
const instance = new ExtensionHostManager()
module.exports = instance
module.exports.SAFE_ENV = SAFE_ENV
