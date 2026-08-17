// scripts/skills/packaged/whatsapp/baileys-cred-migration.js
// Migrate Baileys `creds.json` to/from `creds.json.enc` so Signal protocol keys
// are encrypted at rest with the OS keychain (via the secure-storage bridge).
//
// Trade-off (v1): Baileys still needs `creds.json` on disk during its run, so we
// decrypt to plain at startup and re-encrypt when the connection opens (or
// `request_qr` triggers a logout/clear). Plain is on disk only between those
// two events.

const fs = require('fs')
const path = require('node:path')
const { encryptForStorage, decryptFromStorage } = require('./secure-storage-bridge.ts')
const { secureWriteFileSync } = require('./fs-permissions.ts')

function _plainCredsPath(baseAuth) {
  return path.join(baseAuth, 'creds.json')
}
function _encCredsPath(baseAuth) {
  return path.join(baseAuth, 'creds.json.enc')
}

/**
 * Factory: build a migration triple bound to a specific bridge.
 * Tests inject a mock bridge; production code uses the default export
 * (which is pre-bound to the real bridge).
 */
function createMigration(bridge) {
  return {
    /**
     * One-time migration: encrypt any legacy `creds.json` to `creds.json.enc` as a
     * backup. Also refreshes the backup when `creds.json.enc` exists but is older
     * than `creds.json` (Baileys updated the plain file after the last backup).
     *
     * The PLAIN file is NEVER deleted: it is Baileys' working copy, and deleting it
     * after encrypting made the session hostage to safeStorage availability plus
     * ciphertext integrity. A raced/partial encrypt then destroyed the only usable
     * copy and forced a fresh QR scan on every restart (device-churn → ban risk).
     * `creds.json.enc` is now a best-effort encrypted backup only.
     *
     * Returns true when a (re-)encryption was performed, false otherwise.
     */
    async migratePlainCredsToEncrypted(baseAuth) {
      const plainCreds = _plainCredsPath(baseAuth)
      const encCreds = _encCredsPath(baseAuth)
      if (fs.existsSync(plainCreds)) {
        let shouldMigrate = false
        if (!fs.existsSync(encCreds)) {
          shouldMigrate = true
        } else {
          try {
            const plainStat = fs.statSync(plainCreds)
            const encStat = fs.statSync(encCreds)
            if (plainStat.mtimeMs > encStat.mtimeMs) {
              shouldMigrate = true
            }
          } catch {
            shouldMigrate = true
          }
        }
        if (shouldMigrate) {
          const plain = fs.readFileSync(plainCreds, 'utf-8')
          const encrypted = await bridge.encryptForStorage(plain)
          if (encrypted) {
            secureWriteFileSync(encCreds, Buffer.from(encrypted, 'base64'))
            console.log('[whatsapp] (re-)encrypted creds.json → creds.json.enc (backup kept)')
            return true
          }
          console.warn('[whatsapp] migration skipped: safeStorage unavailable')
        }
      }
      return false
    },

    /**
     * On worker startup, decrypt `creds.json.enc` to `creds.json` so Baileys can use it.
     * Only writes if the plain file is missing (i.e., we just started and Baileys isn't running).
     * Returns true when a decryption+write happened, false otherwise.
     *
     * On failure (e.g. safeStorage unavailable in dev) the encrypted file is KEPT.
     * It is the only copy of the session; deleting it forces a fresh QR scan on
     * every startup, which looks like device-churn abuse and risks a WhatsApp ban.
     */
    async decryptCredsForBaileys(baseAuth) {
      const encCreds = _encCredsPath(baseAuth)
      const plainCreds = _plainCredsPath(baseAuth)
      if (fs.existsSync(encCreds) && !fs.existsSync(plainCreds)) {
        const encrypted = fs.readFileSync(encCreds).toString('base64')
        const plain = await bridge.decryptFromStorage(encrypted)
        if (plain) {
          secureWriteFileSync(plainCreds, plain, 'utf-8')
          console.log('[whatsapp] decrypted creds.json.enc → creds.json for runtime')
          return true
        }
        console.warn(
          '[whatsapp] failed to decrypt creds.json.enc, safeStorage unavailable? ' +
            'Keeping the encrypted session; Baileys will request a new QR if it cannot use it.'
        )
      }
      return false
    },

    /**
     * Re-encrypt `creds.json` to `creds.json.enc` as a best-effort backup. The
     * plain file is kept: it is Baileys' working copy and the session must never
     * depend on safeStorage being available later.
     * Returns true when a re-encryption happened, false otherwise.
     */
    async reEncryptCredsAfterBaileys(baseAuth) {
      const plainCreds = _plainCredsPath(baseAuth)
      const encCreds = _encCredsPath(baseAuth)
      if (fs.existsSync(plainCreds)) {
        const plain = fs.readFileSync(plainCreds, 'utf-8')
        const encrypted = await bridge.encryptForStorage(plain)
        if (encrypted) {
          secureWriteFileSync(encCreds, Buffer.from(encrypted, 'base64'))
          console.log('[whatsapp] re-encrypted creds.json → creds.json.enc (backup kept)')
          return true
        }
        console.warn('[whatsapp] re-encryption skipped: safeStorage unavailable')
      }
      return false
    }
  }
}

// Default export: production migration pre-bound to the real bridge.
// Callers (e.g. background-worker.js) can still destructure the three
// migration functions directly from this default export.
module.exports = createMigration({ encryptForStorage, decryptFromStorage })

// Also export the factory so tests can inject a mock bridge.
module.exports.createMigration = createMigration
