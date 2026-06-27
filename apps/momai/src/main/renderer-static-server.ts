import http from 'node:http'
import { existsSync, statSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { AddressInfo } from 'node:net'
import { app } from 'electron'
import { logger } from './logger'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
}

let activeServer: http.Server | null = null
let activePort: number | null = null
let activeRoot: string | null = null
let activeHost = 'localhost'

export function getActiveRendererOrigin(): string | null {
  if (!activePort) return null
  return `http://${activeHost}:${activePort}`
}

function resolveSafePath(rootDir: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split('?')[0] ?? '/')
  const relative = decoded.startsWith('/') ? decoded.slice(1) : decoded
  const normalized = normalize(relative)

  if (normalized.startsWith('..') || normalized.includes(`${sep}..${sep}`) || normalized.endsWith(`${sep}..`)) {
    return null
  }

  const root = resolve(rootDir)
  const resolved = resolve(root, normalized)
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    return null
  }

  return resolved
}

function sendFile(res: http.ServerResponse, filePath: string): void {
  const ext = extname(filePath).toLowerCase()
  res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream')
  createReadStream(filePath).pipe(res)
}

export function resolveRendererAssetPath(rootDir: string, requestPath: string): string | null {
  const cleanPath = requestPath.split('?')[0] ?? '/'
  const match = cleanPath.match(/^\/extensions\/([^/]+)\/dist\/(.+)$/)
  if (match) {
    const skillId = match[1]
    const filePath = match[2]
    if (!filePath.includes('..') && !filePath.includes('\\')) {
      const candidates = [
        join(app.getAppPath(), 'scripts', 'skills', 'packaged', skillId),
        join(app.getPath('userData'), 'data', 'extensions', skillId)
      ]
      for (const dir of candidates) {
        const fullPath = join(dir, 'dist', filePath)
        if (existsSync(fullPath) && statSync(fullPath).isFile()) {
          return fullPath
        }
      }
    }
  }

  const safePath = resolveSafePath(rootDir, requestPath)
  if (!safePath) return null

  if (existsSync(safePath) && statSync(safePath).isFile()) {
    return safePath
  }

  const indexPath = join(rootDir, 'index.html')
  return existsSync(indexPath) ? indexPath : null
}

export async function ensureRendererStaticServer(rootDir: string): Promise<string> {
  if (activeServer && activeRoot === rootDir && activePort) {
    return `http://${activeHost}:${activePort}`
  }

  if (activeServer) {
    await new Promise<void>((resolve) => activeServer!.close(() => resolve()))
    activeServer = null
    activePort = null
    activeRoot = null
  }

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${activeHost}`)
    const filePath = resolveRendererAssetPath(rootDir, url.pathname)

    if (!filePath) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    if (req.method === 'HEAD') {
      res.writeHead(200)
      res.end()
      return
    }

    sendFile(res, filePath)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, activeHost, () => resolve())
  })

  const address = server.address() as AddressInfo
  activeServer = server
  activePort = address.port
  activeRoot = rootDir

  logger.info(`[RendererServer] Serving production UI from http://${activeHost}:${address.port}`)
  return `http://${activeHost}:${address.port}`
}

export function stopRendererStaticServer(): void {
  if (!activeServer) return
  activeServer.close()
  activeServer = null
  activePort = null
  activeRoot = null
}
