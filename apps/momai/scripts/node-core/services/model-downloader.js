const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const { store, modelDownloadState } = require('./shared-state')
const { isoNow } = require('../utils/time')
const { debug, info, warn } = require('../infrastructure/logger')
const { MODELS_DIR, MODEL_DOWNLOAD_TIMEOUT_MS } = require('../config/constants')

const { setInitStatus } = require('./llama-manager')

const modelDownloadPromises = new Map()

function setModelDownloadState(partial) {
  Object.assign(modelDownloadState, partial, { updated_at: isoNow() })
}

function resolveTierModelUrl(tierName, tierConfig) {
  const modelFile = String(tierConfig?.file || '').trim()
  if (!modelFile) return null

  const explicitUrl = String(tierConfig?.download_url || '').trim()
  if (explicitUrl) return explicitUrl

  const explicitBase = String(tierConfig?.download_base_url || '').trim()
  if (explicitBase) {
    const sep = explicitBase.includes('?') ? '&' : '?'
    return `${explicitBase.replace(/\/+$/, '')}/${encodeURIComponent(modelFile)}${sep}download=1`
  }

  const repo = String(tierConfig?.repo || '').trim()
  if (!repo) return null
  return `https://huggingface.co/${repo}/resolve/main/${encodeURIComponent(modelFile)}?download=1`
}

function downloadToFile(url, targetPath, onProgress) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const request = https.get(url, (response) => {
      const status = Number(response.statusCode || 0)
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location
        response.resume()
        if (!location) {
          reject(new Error(`Redirect without location for ${url}`))
          return
        }
        resolve(downloadToFile(location, targetPath, onProgress))
        return
      }

      if (status < 200 || status >= 300) {
        response.resume()
        reject(new Error(`Model download failed with HTTP ${status}`))
        return
      }

      const totalBytesRaw = Number(response.headers['content-length'] || 0)
      const totalBytes = Number.isFinite(totalBytesRaw) && totalBytesRaw > 0 ? totalBytesRaw : null
      let received = 0
      let lastProgressUpdate = 0
      const tmpPath = `${targetPath}.partial`
      const output = fs.createWriteStream(tmpPath)

      const fail = (error) => {
        try {
          output.close()
        } catch {}
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        } catch {}
        reject(error)
      }

      output.on('error', fail)
      response.on('error', fail)

      // Use a custom stream to track progress without firing events for every chunk
      const { Transform } = require('node:stream')
      const progressTracker = new Transform({
        transform(chunk, encoding, callback) {
          received += chunk.length
          const now = Date.now()
          if (now - lastProgressUpdate > 500) {
            onProgress({ received, total: totalBytes, elapsedMs: now - startedAt })
            lastProgressUpdate = now
          }
          callback(null, chunk)
        },
        flush(callback) {
          onProgress({ received, total: totalBytes, elapsedMs: Date.now() - startedAt })
          callback()
        }
      })

      response.pipe(progressTracker).pipe(output)
      output.on('finish', () => {
        output.close(() => {
          try {
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)
            fs.renameSync(tmpPath, targetPath)
            resolve(true)
          } catch (error) {
            fail(error)
          }
        })
      })
    })

    request.setTimeout(MODEL_DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error(`Model download timeout after ${MODEL_DOWNLOAD_TIMEOUT_MS}ms`))
    })
    request.on('error', reject)
  })
}

async function ensureTierModelAvailable(tierName, tierConfig, reportProgress = true) {
  const configuredFile = String(tierConfig?.file || '').trim()
  if (!configuredFile) {
    return { ok: false, reason: `Tier "${tierName}" has no configured model file.` }
  }

  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true })
  }
  const targetPath = path.join(MODELS_DIR, configuredFile)
  if (fs.existsSync(targetPath)) {
    return { ok: true, path: targetPath, downloaded: false }
  }

  if (modelDownloadPromises.has(configuredFile)) {
    return modelDownloadPromises.get(configuredFile)
  }

  const promise = (async () => {
    const url = resolveTierModelUrl(tierName, tierConfig)
    if (!url) {
      return {
        ok: false,
        reason: `No download URL for tier "${tierName}". Configure "repo" or "download_url" in tier config.`
      }
    }

    if (reportProgress) {
      setModelDownloadState({
        in_progress: true,
        tier: tierName,
        file: configuredFile,
        downloaded_bytes: 0,
        total_bytes: null,
        progress: 1,
        status: 'downloading',
        message: `Downloading model (${tierName.toUpperCase()})...`,
        error: null
      })
      setInitStatus('loading', `Downloading model (${tierName.toUpperCase()})... 0%`, 45, null)
    }

    if (typeof process.send === 'function') {
      process.send({
        type: 'node-core-log',
        message: `[model] Downloading ${configuredFile} from ${url}`
      })
    }

    let lastProgressUpdate = 0
    try {
      await downloadToFile(url, targetPath, ({ received, total }) => {
        const now = Date.now()
        const percent = total
          ? Math.max(1, Math.min(99, Math.round((received / total) * 100)))
          : null

        if (reportProgress) {
          setModelDownloadState({
            downloaded_bytes: received,
            total_bytes: total,
            progress: percent || modelDownloadState.progress,
            message: percent
              ? `Downloading model (${tierName.toUpperCase()})... ${percent}%`
              : `Downloading model (${tierName.toUpperCase()})...`
          })
          if (now - lastProgressUpdate >= 300) {
            const initProgress = percent ? 45 + Math.min(45, Math.round(percent * 0.45)) : 50
            setInitStatus(
              'loading',
              percent
                ? `Downloading model (${tierName.toUpperCase()})... ${percent}%`
                : `Downloading model (${tierName.toUpperCase()})...`,
              initProgress,
              null
            )
            lastProgressUpdate = now
          }
        }
      })

      if (reportProgress) {
        setModelDownloadState({
          in_progress: false,
          status: 'ready',
          progress: 100,
          message: `Model ready (${tierName.toUpperCase()})`,
          error: null
        })
        setInitStatus('loading', `Model downloaded (${tierName.toUpperCase()}).`, 92, null)
      }
      return { ok: true, path: targetPath, downloaded: true }
    } catch (error) {
      const message = error?.message || 'Model download failed'
      if (reportProgress) {
        setModelDownloadState({
          in_progress: false,
          status: 'error',
          error: message,
          message: 'Model download failed'
        })
      }
      return { ok: false, reason: message }
    }
  })()

  modelDownloadPromises.set(configuredFile, promise)
  try {
    return await promise
  } finally {
    modelDownloadPromises.delete(configuredFile)
  }
}

module.exports = {
  modelDownloadState,
  modelDownloadPromises,
  setModelDownloadState,
  resolveTierModelUrl,
  downloadToFile,
  ensureTierModelAvailable
}
