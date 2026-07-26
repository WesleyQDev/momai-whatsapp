import { resolve } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'

export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 8000

export const API_HOST = process.env.HOST || DEFAULT_HOST
export const API_PORT = parseInt(process.env.PORT || String(DEFAULT_PORT))

export const API_BASE_URL = `http://${API_HOST}:${API_PORT}`
export const WS_BASE_URL = `ws://${API_HOST}:${API_PORT}/ws`

function getIconPath(): string {
  const ext = process.platform === 'win32' ? 'ico' : 'png'
  const filename = `icon.${ext}`
  if (app.isPackaged) {
    return resolve(process.resourcesPath, 'build', filename)
  }
  const candidates = [
    resolve(__dirname, '../../build', filename),
    resolve(__dirname, '../build', filename),
    resolve(app.getAppPath(), '../../build', filename),
    resolve(app.getAppPath(), 'build', filename),
    resolve(process.cwd(), 'build', filename),
    resolve(process.cwd(), 'apps/momai/build', filename)
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

export const ICON_PATH = getIconPath()
