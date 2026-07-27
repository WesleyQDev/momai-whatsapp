/**
 * Extension Health Check Service
 * 
 * Monitors persistent extension workers via heartbeat.
 * Auto-restarts crashed workers up to 3 times.
 * Marks extension as worker_crashed if restart limit exceeded.
 */
class ExtensionHealthCheck {
  constructor(extensionHostManager, store) {
    this.extensionHostManager = extensionHostManager
    this.store = store
    this.heartbeats = new Map() // extId -> { lastSeen, restarts, skillPath, manifest }
    this.interval = null
    this.HEARTBEAT_TIMEOUT = 90000 // 3 missed pings at 30s = 90s
    this.MAX_RESTARTS = 3
  }

  start() {
    if (this.interval) return
    this.interval = setInterval(() => this._check(), 15000)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.heartbeats.clear()
  }

  /**
   * Register a worker's initial heartbeat at start time.
   */
  register(extId, skillPath, manifest) {
    this.heartbeats.set(extId, {
      lastSeen: Date.now(),
      restarts: 0,
      skillPath,
      manifest
    })
  }

  /**
   * Called when a worker exits (crash or intentional stop).
   */
  unregister(extId) {
    this.heartbeats.delete(extId)
  }

  /**
   * Called when the worker sends a heartbeat ping.
   */
  recordHeartbeat(extId) {
    const record = this.heartbeats.get(extId)
    if (record) {
      record.lastSeen = Date.now()
    }

    if (this.store && this.store.extensions) {
      const entry = this.store.extensions.find(e => e.id === extId)
      if (entry && entry.worker_crashed) {
        entry.worker_crashed = false
      }
    }
  }

  /**
   * Called when a worker process exits unexpectedly.
   */
  recordCrash(extId) {
    const record = this.heartbeats.get(extId)
    if (!record) return

    record.restarts++

    if (record.restarts <= this.MAX_RESTARTS) {
      console.log(`[health] Worker ${extId} crashed (${record.restarts}/${this.MAX_RESTARTS}), restarting...`)
      this.heartbeats.set(extId, {
        ...record,
        lastSeen: Date.now()
      })
      this.extensionHostManager.startPersistent(extId, record.skillPath, record.manifest).catch(() => {})
    } else {
      console.log(`[health] Worker ${extId} exceeded max restarts (${this.MAX_RESTARTS}), marking as crashed`)
      if (this.store && this.store.extensions) {
        const entry = this.store.extensions.find(e => e.id === extId)
        if (entry) entry.worker_crashed = true
      }
      this.heartbeats.delete(extId)
    }
  }

  _check() {
    const now = Date.now()
    for (const [extId, record] of this.heartbeats) {
      if (now - record.lastSeen > this.HEARTBEAT_TIMEOUT) {
        console.log(`[health] Worker ${extId} heartbeat timeout (last seen ${new Date(record.lastSeen).toISOString()})`)
        this.recordCrash(extId)
      }
    }
  }
}

module.exports = { ExtensionHealthCheck }
