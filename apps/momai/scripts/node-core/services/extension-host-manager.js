/**
 * MomAI Extension Host Manager
 *
 * Manages isolated processes for running extensions.
 */

const { fork } = require('node:child_process')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const extensionEvents = require('./extension-events')

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
    return fork(hostPath, [skillId, skillPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, MOMAI_EXTENSION_ID: skillId, ...extraEnv }
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

    const child = this._spawnHost(skillId, skillPath, { MOMAI_PERSISTENT: 'true' })
    const entry = { child, skillId, manifest, startedAt: Date.now() }
    this.persistentHosts.set(skillId, entry)

    child.on('message', (msg) => {
      switch (msg.type) {
        case 'ready':
          this.emit(`${skillId}:ready`)
          break
        case 'event':
          extensionEvents.broadcast(msg.eventType, msg.data || {})
          break
        case 'structured_response':
          extensionEvents.broadcast('structured_response', { skillId, ...msg.data })
          break
        case 'response':
          this._resolvePending(msg.requestId, msg.result)
          break
        case 'log':
          console.log(`[ext:${skillId}]`, msg.message)
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

      const count = (this.restartCounts.get(skillId) || 0) + 1
      this.restartCounts.set(skillId, count)

      const entry = this.persistentHosts.get(skillId)
      const ranLongEnough = entry && (Date.now() - entry.startedAt) > 60000

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
      child.send({ type: 'execute', requestId, payload })
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
    return this._sendRequest(entry.child, message)
  }

  stopPersistent(skillId) {
    const entry = this.persistentHosts.get(skillId)
    if (!entry) return
    entry.child.kill()
    this.persistentHosts.delete(skillId)
    this.restartCounts.delete(skillId)
  }

  stopAllPersistent() {
    for (const id of this.persistentHosts.keys()) {
      this.stopPersistent(id)
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
