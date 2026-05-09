/**
 * MomAI Extension Host Manager
 *
 * Manages isolated processes for running extensions.
 */

const { fork } = require('node:child_process')
const path = require('node:path')
const { EventEmitter } = require('node:events')

class ExtensionHostManager extends EventEmitter {
  constructor() {
    super()
    this.hosts = new Map() // skillId -> { process, ready }
    this.pendingCalls = new Map() // requestId -> { resolve, reject }
    this.requestIdCounter = 0
  }

  /**
   * Spawns or returns an existing host for a skill
   */
  async getHost(skillId, skillPath, manifest) {
    if (this.hosts.has(skillId)) {
      return this.hosts.get(skillId)
    }

    const hostPath = path.join(__dirname, 'extension-host-worker.js')
    const child = fork(hostPath, [skillId, skillPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, MOMAI_EXTENSION_ID: skillId }
    })

    const hostRecord = {
      process: child,
      ready: false,
      manifest
    }
    this.hosts.set(skillId, hostRecord)

    child.on('message', (msg) => {
      if (msg.type === 'ready') {
        hostRecord.ready = true
        this.emit(`ready:${skillId}`)
      } else if (msg.type === 'response') {
        const pending = this.pendingCalls.get(msg.requestId)
        if (pending) {
          this.pendingCalls.delete(msg.requestId)
          pending.resolve(msg.result)
        }
      } else if (msg.type === 'log') {
        console.log(`[ext:${skillId}] ${msg.message}`)
      }
    })

    child.on('exit', (code) => {
      console.log(`[ext:${skillId}] Host exited with code ${code}`)
      this.hosts.delete(skillId)
    })

    // Wait for ready signal
    await new Promise((resolve) => {
      if (hostRecord.ready) resolve()
      else this.once(`ready:${skillId}`, resolve)
    })

    return hostRecord
  }

  /**
   * Executes a command on the extension host
   */
  async execute(skillId, skillPath, payload) {
    const host = await this.getHost(skillId, skillPath, payload.manifest)
    const requestId = ++this.requestIdCounter

    return new Promise((resolve, reject) => {
      this.pendingCalls.set(requestId, { resolve, reject })

      host.process.send({
        type: 'execute',
        requestId,
        payload
      })

      // Timeout safety
      setTimeout(() => {
        if (this.pendingCalls.has(requestId)) {
          this.pendingCalls.delete(requestId)
          reject(new Error('Extension execution timeout'))
        }
      }, 30000) // 30s default
    })
  }

  /**
   * Terminates a host
   */
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
  }
}

// Singleton instance
const instance = new ExtensionHostManager()
module.exports = instance
