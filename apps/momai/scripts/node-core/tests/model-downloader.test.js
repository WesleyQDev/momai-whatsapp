import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {
  downloadToFile,
  ensureTierModelAvailable,
  modelDownloadState
} from '../services/model-downloader'

const TEST_MODELS_DIR = path.join(__dirname, '../data/test-models')

describe('model-downloader', () => {
  let server
  let serverPort
  let requestHeaders = []
  let responseBehavior = {
    statusCode: 200,
    headers: {},
    body: 'Hello World! This is a mock model payload.',
    incomplete: false
  }

  beforeEach(() => {
    requestHeaders = []
    responseBehavior = {
      statusCode: 200,
      headers: {},
      body: 'Hello World! This is a mock model payload.',
      incomplete: false
    }

    if (!fs.existsSync(TEST_MODELS_DIR)) {
      fs.mkdirSync(TEST_MODELS_DIR, { recursive: true })
    }

    // Start a mock HTTP server
    server = http.createServer((req, res) => {
      requestHeaders.push(req.headers)

      if (responseBehavior.incomplete) {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': 1000
        })
        res.write('Partial data here...')
        // Simulate sudden connection drop/close
        process.nextTick(() => {
          req.socket.destroy()
        })
        return
      }

      const range = req.headers.range
      const fullBody = responseBehavior.body

      if (range && responseBehavior.statusCode === 206) {
        const match = range.match(/bytes=(\d+)-/)
        if (match) {
          const start = parseInt(match[1], 10)
          const slice = fullBody.slice(start)
          res.writeHead(206, {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${start}-${fullBody.length - 1}/${fullBody.length}`,
            'Content-Length': slice.length
          })
          res.end(slice)
          return
        }
      }

      if (responseBehavior.statusCode === 416) {
        res.writeHead(416, { 'Content-Range': `bytes */${fullBody.length}` })
        res.end()
        return
      }

      // Default response
      res.writeHead(responseBehavior.statusCode, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': Buffer.byteLength(fullBody),
        ...responseBehavior.headers
      })
      res.end(fullBody)
    })

    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port
        resolve()
      })
    })
  })

  afterEach(() => {
    if (server) {
      server.close()
    }
    // Clean up test models
    if (fs.existsSync(TEST_MODELS_DIR)) {
      fs.rmSync(TEST_MODELS_DIR, { recursive: true, force: true })
    }
  })

  it('should download a model file completely (status 200)', async () => {
    const targetFile = path.join(TEST_MODELS_DIR, 'model_200.gguf')
    const url = `http://127.0.0.1:${serverPort}/model.gguf`

    const progressCalls = []
    const success = await downloadToFile(url, targetFile, (progress) => {
      progressCalls.push(progress)
    })

    expect(success).toBe(true)
    expect(fs.existsSync(targetFile)).toBe(true)
    expect(fs.readFileSync(targetFile, 'utf8')).toBe(responseBehavior.body)
    expect(progressCalls.length).toBeGreaterThan(0)
  })

  it('should use Range header to resume download when partial file exists (status 206)', async () => {
    const targetFile = path.join(TEST_MODELS_DIR, 'model_206.gguf')
    const partialFile = `${targetFile}.partial`
    const url = `http://127.0.0.1:${serverPort}/model.gguf`

    // Create a partial file with the first 5 bytes
    fs.writeFileSync(partialFile, responseBehavior.body.slice(0, 5))

    responseBehavior.statusCode = 206

    const success = await downloadToFile(url, targetFile, () => {})

    expect(success).toBe(true)
    expect(fs.existsSync(targetFile)).toBe(true)
    expect(fs.readFileSync(targetFile, 'utf8')).toBe(responseBehavior.body)

    // Check that we requested starting from byte 5
    const rangeHeaders = requestHeaders.filter((h) => h.range)
    expect(rangeHeaders.length).toBe(1)
    expect(rangeHeaders[0].range).toBe('bytes=5-')
  })

  it('should delete partial and start from scratch if HTTP 416 is returned', async () => {
    const targetFile = path.join(TEST_MODELS_DIR, 'model_416.gguf')
    const partialFile = `${targetFile}.partial`
    const url = `http://127.0.0.1:${serverPort}/model.gguf`

    // Create a partial file that is larger than the final body (invalid state)
    fs.writeFileSync(partialFile, responseBehavior.body + ' EXTRA JUNK')

    // First request returns 416, next should resolve to 200
    responseBehavior.statusCode = 416

    server.on('request', () => {
      // Switch back to 200 for the second attempt
      if (responseBehavior.statusCode === 416) {
        responseBehavior.statusCode = 200
      }
    })

    const success = await downloadToFile(url, targetFile, () => {})

    expect(success).toBe(true)
    expect(fs.existsSync(targetFile)).toBe(true)
    expect(fs.readFileSync(targetFile, 'utf8')).toBe(responseBehavior.body)
  })

  it('should reject and clean up if download is incomplete (received < content-length)', async () => {
    const targetFile = path.join(TEST_MODELS_DIR, 'model_incomplete.gguf')
    const url = `http://127.0.0.1:${serverPort}/model.gguf`

    responseBehavior.incomplete = true

    await expect(downloadToFile(url, targetFile, () => {})).rejects.toThrow()
    expect(fs.existsSync(targetFile)).toBe(false)
  })
})
