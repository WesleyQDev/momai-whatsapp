import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface KeepInTrayReader {
  isEnabled(): boolean
}

export class FileKeepInTrayReader implements KeepInTrayReader {
  isEnabled(): boolean {
    try {
      const storePath = join(app.getPath('userData'), 'data', 'node-core-store.json')
      if (!existsSync(storePath)) return true
      const data = JSON.parse(readFileSync(storePath, 'utf-8'))
      return data.settings?.keep_in_tray !== false
    } catch {
      return true
    }
  }
}
