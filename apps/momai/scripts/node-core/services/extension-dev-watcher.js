/**
 * Extension Dev Watcher
 *
 * Watches the extensions-dev/ directory for file changes using fs.watch().
 * When a main.js or manifest.json changes, emits an SSE event to the
 * renderer to hot-reload that extension while preserving storage state.
 *
 * When a new folder appears or an existing one is removed, triggers a
 * full registry reload.
 */

const fs = require('node:fs')
const path = require('node:path')
const { getExtensionsDevPath } = require('../../skills/extensions-dev-path')

class ExtensionDevWatcher {
  constructor(skillRegistry, extensionEvents, dataDir) {
    this.skillRegistry = skillRegistry
    this.extensionEvents = extensionEvents
    this.dataDir = dataDir
    this.extensionsDevPath = getExtensionsDevPath(dataDir)
    this.watcher = null
    this.watchedFolders = new Map()
    this.isReady = false
    this.debounceTimers = new Map()
  }

  start() {
    if (this.watcher) return

    if (!fs.existsSync(this.extensionsDevPath)) {
      fs.mkdirSync(this.extensionsDevPath, { recursive: true })
    }

    console.log(`[dev-watcher] Watching extensions-dev: ${this.extensionsDevPath}`)

    this.watcher = fs.watch(this.extensionsDevPath, { recursive: false }, (eventType, filename) => {
      if (!filename) return
      this._handleDirectoryChange(eventType, filename)
    })

    this._scanAndWatchFolders()

    this.isReady = true
  }

  stop() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    for (const [, childWatcher] of this.watchedFolders) {
      childWatcher.close()
    }
    this.watchedFolders.clear()
    for (const [key, timer] of this.debounceTimers) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.isReady = false
  }

  _scanAndWatchFolders() {
    if (!fs.existsSync(this.extensionsDevPath)) return

    try {
      const entries = fs.readdirSync(this.extensionsDevPath)
      for (const name of entries) {
        const dir = path.join(this.extensionsDevPath, name)
        const stat = fs.statSync(dir, { throwIfNoEntry: false })
        if (stat && stat.isDirectory()) {
          this._watchFolder(name, dir)
        }
      }
    } catch (err) {
      console.error(`[dev-watcher] Error scanning folders:`, err.message)
    }
  }

  _watchFolder(extId, folderPath) {
    if (this.watchedFolders.has(extId)) return

    try {
      const childWatcher = fs.watch(folderPath, { recursive: false }, (eventType, filename) => {
        if (!filename) return
        this._handleFileChange(extId, eventType, filename)
      })
      this.watchedFolders.set(extId, childWatcher)
      console.log(`[dev-watcher] Watching folder: ${extId}`)
    } catch (err) {
      console.error(`[dev-watcher] Error watching folder ${extId}:`, err.message)
    }
  }

  _handleDirectoryChange(eventType, filename) {
    const fullPath = path.join(this.extensionsDevPath, filename)

    const debounceKey = `dir:${filename}`
    if (this.debounceTimers.has(debounceKey)) {
      clearTimeout(this.debounceTimers.get(debounceKey))
    }

    this.debounceTimers.set(debounceKey, setTimeout(() => {
      this.debounceTimers.delete(debounceKey)

      try {
        const stat = fs.statSync(fullPath, { throwIfNoEntry: false })
        const exists = stat && stat.isDirectory()

        if (exists) {
          this._watchFolder(filename, fullPath)
          console.log(`[dev-watcher] New extension folder detected: ${filename}`)
          this._reloadRegistry()
        } else {
          if (this.watchedFolders.has(filename)) {
            this.watchedFolders.get(filename).close()
            this.watchedFolders.delete(filename)
            console.log(`[dev-watcher] Extension folder removed: ${filename}`)
            this._reloadRegistry()
          }
        }
      } catch {
        if (this.watchedFolders.has(filename)) {
          this.watchedFolders.get(filename).close()
          this.watchedFolders.delete(filename)
          this._reloadRegistry()
        }
      }
    }, 200))
  }

  _handleFileChange(extId, eventType, filename) {
    const basename = path.basename(filename || '')
    if (basename !== 'main.js' && basename !== 'manifest.json' && basename !== 'styles.css') {
      return
    }

    const debounceKey = `file:${extId}`
    if (this.debounceTimers.has(debounceKey)) {
      clearTimeout(this.debounceTimers.get(debounceKey))
    }

    this.debounceTimers.set(debounceKey, setTimeout(() => {
      this.debounceTimers.delete(debounceKey)
      console.log(`[dev-watcher] ${basename} changed for ${extId}, emitting hot-reload event`)

      this._reloadRegistry()

      if (this.extensionEvents && typeof this.extensionEvents.broadcast === 'function') {
        this.extensionEvents.broadcast('dev_extension_reload', {
          extId,
          file: basename,
          timestamp: Date.now()
        })
      }
    }, 150))
  }

  async _reloadRegistry() {
    try {
      await this.skillRegistry.loadExtensions()
      const { invalidateExtensionsPayloadCache } = require('../api/routes/extensions.routes')
      if (typeof invalidateExtensionsPayloadCache === 'function') {
        invalidateExtensionsPayloadCache()
      }
    } catch (err) {
      console.error(`[dev-watcher] Error reloading registry:`, err.message)
    }
  }

  async triggerReload(extId) {
    console.log(`[dev-watcher] CLI triggered reload for ${extId}`)

    await this._reloadRegistry()

    if (this.extensionEvents && typeof this.extensionEvents.broadcast === 'function') {
      this.extensionEvents.broadcast('dev_extension_reload', {
        extId,
        file: 'main.js',
        timestamp: Date.now(),
        source: 'cli'
      })
    }
  }
}

module.exports = { ExtensionDevWatcher }
