import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { logger } from '../../logger'
import { getUserDataPath } from '../index'
import type { AITier } from '../types'

export function getCurrentTier(): AITier | null {
  // Check both the standard Electron userData path and the MSIX-resolved path.
  // node-core.js writes to app.getPath('userData') (via MOMAI_NODE_CORE_DATA_DIR),
  // which may differ from resolveUserDataPath() on MSIX installs.
  const candidates = [
    join(app.getPath('userData'), 'data', 'node-core-store.json'),
    join(getUserDataPath(), 'data', 'node-core-store.json')
  ]
  // Dedupe in case both resolve to the same path
  const uniquePaths = [...new Set(candidates)]

  for (const storePath of uniquePaths) {
    try {
      if (existsSync(storePath)) {
        const data = JSON.parse(readFileSync(storePath, 'utf-8'))
        const tier = data.settings?.ai_tier
        if (tier === 'lite' || tier === 'pro' || tier === 'ultra') return tier
      }
    } catch (e) {
      logger.warn(`[PythonManager] Error reading tier from ${storePath}:`, e)
    }
  }
  return null
}

export function isAITier(value: unknown): value is AITier {
  return value === 'lite' || value === 'pro' || value === 'ultra'
}
