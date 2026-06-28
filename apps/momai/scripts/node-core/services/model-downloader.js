const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const { store, modelDownloadState } = require('./shared-state')
const { isoNow } = require('../utils/time')
const logger = require('../infrastructure/logger')
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
    const tmpPath = `${targetPath}.partial`

    // 1. Check if a partial file already exists to request a Range resume
    let startByte = 0
    if (fs.existsSync(tmpPath)) {
      try {
        startByte = fs.statSync(tmpPath).size
      } catch (err) {
        logger.warn(`[model] Failed to read partial file size: ${err.message}`)
      }
    }

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    if (startByte > 0) {
      headers['Range'] = `bytes=${startByte}-`
      logger.info(
        `[model] Attempting to resume download from byte ${startByte} for ${path.basename(targetPath)}`
      )
    }

    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'https:' ? https : require('node:http')

    const request = client.get(url, { headers }, (response) => {
      const status = Number(response.statusCode || 0)

      // 2. Handle HTTP Redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location
        response.resume()
        if (!location) {
          reject(new Error(`Redirect without location for ${url}`))
          return
        }
        // Recursively follow redirect
        resolve(downloadToFile(location, targetPath, onProgress))
        return
      }

      // 3. Handle Range Not Satisfiable (416)
      if (status === 416) {
        response.resume()
        logger.warn(
          `[model] Range not satisfiable (HTTP 416) for ${path.basename(targetPath)}. Deleting partial file and starting from scratch.`
        )
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        } catch {}
        resolve(downloadToFile(url, targetPath, onProgress))
        return
      }

      if (status < 200 || status >= 300) {
        response.resume()
        reject(new Error(`Model download failed with HTTP ${status}`))
        return
      }

      const isPartial = status === 206
      const contentRange = response.headers['content-range']
      let totalBytes = null

      // Parse total bytes from Content-Range header if present
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/)
        if (match) {
          totalBytes = Number(match[1])
        }
      }

      // Fallback to Content-Length
      if (!totalBytes) {
        const totalBytesRaw = Number(response.headers['content-length'] || 0)
        totalBytes =
          Number.isFinite(totalBytesRaw) && totalBytesRaw > 0
            ? totalBytesRaw + (isPartial ? startByte : 0)
            : null
      }

      let received = isPartial ? startByte : 0
      let lastProgressUpdate = 0

      // 4. Open output stream (append if partial, write/truncate if full)
      const output = fs.createWriteStream(tmpPath, { flags: isPartial ? 'a' : 'w' })
      let inactivityTimer = null

      const resetInactivityTimeout = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer)
        inactivityTimer = setTimeout(() => {
          const err = new Error('Model download inactivity timeout (no data received for 30s)')
          request.destroy(err)
        }, 30000) // 30 seconds inactivity timeout
      }

      const fail = (error) => {
        if (inactivityTimer) clearTimeout(inactivityTimer)
        try {
          output.close()
        } catch {}
        reject(error)
      }

      output.on('error', fail)
      response.on('error', fail)
      resetInactivityTimeout()

      // 5. Transform stream for tracking progress and resetting timeout
      const { Transform } = require('node:stream')
      const progressTracker = new Transform({
        transform(chunk, encoding, callback) {
          resetInactivityTimeout()
          received += chunk.length
          const now = Date.now()
          if (now - lastProgressUpdate > 500) {
            onProgress({ received, total: totalBytes, elapsedMs: now - startedAt })
            lastProgressUpdate = now
          }
          callback(null, chunk)
        },
        flush(callback) {
          if (inactivityTimer) clearTimeout(inactivityTimer)
          onProgress({ received, total: totalBytes, elapsedMs: Date.now() - startedAt })
          callback()
        }
      })

      response.pipe(progressTracker).pipe(output)

      output.on('finish', () => {
        if (inactivityTimer) clearTimeout(inactivityTimer)
        output.close(() => {
          try {
            // 6. Verify download integrity
            if (totalBytes && received < totalBytes) {
              const err = new Error(
                `Download incomplete for ${path.basename(targetPath)}: received ${received} of ${totalBytes} bytes`
              )
              fail(err)
              return
            }

            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)
            fs.renameSync(tmpPath, targetPath)
            logger.info(`[model] Successfully downloaded and verified ${path.basename(targetPath)}`)
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
    const maxRetries = 3
    let attempt = 0
    let success = false
    let lastError = null

    while (attempt < maxRetries && !success) {
      attempt += 1
      try {
        if (attempt > 1) {
          const delay = 2000 * Math.pow(2, attempt - 2) // 2s, 4s, etc.
          logger.warn(
            `[model] Retrying download for ${configuredFile} in ${delay}ms (attempt ${attempt}/${maxRetries})...`
          )
          await new Promise((r) => setTimeout(r, delay))
        }

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
        success = true
      } catch (err) {
        lastError = err
        logger.warn(
          `[model] Download attempt ${attempt} failed for ${configuredFile}: ${err.message}`
        )
      }
    }

    if (!success) {
      throw lastError || new Error('Max retries reached')
    }

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
  })().catch((error) => {
    const message = error?.message || 'Model download failed'
    logger.error(`[model] Permanent download failure for ${configuredFile}: ${message}`, error)
    if (reportProgress) {
      setModelDownloadState({
        in_progress: false,
        status: 'error',
        error: message,
        message: 'Model download failed'
      })
    }
    return { ok: false, reason: message }
  })

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
