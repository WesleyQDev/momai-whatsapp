import { safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { logger } from '../logger'

const KEY_FILE_NAME = 'note-encryption.key'
const SALT = Buffer.from('momai-notes-salt-v1', 'utf-8')
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_LENGTH = 32

let _cachedKey: { key: Buffer; marker: Buffer } | null = null

function getOrCreateMarker(dataDir: string): Buffer | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null

    const keyPath = join(dataDir, KEY_FILE_NAME)

    if (existsSync(keyPath)) {
      try {
        const marker = readFileSync(keyPath)
        try {
          chmodSync(keyPath, 0o600)
        } catch {
          // best effort: tighten permissions if possible (no-op on Windows)
        }
        return marker
      } catch {
        // fall through and regenerate
      }
    }

    const marker = safeStorage.encryptString('momai-notes-key-v1')
    if (!marker) return null
    try {
      writeFileSync(keyPath, marker, { mode: 0o600 })
    } catch {
      // best effort: still return marker for in-memory use
    }
    try {
      chmodSync(keyPath, 0o600)
    } catch {
      // best effort: ensure permissions (no-op on Windows)
    }
    return marker
  } catch (e) {
    logger.error(
      '[note-crypto] Failed to get/create encryption marker. safeStorage may be unavailable.',
      e
    )
    return null
  }
}

function getKey(dataDir: string): Buffer | null {
  const marker = getOrCreateMarker(dataDir)
  if (!marker) return null

  if (_cachedKey && _cachedKey.marker.equals(marker)) {
    return _cachedKey.key
  }

  const key = scryptSync(marker, SALT, KEY_LENGTH)
  _cachedKey = { key, marker }
  return key
}

export function encryptNote(plain: string, dataDir: string): string | null {
  const key = getKey(dataDir)
  if (!key) return null

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptNote(encBase64: string, dataDir: string): string | null {
  const key = getKey(dataDir)
  if (!key) return null

  const buf = Buffer.from(encBase64, 'base64')
  if (buf.length < IV_LENGTH + TAG_LENGTH) return null

  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const enc = buf.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf-8')
  } catch {
    return null
  }
}
