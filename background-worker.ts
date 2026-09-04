// scripts/skills/packaged/whatsapp/background-worker.js
// Persistent worker for WhatsApp Web connection via Baileys

const MAX_HISTORY = 50
const MAX_PERSISTED_CONVERSATIONS = 3
const CHAT_HISTORY_KEY = 'chat_history'

let makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  pino
let baileysLoaded = false
function loadBaileys() {
  if (baileysLoaded) return
  try {
    const start = Date.now()
    const baileys = require('@whiskeysockets/baileys')
    makeWASocket = baileys.makeWASocket || baileys.default?.makeWASocket
    useMultiFileAuthState = baileys.useMultiFileAuthState || baileys.default?.useMultiFileAuthState
    DisconnectReason = baileys.DisconnectReason
    fetchLatestBaileysVersion =
      baileys.fetchLatestBaileysVersion || baileys.default?.fetchLatestBaileysVersion
    makeCacheableSignalKeyStore =
      baileys.makeCacheableSignalKeyStore || baileys.default?.makeCacheableSignalKeyStore
    try {
      pino = require('pino')
    } catch (e) {}
    baileysLoaded = true
    process.send({ type: 'log', message: `Baileys loaded successfully in ${Date.now() - start}ms (lazy)` })
  } catch (err) {
    try {
      process.send({ type: 'log', message: `Baileys load error: ${err.message}` })
    } catch {}
    process.exit(1)
  }
}
const path = require('path')
const fs = require('node:fs/promises')
const {
  migratePlainCredsToEncrypted: _migratePlainCredsToEncrypted,
  decryptCredsForBaileys: _decryptCredsForBaileys,
  reEncryptCredsAfterBaileys: _reEncryptCredsAfterBaileys
} = require('./baileys-cred-migration.ts')
const { secureWriteFile } = require('./fs-permissions.ts')
const {
  withTimeout,
  friendlySendError,
  buildMessageContent,
  sanitizeMediaFilename,
  resolveJidForSending: _resolveJidForSendingPure,
  shouldCheckWhatsAppExistence: _shouldCheckWhatsAppExistence,
  forEachYield: _forEachYield,
  MAX_AUDIO_BYTES
} = require('./worker-utils.ts')

let safeStorageAvailable = true

// Wrappers that track whether safeStorage is available. If encryption ever fails,
// we skip it entirely to avoid losing the session on every startup.
async function migratePlainCredsToEncrypted(baseAuth) {
  if (!safeStorageAvailable) return false
  const result = await _migratePlainCredsToEncrypted(baseAuth)
  if (!result) {
    // Check if there was a plain file but encryption failed (migration skipped)
    const fs = require('fs')
    const path = require('node:path')
    const plainCreds = path.join(baseAuth, 'creds.json')
    const encCreds = path.join(baseAuth, 'creds.json.enc')
    if (fs.existsSync(plainCreds) && !fs.existsSync(encCreds)) {
      safeStorageAvailable = false
    }
  }
  return result
}

async function decryptCredsForBaileys(baseAuth) {
  if (!safeStorageAvailable) return false
  const result = await _decryptCredsForBaileys(baseAuth)
  if (!result) {
    // Check if there was an enc file but decryption failed
    const fs = require('fs')
    const path = require('node:path')
    const encCreds = path.join(baseAuth, 'creds.json.enc')
    if (fs.existsSync(encCreds)) {
      safeStorageAvailable = false
    }
  }
  return result
}

async function reEncryptCredsAfterBaileys(baseAuth) {
  if (!safeStorageAvailable) return false
  const result = await _reEncryptCredsAfterBaileys(baseAuth)
  if (!result) {
    safeStorageAvailable = false
  }
  return result
}

// Crash protection — log instead of exiting on unhandled errors
process.on('uncaughtException', (err) => {
  try {
    process.send({ type: 'log', message: `UNCAUGHT: ${err.message}` })
  } catch {}
})
process.on('unhandledRejection', (err) => {
  try {
    process.send({ type: 'log', message: `UNHANDLED: ${(err && err.message) || err}` })
  } catch {}
})

const DISABLED_CONTACTS_KEY = 'disabled_contacts'
const workerStartTime = Math.floor(Date.now() / 1000)
const CONTACT_NAMES_KEY = 'contact_names'
const WA_CONTACTS_KEY = 'wa_contacts'
const SETTINGS_KEY = 'settings'
const ACTIONS_KEY = 'actions'
const DEFAULT_CONTACT_KEY = 'default_contact'

// Self-contained momai bridge (not loaded via extension-host-worker)
const _skillId = process.env.MOMAI_EXTENSION_ID || 'whatsapp'
const _dataDir =
  process.env.MOMAI_DATA_DIR ||
  process.env.MOMAI_NODE_CORE_DATA_DIR ||
  path.resolve(__dirname, '..', '..', '..', '..', 'data')
const _storageBase = path.join(_dataDir, 'extensions', _skillId)

const momai = {
  log: (msg) => process.send({ type: 'log', message: String(msg) }),
  sendEvent: (eventType, data) =>
    process.send({ type: 'event', eventType: String(eventType), data }),
  sendStructuredResponse: (data) => process.send({ type: 'structured_response', data }),
  storage: {
    storageDir: _storageBase,
    async get(key) {
      try {
        const content = await fs.readFile(path.join(_storageBase, `${key}.json`), 'utf-8')
        return JSON.parse(content)
      } catch {
        return null
      }
    },
    async set(key, value) {
      await fs.mkdir(_storageBase, { recursive: true })
      const serialized = JSON.stringify(value, null, 2)
      if (serialized.length > 5 * 1024 * 1024) throw new Error('Storage quota exceeded')
      await secureWriteFile(path.join(_storageBase, `${key}.json`), serialized)
    }
  }
}

// Actions config ("quando chegar mensagem → executar X") + default contact for
// pre-filling the "para quem" field. Persisted in the extension storage and
// attached to the whatsapp_message event for the host to execute (MOM-115).
async function getActionsConfig() {
  try {
    const stored = await momai.storage.get(ACTIONS_KEY)
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

async function saveActionsConfig(actions) {
  await momai.storage.set(ACTIONS_KEY, Array.isArray(actions) ? actions : [])
}

function _normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const WHEN_KEYS = ['contact', 'groupName', 'isGroup', 'startsWith', 'endsWith', 'contains']

function _toBool(v) {
  if (v === true || v === false) return v
  if (v === 'true') return true
  if (v === 'false') return false
  return undefined
}

function _hasWhen(action) {
  const when = action && action.when
  if (!when || typeof when !== 'object') return false
  return WHEN_KEYS.some((k) => {
    if (k === 'isGroup') return _toBool(when[k]) !== undefined
    const v = when[k]
    return typeof v === 'string' && v.trim().length > 0
  })
}

/**
 * Filtro de gatilho das actions do whatsapp_message: each action can carry an
 * optional `when` with:
 *   contact?, groupName?, isGroup?   -> remetente/conversa
 *   startsWith?, endsWith?, contains? -> conteúdo da mensagem
 * Empty/absent fields mean "any". The action only runs when the incoming
 * message matches every filled trigger (AND).
 */
function actionMatchesEvent(action, data) {
  if (!action || typeof action !== 'object') return false
  if (!_hasWhen(action)) return true
  const when = action.when
  const evt = data || {}

  if (typeof when.contact === 'string' && when.contact.trim()) {
    const q = _normalize(when.contact)
    if (
      !_normalize(evt.contact).includes(q) &&
      !_normalize(evt.contactJid).includes(q) &&
      !_normalize(evt.senderJid).includes(q)
    ) return false
  }
  if (typeof when.groupName === 'string' && when.groupName.trim()) {
    if (!_normalize(evt.groupName).includes(_normalize(when.groupName))) return false
  }
  const wantGroup = _toBool(when.isGroup)
  if (wantGroup !== undefined && !!evt.isGroup !== wantGroup) return false

  const msg = _normalize(evt.message)
  if (typeof when.startsWith === 'string' && when.startsWith.trim()) {
    if (!msg.startsWith(_normalize(when.startsWith))) return false
  }
  if (typeof when.endsWith === 'string' && when.endsWith.trim()) {
    if (!msg.endsWith(_normalize(when.endsWith))) return false
  }
  if (typeof when.contains === 'string' && when.contains.trim()) {
    if (!msg.includes(_normalize(when.contains))) return false
  }
  return true
}

async function getDefaultContact() {
  try {
    const stored = await momai.storage.get(DEFAULT_CONTACT_KEY)
    return typeof stored === 'string' && stored.trim() ? stored.trim() : null
  } catch {
    return null
  }
}

class MessageRetryCache {
  store: Map<any, any> = new Map()
  constructor() {
    this.store = new Map()
  }
  get(key) {
    return this.store.get(key)
  }
  set(key, value) {
    this.store.set(key, value)
  }
  del(key) {
    this.store.delete(key)
  }
  delete(key) {
    this.del(key)
  }
  has(key) {
    return this.store.has(key)
  }
}
const msgRetryCounterCache = new MessageRetryCache()

const fsSync = require('fs')
const lastSessionReset = new Map()

function isPidRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

async function acquireLock() {
  const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
  const lockFile = path.join(authDir, 'worker.lock')
  if (!fsSync.existsSync(authDir)) {
    fsSync.mkdirSync(authDir, { recursive: true })
  }
  // A worker restart (host hot-reload / health restart) can briefly overlap with
  // the previous worker still releasing the lock. Retry a few times before giving
  // up so we don't kill ourselves mid-shutdown and trigger another restart storm.
  const MAX_ATTEMPTS = 4
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let busy = false
    if (fsSync.existsSync(lockFile)) {
      try {
        const content = fsSync.readFileSync(lockFile, 'utf-8').trim()
        const existingPid = parseInt(content, 10)
        if (!isNaN(existingPid) && existingPid !== process.pid && isPidRunning(existingPid)) {
          busy = true
          if (attempt < MAX_ATTEMPTS) {
            momai.log(
              `[whatsapp] Another instance is running (PID: ${existingPid}); retrying lock (${attempt}/${MAX_ATTEMPTS - 1})...`
            )
            await new Promise((r) => setTimeout(r, 1000))
            continue
          }
          momai.log(
            `[whatsapp] Lock held by PID ${existingPid} timed out after ${MAX_ATTEMPTS} attempts; overriding stale lock.`
          )
          busy = false
        }
      } catch (err) {
        momai.log(`[whatsapp] Error reading lockfile: ${err.message}. Overwriting.`)
      }
    }
    if (!busy) break
  }
  try {
    fsSync.writeFileSync(lockFile, String(process.pid), 'utf-8')
    momai.log(`[whatsapp] Acquired worker lock (PID: ${process.pid})`)
  } catch (err) {
    momai.log(`[whatsapp] Failed to write lockfile: ${err.message}`)
  }
}

function releaseLock() {
  const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
  const lockFile = path.join(authDir, 'worker.lock')
  try {
    if (fsSync.existsSync(lockFile)) {
      const content = fsSync.readFileSync(lockFile, 'utf-8').trim()
      const pid = parseInt(content, 10)
      if (pid === process.pid) {
        fsSync.unlinkSync(lockFile)
        momai.log(`[whatsapp] Released worker lock (PID: ${process.pid})`)
      }
    }
  } catch (err) {
    momai.log(`[whatsapp] Failed to release lockfile: ${err.message}`)
  }
}

async function loadMessageCaches() {
  try {
    const sent = await momai.storage.get('message_cache_sent')
    if (sent && typeof sent === 'object') {
      for (const [k, v] of Object.entries(sent)) {
        sentMessagesCache.set(k, v)
      }
    }
    const stored = await momai.storage.get('message_cache_store')
    if (stored && typeof stored === 'object') {
      for (const [k, v] of Object.entries(stored)) {
        messageStore.set(k, v)
      }
    }
    momai.log(
      `[whatsapp] Loaded cached messages: sent=${sentMessagesCache.size}, store=${messageStore.size}`
    )
  } catch (err) {
    momai.log(`[whatsapp] Failed to load message caches: ${err.message}`)
  }
}

let saveCacheTimer = null
const CACHE_TRIM_TARGET = 1000
const CACHE_TRIM_TARGET_ON_QUOTA = 300
let cacheQuotaWarnedAt = 0
function queueSaveMessageCaches() {
  if (saveCacheTimer) return
  saveCacheTimer = setTimeout(async () => {
    saveCacheTimer = null
    try {
      await _persistMessageCaches()
    } catch (err) {
      // Quota (5MB): encolhe os caches e tenta uma vez antes de reclamar.
      _trimMessageCaches(CACHE_TRIM_TARGET_ON_QUOTA)
      try {
        await _persistMessageCaches()
      } catch (err2) {
        const now = Date.now()
        if (now - cacheQuotaWarnedAt > 60000) {
          cacheQuotaWarnedAt = now
          momai.log(`[whatsapp] message caches ainda excedem a quota após trim: ${err2.message}`)
        }
      }
    }
  }, 10000)
}

async function _persistMessageCaches() {
  const sentObj = Object.fromEntries(sentMessagesCache.entries())
  const storeObj = Object.fromEntries(messageStore.entries())
  await momai.storage.set('message_cache_sent', sentObj)
  await momai.storage.set('message_cache_store', storeObj)
}

async function repairSession(jid) {
  if (!jid) return
  const now = Date.now()
  const lastReset = lastSessionReset.get(jid) || 0
  // Rate-limit: max 1 reset per 5 minutes (300000 ms)
  if (now - lastReset < 300000) {
    momai.log(`[whatsapp] Skipping session repair for ${jid} (rate limit active)`)
    return
  }
  lastSessionReset.set(jid, now)

  if (jid.endsWith('@g.us')) {
    await resetGroupSenderKeyMemory(jid)
    return
  }

  await forceClearSession(jid)
}

function getAltJid(jid) {
  if (!jid || typeof jid !== 'string' || !jid.endsWith('@s.whatsapp.net')) return null
  const digits = jid.replace(/[^0-9]/g, '')
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    const altDigits = digits.slice(0, 4) + digits.slice(5)
    return `${altDigits}@s.whatsapp.net`
  } else if (digits.startsWith('55') && digits.length === 12) {
    const altDigits = digits.slice(0, 4) + '9' + digits.slice(4)
    return `${altDigits}@s.whatsapp.net`
  }
  return null
}

function getSessionFiles(authDir, jid) {
  if (!jid || !fsSync.existsSync(authDir)) return []
  const digits = jid.replace(/[^0-9]/g, '')
  if (!digits) return []

  const targetDigitsList = [digits]
  const alt = getAltJid(jid)
  if (alt) {
    const altDigits = alt.replace(/[^0-9]/g, '')
    if (altDigits) targetDigitsList.push(altDigits)
  }

  try {
    const allFiles = fsSync.readdirSync(authDir)
    const matchingFiles = []
    for (const f of allFiles) {
      if (!f.startsWith('session-') || !f.endsWith('.json')) continue
      const rest = f.slice('session-'.length, -'.json'.length)
      const userDigits = rest.split('.')[0]
      if (targetDigitsList.includes(userDigits)) {
        matchingFiles.push(path.join(authDir, f))
      }
    }
    return matchingFiles
  } catch {
    return []
  }
}

/**
 * Apaga a sessão Signal de um contato (memória + arquivo, via keys.set do
 * Baileys). Uma sessão criada mas nunca confirmada (baseKeyType 1) faz o
 * WhatsApp aceitar o envio e deixar a mensagem para sempre no relógio
 * "Aguardando mensagem". Limpar a sessão força o Baileys a refazer o handshake
 * de prekeys na próxima tentativa.
 *
 * NÃO usa fsSync.unlinkSync direto nos arquivos `session-*.json`: o Baileys com
 * useMultiFileAuthState lê/escreve esses arquivos a cada operação, e remover do
 * disco por fora do file-lock interno causa corrida (arquivo some no meio de uma
 * leitura → decriptação falha → handleLogEvent → repairSession → loop de
 * ressincronização). `keys.set({ session: { jid: null } })` remove os arquivos
 * com o lock do próprio Baileys (removeData).
 */
async function forceClearSession(jid) {
  if (!jid) return

  if (sock?.authState?.keys?.set) {
    try {
      const digits = jid.replace(/[^0-9]/g, '')
      const alt = getAltJid(jid)
      const altDigits = alt ? alt.replace(/[^0-9]/g, '') : null
      const keysToNull = {}
      for (const d of [digits, altDigits].filter(Boolean)) {
        keysToNull[`${d}@s.whatsapp.net`] = null
        keysToNull[`${d}:0@s.whatsapp.net`] = null
        keysToNull[d] = null
      }
      await sock.authState.keys.set({ session: keysToNull })
      momai.log(`[whatsapp] Cleared session for ${jid} (Signal re-handshake on next send)`)
    } catch (err) {
      momai.log(`[whatsapp] Failed to clear session for ${jid}: ${err.message}`)
    }
  } else {
    // Fallback somente quando não há socket ativo (ex.: startup): sem Baileys
    // rodando não há corrida de leitura, então o unlink direto é seguro aqui.
    const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
    const sessionFiles = getSessionFiles(authDir, jid)
    for (const file of sessionFiles) {
      try {
        fsSync.unlinkSync(file)
        momai.log(`[whatsapp] Cleared stale session file: ${path.basename(file)}`)
      } catch (err) {
        momai.log(`[whatsapp] Failed to delete session file ${path.basename(file)}: ${err.message}`)
      }
    }
  }
}

const SESSION_HEALTH_TTL_MS = 8000
/** @type {Map<string, { unhealthy: boolean, at: number }>} */
const sessionHealthCache = new Map()

/**
 * Detecta sessão corrompida (criada mas não confirmada, baseKeyType 1) que causa
 * o envio ficar preso em "Aguardando mensagem". Limpa a sessão para que o Baileys
 * a recrie com prekeys novas. Cache com TTL curto: readdir+read de arquivos a
 * cada envio era caro (várias mensagens seguidas = N leituras síncronas).
 */
function isSessionUnhealthy(jid) {
  if (!jid || jid.endsWith('@g.us')) return false
  const cached = sessionHealthCache.get(jid)
  if (cached && Date.now() - cached.at < SESSION_HEALTH_TTL_MS) return cached.unhealthy

  const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
  const sessionFiles = getSessionFiles(authDir, jid)
  let unhealthy = false
  if (sessionFiles.length > 0) {
    for (const file of sessionFiles) {
      try {
        const raw = fsSync.readFileSync(file, 'utf8')
        const parsed = JSON.parse(raw)
        const sessions = parsed?._sessions || {}
        let unconfirmed = 0
        let total = 0
        for (const entry of Object.values<any>(sessions)) {
          if (!entry) continue
          total++
          if (entry.indexInfo && entry.indexInfo.baseKeyType === 1) unconfirmed++
        }
        if (total > 0 && unconfirmed === total) {
          unhealthy = true
          break
        }
      } catch {
        // ignore
      }
    }
  }
  sessionHealthCache.set(jid, { unhealthy, at: Date.now() })
  return unhealthy
}

function handleLogEvent(obj, msgStr = '') {
  const detail = obj?.err?.message || obj?.error || ''
  const messageText = msgStr || obj?.msg || ''

  if (
    messageText.includes('failed to decrypt') ||
    detail.includes('Bad MAC') ||
    detail.includes('No matching sessions')
  ) {
    const jid = obj?.key?.remoteJid
    if (jid) {
      momai.log(`[whatsapp] Detected decryption failure for ${jid}. Triggering session repair.`)
      repairSession(jid).catch((e) => {
        momai.log(`[whatsapp] Error repairing session for ${jid}: ${e.message}`)
      })
    }
  }
}
const sentMessagesCache = new Map()
/** Full message protos keyed by remoteJid:messageId for Baileys retries/decrypt */
const messageStore = new Map()
/** @type {Map<string, { data: object, fetchedAt: number }>} */
const groupMetaCache = new Map()

/** Cooldown do fetch sob demanda de grupos no envio (evita refetch por mensagem). */
let lastGroupFetchTs = 0
const GROUP_FETCH_COOLDOWN_MS = 60000

let sock: any = null
let preventAutoReconnect = false
let reconnectTimer = null
let isConnecting = false

// Reconnect backoff: rapid reconnect loops look abusive to WhatsApp and can get
// the account temporarily restricted. Delay grows 5s → 60s and resets on open.
let reconnectAttempts = 0
const RECONNECT_BASE_MS = 5000
const RECONNECT_MAX_MS = 60000
function nextReconnectDelay() {
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts), RECONNECT_MAX_MS)
  reconnectAttempts++
  return delay
}
function resetReconnectBackoff() {
  reconnectAttempts = 0
}

function _clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

let disabledContacts: any[] = []
let contactNames: any = {}
let waContacts: any = {}
let notificationsDisabled = false
let connected = false
let lastQr: any = null

// True enquanto o histórico/contatos do WhatsApp estão sendo sincronizados após
// uma conexão (messaging-history.set popula waContacts aos poucos). Durante esse
// janela, consultas de existência (onWhatsApp) podem devolver vazio para números
// válidos — o envio não deve concluir "Número não registrado" nesse caso.
let syncingContacts = false
let syncingContactsTimer = null
function _markSyncingContacts() {
  syncingContacts = true
  if (syncingContactsTimer) clearTimeout(syncingContactsTimer)
  syncingContactsTimer = setTimeout(() => {
    syncingContacts = false
  }, 10000)
}

let lastQrAt = 0
const QR_TTL_MS = 65000

let cachedBaileysVersion: any = null
let cachedBaileysVersionAt = 0
let installedBaileysVersion: any = null

// Versão do Baileys instalado (package.json). Fallback para a versão com a qual
// a extensão foi publicada caso o package.json não seja resolvível no sandbox.
function getInstalledBaileysVersion() {
  if (installedBaileysVersion) return installedBaileysVersion
  try {
    const pkg = require('@whiskeysockets/baileys/package.json')
    const parts = String(pkg.version || '')
      .split('.')
      .map((n) => parseInt(n, 10))
    if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
      installedBaileysVersion = [parts[0], parts[1], parts[2] ?? 0]
      return installedBaileysVersion
    }
  } catch (e) {
    // package.json não resolvível (ex.: sandbox) — cai na constante abaixo
  }
  installedBaileysVersion = [6, 17, 16] // mesma versão da dependência no package.json
  return installedBaileysVersion
}

async function getBaileysVersion() {
  if (cachedBaileysVersion && Date.now() - cachedBaileysVersionAt < 86400000) {
    return cachedBaileysVersion
  }
  try {
    const { version } = await withTimeout(
      fetchLatestBaileysVersion(),
      10000,
      'fetchLatestBaileysVersion timeout'
    )
    cachedBaileysVersion = version
    cachedBaileysVersionAt = Date.now()
    return version
  } catch (err) {
    // fetchLatestBaileysVersion consulta a API do GitHub (api.github.com) para
    // pegar a última versão. Em redes com rate-limit/GitHub bloqueado isso
    // estoura o timeout de 10s e derrubava o connect() inteiro (QR nunca
    // aparecia). Fallback para a versão instalada: o WhatsApp funciona
    // normalmente, só não usa a versão "latest" do protocolo.
    const fallback = getInstalledBaileysVersion()
    momai.log(
      `[whatsapp] Baileys version fetch failed (${err.message}); using installed ${fallback.join('.')}`
    )
    cachedBaileysVersion = fallback
    cachedBaileysVersionAt = Date.now()
    return fallback
  }
}

function _qrStillValid() {
  return Boolean(lastQr && Date.now() - lastQrAt < QR_TTL_MS)
}

// Baileys fires `creds.update` very frequently (every few hundred ms while
// connected). Re-encrypting on every event would thrash safeStorage. Debounce
// so the .enc is at most RE_ENCRYPT_DEBOUNCE_MS behind the plain file. The
// migration in baileys-cred-migration.js picks up any remaining drift on the
// next worker restart as a safety net.
const RE_ENCRYPT_DEBOUNCE_MS = 1000
let reEncryptDebounceTimer = null
function _scheduleReEncrypt() {
  if (reEncryptDebounceTimer) return
  reEncryptDebounceTimer = setTimeout(() => {
    reEncryptDebounceTimer = null
    reEncryptCredsAfterBaileys(path.join(momai.storage.storageDir, 'baileys-auth')).catch((err) =>
      momai.log(`debounced re-encrypt failed: ${err.message}`)
    )
  }, RE_ENCRYPT_DEBOUNCE_MS)
}

/* creds.json exists after useMultiFileAuthState even without a real session.
   Only treat it as "valid" if Baileys saved a real registrationId AND the
   session was registered (user scanned QR at least once). Without the
   `registered` check, _hasSavedSession returns true on a fresh install
   because Baileys generates a registrationId before pairing, which makes
   hasCredentials=true and the QR never shows in the UI. */
function _hasSavedSession() {
  try {
    if (
      sock?.authState?.creds?.registered === true &&
      Number.isFinite(sock?.authState?.creds?.registrationId) &&
      sock?.authState?.creds?.registrationId > 0
    ) {
      return true
    }
    const cp = path.join(momai.storage.storageDir, 'baileys-auth', 'creds.json')
    const ecp = path.join(momai.storage.storageDir, 'baileys-auth', 'creds.json.enc')
    const fs = require('fs')
    if (fs.existsSync(cp)) {
      const raw = fs.readFileSync(cp, 'utf8')
      const creds = JSON.parse(raw)
      // creds.registered is only true after the user scans the QR code.
      // Before pairing, Baileys writes registrationId but registered=false.
      return creds.registered === true && Number.isFinite(creds.registrationId) && creds.registrationId > 0
    }
    if (fs.existsSync(ecp)) {
      // .enc may exist even for un-paired sessions (written on close);
      // conservatively return false — the user will see a fresh QR.
      return false
    }
    return false
  } catch {
    return false
  }
}

function _emitQrCode(qr) {
  const isSameQr = Boolean(lastQr && qr === lastQr)
  lastQr = qr
  // QR novo reseta o relógio; re-emissão do MESMO QR (ex.: request_qr com QR em
  // cache) deve refletir o TTL restante, não o TTL cheio de novo.
  if (!isSameQr) lastQrAt = Date.now()
  const elapsed = Date.now() - lastQrAt
  const expiresIn = Math.max(1, Math.ceil((QR_TTL_MS - elapsed) / 1000))
  momai.sendEvent('qr_code', { qr, expiresIn })
}

/** 0 = name starts with a letter (A–Z, including accented); 1 = digits, symbols, emoji, etc. */
function _contactDisplayNameSortTier(displayName) {
  const trimmed = String(displayName || '').trim()
  if (!trimmed) return 1
  return /^\p{L}/u.test(trimmed) ? 0 : 1
}

function _compareContactsForList(a, b) {
  if (a.hasName !== b.hasName) {
    return a.hasName ? -1 : 1
  }
  const tierA = _contactDisplayNameSortTier(a.displayName)
  const tierB = _contactDisplayNameSortTier(b.displayName)
  if (tierA !== tierB) return tierA - tierB
  return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'pt-BR', {
    sensitivity: 'base',
    numeric: true
  })
}

async function _fetchPaginatedWaEntries({ groupsOnly, search, page, perPage }) {
  const q = String(search || '').toLowerCase()
  const pageNum = parseInt(page) || 1
  const perPageNum = parseInt(perPage) || 20

  let entries = Object.values<any>(waContacts).filter((c) =>
    groupsOnly ? c.id.endsWith('@g.us') : c.phone && !c.id.endsWith('@g.us')
  )

  if (q) {
    entries = entries.filter((c) => {
      const label = _resolveWaContactDisplayName(c, c.id).toLowerCase()
      return (
        label.includes(q) ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.notify || '').toLowerCase().includes(q) ||
        (c.verifiedName || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.id || '').toLowerCase().includes(q)
      )
    })
  }

  const sorted = entries
    .map((c) => {
      const resolvedLabel = _resolveWaContactDisplayName(c, c.id)
      const customName = _pickContactLabel(contactNames[c.id], contactNames[c.phone])
      const hasRealName = Boolean(customName || _isUsableDisplayName(c.name))
      return {
        id: c.id,
        displayName: resolvedLabel,
        hasName: hasRealName,
        name: _isUsableDisplayName(c.name) ? c.name : null,
        notify: _isUsableDisplayName(c.notify) ? c.notify : null,
        phone: c.phone || c.id.split('@')[0],
        monitoring: !_isContactDisabled(c.id),
        profilePicUrl: c.profilePicUrl || null,
        isGroup: groupsOnly
      }
    })
    .sort(_compareContactsForList)

  const totalFiltered = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / perPageNum))
  const start = (pageNum - 1) * perPageNum
  const paginated = sorted.slice(start, start + perPageNum)

  // Nota: nenhuma busca automática de fotos de perfil aqui. A listagem apenas
  // devolve o que já está no cache (waContacts.profilePicUrl). O único caminho
  // para refetch é o botão "Atualizar fotos de perfil" da UI (get_avatars force).

  return {
    contacts: paginated,
    total: entries.length,
    totalFiltered,
    page: pageNum,
    totalPages,
    perPage: perPageNum
  }
}

/** WhatsApp often syncs "." or ".." when the user hides their display name. */
function _isUsableDisplayName(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return false
  if (/^[\p{P}\p{S}]+$/u.test(trimmed)) return false
  return true
}

function _pickContactLabel(...candidates) {
  for (const candidate of candidates) {
    if (_isUsableDisplayName(candidate)) return String(candidate).trim()
  }
  return null
}

function _formatPhoneLabel(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return 'Contato'
  return `+${digits}`
}

function _resolveWaContactDisplayName(contact, jid) {
  const phone = contact?.phone || (jid || '').split('@')[0]
  const custom = _pickContactLabel(contactNames[jid], contactNames[phone])
  const fromWa = _pickContactLabel(contact?.name, contact?.notify, contact?.verifiedName)
  if (custom) return custom
  if (fromWa) return fromWa
  if (jid?.endsWith('@g.us')) return 'Grupo'
  return _formatPhoneLabel(phone)
}

function _sanitizeStoredContactNames() {
  let changed = false
  for (const contact of Object.values<any>(waContacts)) {
    if (contact.name && !_isUsableDisplayName(contact.name)) {
      contact.name = null
      changed = true
    }
    if (contact.notify && !_isUsableDisplayName(contact.notify)) {
      contact.notify = null
      changed = true
    }
    if (contact.verifiedName && !_isUsableDisplayName(contact.verifiedName)) {
      contact.verifiedName = null
      changed = true
    }
  }
  return changed
}

async function fetchAndStoreGroups() {
  if (!sock || !connected) return
  try {
    momai.log('Fetching participating WhatsApp groups...')
    const groups = await sock.groupFetchAllParticipating()
    if (groups && typeof groups === 'object') {
      let added = 0
      let updated = 0
      const groupEntries = Object.entries<any>(groups)
      await _forEachYield(groupEntries, (entry) => {
        const [jid, meta] = entry
        if (!jid.endsWith('@g.us')) return
        groupMetaCache.set(jid, { data: meta, fetchedAt: Date.now() })

        const subjectName = meta.subject ? String(meta.subject).trim() : null
        const formattedName = _isUsableDisplayName(subjectName) ? subjectName : 'Grupo'

        if (!waContacts[jid]) {
          waContacts[jid] = {
            id: jid,
            name: formattedName,
            notify: null,
            verifiedName: null,
            phone: null,
            lid: null
          }
          added++
        } else {
          if (_isUsableDisplayName(subjectName)) {
            waContacts[jid].name = subjectName
          }
          updated++
        }
      })
      if (added > 0 || updated > 0) {
        await momai.storage.set(_getWaContactsKey(), waContacts)
        momai.log(
          `Groups updated: ${added} new groups, ${updated} updated, ${Object.keys(waContacts).length} total waContacts`
        )
        _notifyContactsUpdated()
      }

      // Remove do cache grupos em que o número não participa mais (JID velho
      // de grupo excluído/removido). Sem isso, o nome do grupo continua
      // resolvendo para o JID fantasma e o envio é recusado pelo WhatsApp
      // com "not-acceptable" (não-membro). Só poda quando o fetch retornou a
      // lista real de grupos participados (evita apagar tudo em fetch parcial).
      const participating = new Set(Object.keys(groups))
      if (participating.size > 0) {
        let pruned = 0
        await _forEachYield(Object.keys(waContacts), (jid) => {
          if (jid.endsWith('@g.us') && !participating.has(jid)) {
            delete waContacts[jid]
            groupMetaCache.delete(jid)
            pruned++
          }
        })
        if (pruned > 0) {
          await momai.storage.set(_getWaContactsKey(), waContacts)
          momai.log(`Groups pruned: removed ${pruned} stale group(s) not in participating list`)
        }
      }
    }
  } catch (err) {
    momai.log(`Failed to fetch groups: ${err.message}`)
  }
}

function populateContactsFromChatHistory() {
  let added = 0
  for (const m of chatHistory) {
    if (!m.jid) continue
    if (m.jid.endsWith('@g.us')) continue

    const jid = m.jid
    const phone = jid.split('@')[0].replace(/\D/g, '')
    if (!phone) continue

    const label = _pickContactLabel(
      contactNames[jid],
      contactNames[phone],
      m.contactName,
      m.pushName,
      m.senderName
    )

    if (!waContacts[jid]) {
      waContacts[jid] = {
        id: jid,
        name: null,
        notify: label,
        verifiedName: null,
        phone,
        lid: null
      }
      added++
    } else if (label && !waContacts[jid].name && !waContacts[jid].notify) {
      waContacts[jid].notify = label
      added++
    }
  }
  return added
}
let chatHistory: any[] = []
let totalMessages = 0
let _currentPhone: string | null = null
let receivedJids = new Set()

function _messageCacheKey(key) {
  if (!key?.id) return null
  return `${key.remoteJid || ''}:${key.id}`
}

function _trimMessageCaches(max = CACHE_TRIM_TARGET) {
  while (sentMessagesCache.size > max) {
    const firstKey = sentMessagesCache.keys().next().value
    sentMessagesCache.delete(firstKey)
  }
  while (messageStore.size > max) {
    const firstKey = messageStore.keys().next().value
    messageStore.delete(firstKey)
  }
}

function cacheMessage(key, message) {
  if (!key?.id || !message) return
  sentMessagesCache.set(key.id, message)
  const composite = _messageCacheKey(key)
  if (composite) messageStore.set(composite, message)
  _trimMessageCaches()
  queueSaveMessageCaches()
}

/**
 * Stale sender-key-memory makes Baileys skip SKDM distribution → "Aguardando mensagem" in groups.
 *
 * Só a MEMÓRIA de sender-key é resetada (via keys.set com null, o mesmo mecanismo
 * que o próprio Baileys usa em sendMessagesAgain). Os arquivos `sender-key-*.json`
 * (as chaves criptográficas do grupo) NÃO são apagados do disco em runtime: o
 * Baileys com useMultiFileAuthState lê do disco a cada operação, e apagar as
 * chaves enquanto conectado corrompe o estado → mensagens do grupo falham na
 * decriptação → handleLogEvent → repairSession → loop de ressincronização.
 */
async function resetGroupSenderKeyMemory(groupJid) {
  if (!groupJid?.endsWith('@g.us')) return

  if (sock?.authState?.keys?.set) {
    try {
      // null → removeData (com o file-lock do Baileys), forçando re-distribuição
      // de SKDM na próxima mensagem do grupo. É o comportamento canônico.
      await sock.authState.keys.set({ 'sender-key-memory': { [groupJid]: null } })
      momai.log(`Cleared sender-key-memory for ${groupJid}`)
    } catch (e) {
      momai.log(`Failed to reset in-memory sender-key-memory: ${e.message}`)
    }
  }
}

function isSenderKeyMemoryStale(groupJid, participantIds) {
  if (!participantIds?.length) return false

  const fsSync = require('fs')
  const memFile = path.join(
    momai.storage.storageDir,
    'baileys-auth',
    `sender-key-memory-${groupJid}.json`
  )
  if (!fsSync.existsSync(memFile)) return true

  try {
    const mem = JSON.parse(fsSync.readFileSync(memFile, 'utf-8'))
    const marked = Object.keys(mem).filter((k) => mem[k])
    if (marked.length === 0) return true

    const participantBases = new Set(
      participantIds.map((p) => (p || '').split('@')[0].split(':')[0]).filter(Boolean)
    )
    if (participantBases.size === 0) return false

    let covered = 0
    for (const base of participantBases) {
      if (marked.some((m) => m.split('@')[0].split(':')[0] === base)) covered++
    }
    // Se faltar algum participante em grupos pequenos (ou mais de 10% em grupos grandes),
    // a memória está desatualizada e deve ser refeita para evitar 'Aguardando mensagem'.
    const requiredCoverage =
      participantBases.size <= 5
        ? participantBases.size
        : Math.ceil(participantBases.size * 0.9)
    return covered < requiredCoverage
  } catch {
    return true
  }
}

async function prepareGroupForSend(groupJid) {
  if (!sock || !connected) return

  let meta
  try {
    // Best-effort: se o metadata não chegar em 5s, segue com o envio mesmo
    // assim (o check de sender-key-memory é apenas um heal). Antes eram 15s,
    // o que sozinho já estourava o timeout do painel em grupos grandes.
    meta = await withTimeout(sock.groupMetadata(groupJid), 5000)
    groupMetaCache.set(groupJid, { data: meta, fetchedAt: Date.now() })
  } catch (e) {
    momai.log(`prepareGroupForSend metadata: ${e.message}`)
    return
  }

  const participantIds = meta?.participants?.map((p) => p.id) || []
  momai.log(`prepareGroupForSend: ${groupJid} participants=${JSON.stringify(participantIds)}`)

  if (isSenderKeyMemoryStale(groupJid, participantIds)) {
    momai.log(
      `prepareGroupForSend: stale sender-key-memory for ${groupJid} (${participantIds.length} participants)`
    )
    await resetGroupSenderKeyMemory(groupJid)
  }
}

async function getGroupParticipants(groupJid) {
  if (!sock || !connected || !groupJid) {
    return { ok: false, error: 'WhatsApp desconectado ou JID de grupo inválido', participants: [] }
  }

  let meta
  try {
    meta = await withTimeout(sock.groupMetadata(groupJid), 10000)
    groupMetaCache.set(groupJid, { data: meta, fetchedAt: Date.now() })
  } catch (err) {
    const cached = groupMetaCache.get(groupJid)
    if (cached?.data) {
      meta = cached.data
    } else {
      momai.log(`getGroupParticipants failed: ${err.message}`)
      return { ok: false, error: err.message, participants: [] }
    }
  }

  const rawParticipants = meta?.participants || []
  const participants = rawParticipants.map((p) => {
    const jid = p.id
    const rawNumber = (jid || '').split('@')[0] || ''
    const name = resolveContactName(jid)
    const avatar = getStoredAvatarUrl(jid)
    const isAdmin = p.admin === 'admin' || p.admin === 'superadmin'
    return {
      id: jid,
      phone: rawNumber,
      name: name || _formatPhoneLabel(rawNumber),
      admin: isAdmin ? (p.admin === 'superadmin' ? 'Superadmin' : 'Admin') : undefined,
      avatar: avatar || null
    }
  })

  // Ordenar: admins primeiro, depois alfabética
  participants.sort((a, b) => {
    if (a.admin && !b.admin) return -1
    if (!a.admin && b.admin) return 1
    return (a.name || '').localeCompare(b.name || '', 'pt-BR')
  })

  return {
    ok: true,
    groupJid,
    groupName: meta?.subject || 'Grupo',
    participants
  }
}

function _getDisabledContactsKey() {
  return _currentPhone ? `disabled_contacts-${_currentPhone}` : DISABLED_CONTACTS_KEY
}

function _getContactNamesKey() {
  return _currentPhone ? `contact_names-${_currentPhone}` : CONTACT_NAMES_KEY
}

function _getWaContactsKey() {
  return _currentPhone ? `wa_contacts-${_currentPhone}` : WA_CONTACTS_KEY
}

function _getSettingsKey() {
  return _currentPhone ? `settings-${_currentPhone}` : SETTINGS_KEY
}

function _getChatHistoryKey() {
  return _currentPhone ? `${CHAT_HISTORY_KEY}-${_currentPhone}` : CHAT_HISTORY_KEY
}

let _contactsUpdatedTimer = null
function _notifyContactsUpdated() {
  if (_contactsUpdatedTimer) return
  _contactsUpdatedTimer = setTimeout(() => {
    _contactsUpdatedTimer = null
    momai.sendEvent('contacts_updated', {})
  }, 1000)
}

/**
 * Persistência agrupada do waContacts para updates de avatar (foto por foto).
 * Antes, cada perfil resolvido fazia `storage.set(_getWaContactsKey(), waContacts)`
 * — fetch paginado com N contatos = N writes síncronos + N eventos. Aqui a escrita
 * é serializada 1× por janela (1500ms), após todas as mutações do lote.
 */
let waContactsPersistTimer = null
let waContactsDirty = false
function _scheduleWaContactsPersist({ emitEvent = true } = {}) {
  waContactsDirty = true
  if (waContactsPersistTimer) return
  waContactsPersistTimer = setTimeout(async () => {
    waContactsPersistTimer = null
    if (!waContactsDirty) return
    waContactsDirty = false
    try {
      await momai.storage.set(_getWaContactsKey(), waContacts)
      // Por padrão emite contacts_updated para manter a UI sincronizada.
      // Passar { emitEvent: false } para evitar loops (ex: retry de avatar).
      if (emitEvent) {
        _notifyContactsUpdated()
      }
    } catch (err) {
      momai.log(`[whatsapp] Failed to persist waContacts (avatars): ${err.message}`)
    }
  }, 1500)
}

function buildPersistedHistorySnapshot(limit = MAX_PERSISTED_CONVERSATIONS) {
  if (chatHistory.length === 0) return []

  const latestByJid = new Map()
  for (const m of chatHistory) {
    const ts = Number(m.timestamp) || 0
    const prev = latestByJid.get(m.jid) || 0
    if (ts > prev) latestByJid.set(m.jid, ts)
  }

  const keepJids = new Set(
    [...latestByJid.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([jid]) => jid)
  )

  return chatHistory.filter((m) => keepJids.has(m.jid))
}

/** Grava em disco as 3 conversas mais recentes sem alterar o historico em memoria. */
async function persistChatHistorySnapshot() {
  try {
    const snapshot = buildPersistedHistorySnapshot()
    if (snapshot.length === 0) return
    await momai.storage.set(_getChatHistoryKey(), snapshot)
  } catch (e) {
    momai.log(`persistChatHistorySnapshot: ${e.message}`)
  }
}

/** Ao fechar o app: grava snapshot e alinha memoria ao que foi salvo. */
async function flushPersistedChatHistory() {
  if (chatHistory.length === 0) return
  try {
    chatHistory = buildPersistedHistorySnapshot()
    await momai.storage.set(_getChatHistoryKey(), chatHistory)
  } catch (e) {
    momai.log(`flushPersistedChatHistory: ${e.message}`)
  }
}

async function loadChatHistory() {
  if (chatHistory.length > 0) return true
  try {
    const keys = [
      ...new Set([_currentPhone ? _getChatHistoryKey() : null, CHAT_HISTORY_KEY].filter(Boolean))
    ]
    for (const key of keys) {
      const saved = await momai.storage.get(key)
      if (!Array.isArray(saved) || saved.length === 0) continue
      chatHistory = saved.map(enrichHistoryEntry)
      totalMessages = Math.max(totalMessages, chatHistory.length)
      momai.log(`loadChatHistory: ${saved.length} msgs from ${key}`)
      schedulePersistChatHistory()
      return true
    }
  } catch (e) {
    momai.log(`loadChatHistory: ${e.message}`)
  }
  return false
}

let _persistHistoryTimer = null
function schedulePersistChatHistory() {
  if (_persistHistoryTimer) clearTimeout(_persistHistoryTimer)
  _persistHistoryTimer = setTimeout(() => {
    _persistHistoryTimer = null
    persistChatHistorySnapshot().catch(() => {})
  }, 2000)
}

function resolveStandardJid(jid) {
  if (!jid) return null

  // Strip Baileys device suffix (e.g. 55...:1@s.whatsapp.net -> 55...@s.whatsapp.net)
  let standard = jid
  if (jid.includes(':') && jid.includes('@')) {
    const [user, domain] = jid.split('@')
    standard = user.split(':')[0] + '@' + domain
  }

  const rawNumber = standard.split('@')[0]

  // Try to find by LID mapping
  const matchByLid = Object.values<any>(waContacts).find(
    (c) => c.lid === standard || c.lid === rawNumber
  )
  if (matchByLid) return matchByLid.id

  // Try to find by phone (for LID-like JIDs that are actually mapped)
  const matchByPhone = Object.values<any>(waContacts).find((c) => c.phone === rawNumber)
  if (matchByPhone) return matchByPhone.id

  return standard
}

/** DM via @lid: Baileys may put a @g.us JID in participant — ignore for 1:1 chats. */
function resolveMessageSenderJid(remoteJid, participant) {
  const isGroup = remoteJid?.endsWith('@g.us')
  if (isGroup) {
    const sender = participant || remoteJid
    return resolveStandardJid(sender) || sender
  }
  if (participant && !participant.endsWith('@g.us')) {
    return resolveStandardJid(participant) || participant
  }
  return resolveStandardJid(remoteJid) || remoteJid
}

function enrichHistoryEntry(h) {
  if (!h) return h
  const remoteJid = h.jid || ''
  const isGroupChat = remoteJid.endsWith('@g.us')

  let senderJid = h.senderJid || remoteJid
  if (!isGroupChat && senderJid.endsWith('@g.us')) {
    senderJid = resolveStandardJid(remoteJid) || remoteJid
  } else {
    senderJid = resolveMessageSenderJid(remoteJid, isGroupChat ? h.senderJid : senderJid)
  }

  const replyJid = isGroupChat ? remoteJid : resolveStandardJid(remoteJid) || remoteJid

  const timestamp = h.timestamp ? Number(h.timestamp) : Math.floor(Date.now() / 1000)

  const groupLabel = _pickContactLabel(
    contactNames[remoteJid],
    waContacts[remoteJid]?.name,
    waContacts[remoteJid]?.verifiedName,
    h.groupName
  )

  let from = isGroupChat
    ? groupLabel || resolveContactName(remoteJid) || h.from || 'Grupo'
    : resolveContactName(senderJid) || resolveContactName(remoteJid) || h.from

  return {
    ...h,
    jid: remoteJid,
    senderJid,
    replyJid,
    timestamp,
    from,
    isGroup: isGroupChat,
    groupName: isGroupChat ? groupLabel || resolveContactName(remoteJid) || from : null,
    profilePicUrl: resolveChatAvatarUrl(remoteJid, isGroupChat, senderJid)
  }
}

function resolveContactName(jid) {
  if (!jid) return ''

  jid = resolveStandardJid(jid)

  if (jid.endsWith('@lid')) {
    if (waContacts[jid]) {
      return _resolveWaContactDisplayName(waContacts[jid], jid)
    }
    const matched = Object.values<any>(waContacts).find((c) => c.lid === jid)
    if (matched) {
      return resolveContactName(matched.id)
    }
  }

  const rawNumber = jid.split('@')[0]
  const digitsOnly = rawNumber.replace(/\D/g, '')

  // Try exact match in contactNames
  const customByJid = _pickContactLabel(contactNames[jid])
  if (customByJid) return customByJid
  const customByNumber = _pickContactLabel(contactNames[rawNumber])
  if (customByNumber) return customByNumber
  const customByDigits = _pickContactLabel(contactNames[digitsOnly])
  if (customByDigits) return customByDigits

  // Try partial digit match in contactNames
  for (const key of Object.keys(contactNames)) {
    const keyDigits = String(key).replace(/\D/g, '')
    if (
      keyDigits &&
      keyDigits.length >= 8 &&
      (digitsOnly.endsWith(keyDigits) || keyDigits.endsWith(digitsOnly))
    ) {
      const matched = _pickContactLabel(contactNames[key])
      if (matched) return matched
    }
  }

  const wc =
    waContacts[jid] || Object.values<any>(waContacts).find((c) => c.id.split('@')[0] === rawNumber)
  if (wc) return _resolveWaContactDisplayName(wc, jid)

  for (const [key, contact] of Object.entries<any>(waContacts)) {
    const keyDigits = key.split('@')[0].replace(/\D/g, '')
    if (keyDigits && (digitsOnly.endsWith(keyDigits) || keyDigits.endsWith(digitsOnly))) {
      return _resolveWaContactDisplayName(contact, key)
    }
  }

  if (jid.endsWith('@g.us')) return 'Grupo'
  return _formatPhoneLabel(rawNumber)
}

function getStoredAvatarUrl(jid) {
  if (!jid || !waContacts[jid]) return null
  return waContacts[jid].profilePicUrl || null
}

function resolveChatAvatarUrl(jid, isGroup, senderJid) {
  if (!jid) return null
  if (isGroup || jid.endsWith('@g.us')) {
    return getStoredAvatarUrl(jid)
  }
  const direct = getStoredAvatarUrl(jid)
  if (direct) return direct
  const standard = resolveStandardJid(jid)
  if (standard && standard !== jid) {
    const fromStandard = getStoredAvatarUrl(standard)
    if (fromStandard) return fromStandard
  }
  if (senderJid && !senderJid.endsWith('@g.us')) {
    return getStoredAvatarUrl(senderJid)
  }
  return null
}

async function ensureAvatarForJid(jid, opts: any = {}) {
  if (!jid) return null

  const cached = getStoredAvatarUrl(jid)
  if (!sock || !connected) return cached

  if (!waContacts[jid]) {
    if (jid.endsWith('@g.us')) {
      waContacts[jid] = {
        id: jid,
        name: 'Grupo',
        phone: jid.split('@')[0]
      }
    } else if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')) {
      waContacts[jid] = {
        id: jid,
        name: resolveContactName(jid),
        phone: jid.split('@')[0]
      }
    } else {
      return cached
    }
  }

  const entry = waContacts[jid]
  const force = opts?.force === true

  // Já existe foto válida no banco: nunca refetch automático. Somente com
  // force=true (botão "Atualizar fotos de perfil") a API é consultada de novo.
  if (!force && entry.profilePicUrl) return entry.profilePicUrl

  const now = Date.now()
  const ONE_DAY = 24 * 60 * 60 * 1000
  const RETRY_DELAY = 10 * 60 * 1000
  const lastChecked = entry.profilePicCheckedAt || 0
  const isFailedRecently = !force && !entry.profilePicUrl && now - lastChecked < RETRY_DELAY

  if (isFailedRecently) {
    return entry.profilePicUrl || null
  }

  try {
    const url = await withTimeout(sock.profilePictureUrl(jid, 'image'), 5000)
    entry.profilePicUrl = url
    entry.profilePicCheckedAt = now
    _scheduleWaContactsPersist({ emitEvent: false })
    return url
  } catch {
    // Cooldown real: isFailedRecently usa (now - lastChecked < RETRY_DELAY),
    // então now é suficiente para impedir retry por 10 min.
    entry.profilePicCheckedAt = now
    _scheduleWaContactsPersist({ emitEvent: false })
    return entry.profilePicUrl || null
  }
}

function _isContactDisabled(jid) {
  const rawNumber = (jid || '').split('@')[0] || jid
  const digitsOnly = rawNumber.replace(/\D/g, '')
  return disabledContacts.some((d) => {
    const dDigits = String(d).replace(/\D/g, '')
    return (
      d === jid ||
      d === rawNumber ||
      (dDigits && digitsOnly && (dDigits.endsWith(digitsOnly) || digitsOnly.endsWith(dDigits)))
    )
  })
}

/** Normaliza um contato (nome/número/JID) para um JID canônico para o
 * disabledContacts. Se não resolve, vira `dígitos@s.whatsapp.net`. */
function _normalizeContactId(raw) {
  const resolved = resolveJidForSending(raw)
  if (resolved && resolved.includes('@')) return resolved
  const digits = String(raw).replace(/\D/g, '')
  return digits ? `${digits}@s.whatsapp.net` : String(raw).trim()
}

function _cleanupStaleContacts() {
  let changed = false
  const standardLids = new Set(
    Object.values<any>(waContacts)
      .filter((c) => c.id && !c.id.endsWith('@lid') && c.lid)
      .map((c) => c.lid)
  )

  for (const key of Object.keys(waContacts)) {
    if (key.endsWith('@lid')) {
      const contact = waContacts[key]
      const hasName = contact.name || contact.verifiedName || contact.notify
      if (standardLids.has(key) || !hasName) {
        delete waContacts[key]
        changed = true
        delete contactNames[key]
        const rawNumber = key.split('@')[0]
        if (rawNumber) {
          delete contactNames[rawNumber]
        }
      }
    }
  }
  return changed
}

async function _loadPerPhoneData() {
  try {
    const credsPath = path.join(momai.storage.storageDir, 'baileys-auth', 'creds.json')
    const content = await fs.readFile(credsPath, 'utf-8')
    const creds = JSON.parse(content)
    if (creds.me?.id) {
      const phone = creds.me.id.split(':')[0].replace(/\D/g, '')
      if (!phone) return
      _currentPhone = phone
      const dc = await momai.storage.get(_getDisabledContactsKey())
      if (dc) disabledContacts = dc
      const pn = await momai.storage.get(_getContactNamesKey())
      if (pn) contactNames = pn
      const wc = await momai.storage.get(_getWaContactsKey())
      if (wc) waContacts = wc
      const st = await momai.storage.get(_getSettingsKey())
      if (st) {
        if (st.notificationsDisabled !== undefined) notificationsDisabled = st.notificationsDisabled
      }

      let storageDirty = false
      if (_cleanupStaleContacts()) storageDirty = true
      if (_sanitizeStoredContactNames()) storageDirty = true
      if (storageDirty) {
        await momai.storage.set(_getWaContactsKey(), waContacts)
        await momai.storage.set(_getContactNamesKey(), contactNames)
        momai.log('Cleaned up stale or placeholder WhatsApp contacts from phone storage')
      }

      await loadChatHistory()
    }
  } catch {
    momai.log('_loadPerPhoneData: no creds.json (fresh start)')
  }
}

async function main() {
  // Acquire single instance lock
  await acquireLock()

  // Load message caches from storage
  await loadMessageCaches()

  // Load whitelist (generic fallback)
  disabledContacts = (await momai.storage.get(DISABLED_CONTACTS_KEY)) || []
  contactNames = (await momai.storage.get(CONTACT_NAMES_KEY)) || {}
  waContacts = (await momai.storage.get(WA_CONTACTS_KEY)) || {}

  // Try to load per-phone data from existing creds (includes chat history)
  await _loadPerPhoneData()
  if (!chatHistory.length) {
    await loadChatHistory()
  }

  if (_cleanupStaleContacts() || _sanitizeStoredContactNames()) {
    await momai.storage.set(WA_CONTACTS_KEY, waContacts)
    await momai.storage.set(CONTACT_NAMES_KEY, contactNames)
    momai.log('Cleaned up stale or placeholder WhatsApp contacts from fallback storage')
  }

  // Signal ready BEFORE connect() — evita travar o Node no pós-install.
  // Antes, o host esperava 10s por 'ready' enquanto connect() fazia Baileys + decrypt.
  // Se connect() falhasse ou demorasse, GET /automations e /llm/providers ficavam presos.
  process.send({ type: 'ready' })

  setInterval(() => {
    persistChatHistorySnapshot().catch(() => {})
  }, 30000)

  // Só auto-conecta se já tem creds (já escaneou QR antes). Sem QR, fica dormindo sem carregar Baileys (1.7s) até o usuário clicar em Conectar
  try {
    const fsSync = require('node:fs')
    const pathSync = require('node:path')
    const authDir = pathSync.join(momai.storage.storageDir, 'baileys-auth')
    const credsFile = pathSync.join(authDir, 'creds.json')
    const encCredsFile = pathSync.join(authDir, 'creds.json.enc')
    const hasCreds = fsSync.existsSync(credsFile) || fsSync.existsSync(encCredsFile)
    if (hasCreds) {
      loadBaileys()
      connect().catch((err) => momai.log(`[fix] connect async failed (não bloqueia ready): ${err.message}`))
    } else {
      momai.log('[whatsapp] Sem creds, aguardando QR (não carrega Baileys, não segura thread)')
    }
  } catch (err: any) {
    momai.log(`[whatsapp] Erro na checagem inicial de creds: ${err.message}`)
  }
  if (chatHistory.length > 0) {
    momai.sendEvent('history_loaded', { count: chatHistory.length })
  }

  // Periodic heartbeat — keeps SSE clients aware of current state
  setInterval(() => {
    momai.sendEvent('connection_status', { status: connected ? 'connected' : 'disconnected' })
  }, 15000)
}

async function connect() {
  if (isConnecting) return
  isConnecting = true
  _clearReconnectTimer()
  loadBaileys()

  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners('connection.update')
        sock.ev.removeAllListeners('creds.update')
        sock.ev.removeAllListeners('messages.upsert')
        sock.end(undefined)
      } catch (e) {
        momai.log(`Error closing old socket: ${e.message}`)
      }
      sock = null
    }

    receivedJids.clear()
    const version = await getBaileysVersion()
    const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
    const hasCreds = _hasSavedSession()
    momai.log(`connect: savedSession=${hasCreds}`)
    // Decrypt creds.json.enc → creds.json before Baileys reads it, and
    // migrate any legacy plain creds.json to creds.json.enc on first run.
    // Trade-off: plain creds.json lives on disk while Baileys is running.
    await migratePlainCredsToEncrypted(authDir)
    const decrypted = await decryptCredsForBaileys(authDir)
    // Guard against silent auth loss: if creds.json.enc exists but the
    // decrypt call failed (e.g. OS keychain locked, safeStorage flipped
    // unavailable), do NOT let useMultiFileAuthState create a fresh
    // creds.json — that would overwrite the encrypted session on the
    // next re-encrypt and silently log the user out. Surface the error
    // and exit so the host can prompt the user to re-pair.
    const encCredsPath = path.join(authDir, 'creds.json.enc')
    const plainCredsPath = path.join(authDir, 'creds.json')
    const encCredsExists = await fs.access(encCredsPath).then(
      () => true,
      () => false
    )
    const plainCredsExists = await fs.access(plainCredsPath).then(
      () => true,
      () => false
    )
    if (encCredsExists && !plainCredsExists && !decrypted) {
      momai.log(
        '[whatsapp] WARN: creds.json.enc could not be decrypted ' +
          '(safeStorage unavailable?). Keeping encrypted creds; Baileys will ' +
          'request a new QR if it cannot use them.'
      )
    }
    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    // Setup logger with pino or fallback, redirecting warning/error events to momai.log
    let logger
    if (pino) {
      logger = pino(
        { level: 'warn' },
        {
          write: (msg) => {
            try {
              const parsed = JSON.parse(msg)
              let levelStr = 'WARN'
              if (parsed.level >= 50) levelStr = 'ERROR'
              const detail = parsed.err?.message || parsed.error || ''
              momai.log(`[Baileys:${levelStr}] ${parsed.msg} ${detail ? '(' + detail + ')' : ''}`)
              if (parsed.level >= 40) {
                handleLogEvent(parsed)
              }
            } catch {
              momai.log(`[Baileys] ${msg}`)
            }
          }
        }
      )
    } else {
      const makeMockLogger = () => {
        const mock = {
          info: () => {},
          debug: () => {},
          warn: (obj, msg) => {
            momai.log(`[Baileys:WARN] ${msg || JSON.stringify(obj)}`)
            handleLogEvent(obj, msg)
          },
          error: (obj, msg) => {
            momai.log(`[Baileys:ERROR] ${msg || JSON.stringify(obj)}`)
            handleLogEvent(obj, msg)
          },
          trace: () => {},
          child: () => mock
        }
        return mock
      }
      logger = makeMockLogger()
    }

    // Cache signal keys in memory to prevent Bad MAC and session desyncs under load
    const authConfig = {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore
        ? makeCacheableSignalKeyStore(state.keys, logger)
        : state.keys
    }

    sock = makeWASocket({
      version,
      auth: authConfig,
      logger,
      printQRInTerminal: false,
      emitOwnEvents: false,
      fireInitQueries: true,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      msgRetryCounterCache,
      browser: ['Windows', 'Chrome', '122.0.0'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      defaultQueryTimeoutMs: 60000,
      cachedGroupMetadata: async (jid) => {
        const entry = groupMetaCache.get(jid)
        if (entry && Date.now() - entry.fetchedAt < 5 * 60 * 1000) {
          return entry.data
        }
        return undefined
      },
      getMessage: async (key) => {
        if (!key?.id) return { conversation: '' }
        const composite = _messageCacheKey(key)
        if (composite && messageStore.has(composite)) {
          return messageStore.get(composite)
        }
        const cached = sentMessagesCache.get(key.id)
        if (cached) return cached
        // Se a chave contiver um JID com dígito extra (ou sem), tentar fallback por dígitos no messageStore
        if (key.id && key.remoteJid) {
          const targetDigits = key.remoteJid.replace(/[^0-9]/g, '')
          for (const [k, msg] of messageStore.entries()) {
            const [storeJid, storeId] = k.split(':')
            if (storeId === key.id && storeJid) {
              const storeDigits = storeJid.replace(/[^0-9]/g, '')
              if (storeDigits && targetDigits && (storeDigits === targetDigits || storeDigits.endsWith(targetDigits) || targetDigits.endsWith(storeDigits))) {
                return msg
              }
            }
          }
        }
        // Proto vazio: deixa o Baileys completar retries de mensagens enviadas
        // (sendMessagesAgain) em vez de travar no relógio "Aguardando mensagem".
        return { conversation: '' }
      }
    })

    sock.ev.on('creds.update', () => {
      saveCreds()
      _scheduleReEncrypt()
    })

    sock.ev.on('connection.update', async (update) => {
      const { qr, connection, lastDisconnect } = update
      momai.log(`conn: qr=${!!qr} ${connection}`)

      if (qr) {
        _emitQrCode(qr)
        momai.log('QR_CODE_EVENT_SENT')
      }

      if (connection === 'open') {
        _clearReconnectTimer()
        isConnecting = false
        lastQr = null
        lastQrAt = 0
        connected = true
        resetReconnectBackoff()
        groupMetaCache.clear()
        _markSyncingContacts()

        // Diagnóstico (só log, não muda fluxo): sessão com registro incompleto no
        // servidor (creds.registered=false) aceita envios mas NÃO entrega mensagens
        // de grupo (ficam presas no relógio "Aguardando mensagem"). A correção é
        // reconectar o WhatsApp (QR novo) e confirmar no celular.
        const registered = !!sock?.authState?.creds?.registered
        if (!registered) {
          momai.log(
            '[whatsapp] WARN: creds.registered=false — sessão não registrada no servidor. ' +
              'Envio de grupo pode não entregar. Reconecte o WhatsApp (Desconectar → Reconectar) e confirme no celular.'
          )
        }

        // Baileys has loaded creds.json and is running. Write a best-effort
        // encrypted backup (creds.json.enc). The plain creds.json is KEPT: it is
        // Baileys' working copy, and the session must survive restarts even when
        // safeStorage is unavailable or the ciphertext turns out corrupt.
        reEncryptCredsAfterBaileys(authDir).catch((err) =>
          momai.log(`post-connect re-encrypt failed: ${err.message}`)
        )

        // Detect phone number and load per-phone whitelist
        try {
          const phone = (sock?.user?.id || sock?.authState?.creds?.me?.id || '')
            .split(':')[0]
            .replace(/\D/g, '')
          if (phone && phone !== _currentPhone) {
            _currentPhone = phone

            const dc = await momai.storage.get(_getDisabledContactsKey())
            if (dc) {
              disabledContacts = dc
            } else if (disabledContacts && disabledContacts.length > 0) {
              await momai.storage.set(_getDisabledContactsKey(), disabledContacts)
            } else {
              disabledContacts = []
            }

            const pn = await momai.storage.get(_getContactNamesKey())
            if (pn && Object.keys(pn).length > 0) {
              contactNames = { ...pn, ...contactNames }
              await momai.storage.set(_getContactNamesKey(), contactNames)
            } else if (contactNames && Object.keys(contactNames).length > 0) {
              await momai.storage.set(_getContactNamesKey(), contactNames)
            }

            const wc = await momai.storage.get(_getWaContactsKey())
            if (wc && Object.keys(wc).length > 0) {
              waContacts = { ...wc, ...waContacts }
            } else if (waContacts && Object.keys(waContacts).length > 0) {
              await momai.storage.set(_getWaContactsKey(), waContacts)
            } else {
              const genericWc = await momai.storage.get(WA_CONTACTS_KEY)
              if (genericWc && Object.keys(genericWc).length > 0) {
                waContacts = { ...genericWc, ...waContacts }
                await momai.storage.set(_getWaContactsKey(), waContacts)
              }
            }

            if (_cleanupStaleContacts()) {
              await momai.storage.set(_getWaContactsKey(), waContacts)
              await momai.storage.set(_getContactNamesKey(), contactNames)
              momai.log('Automatically cleaned up stale @lid contacts on active phone detection')
            }
          }
          if (phone && !chatHistory.length) {
            await loadChatHistory()
          }
          populateContactsFromChatHistory()
          fetchAndStoreGroups().catch(() => {})
          // Retry único: se o fetch de grupos inicial falhou ou veio vazio,
          // tenta de novo em seguida — o envio por NOME de grupo depende do
          // cache populado (a resolução sob demanda do send é o segundo plano).
          setTimeout(() => {
            const hasGroups = Object.values<any>(waContacts).some(
              (c) => c && c.id && c.id.endsWith('@g.us')
            )
            if (!hasGroups) fetchAndStoreGroups().catch(() => {})
          }, 10000)
          _notifyContactsUpdated()
        } catch {}
        momai.sendEvent('authenticated', { status: 'connected' })
        momai.sendEvent('connection_status', { status: 'connected' })
        momai.sendEvent('history_loaded', { count: chatHistory.length })
        momai.log('WhatsApp connected')

        // Notify contacts sync complete without destructively deleting existing contacts
        setTimeout(async () => {
          try {
            const total = Object.values<any>(waContacts).filter(
              (c) => c.phone && !c.id.endsWith('@g.us')
            ).length
            momai.sendEvent('contacts_synced', { count: total, isFinal: true })
          } catch (err) {
            momai.log(`Error finalizing contact sync event: ${err.message}`)
          }
        }, 3000)
      } else if (connection === 'close') {
        connected = false
        isConnecting = false
        // Move creds back to encrypted-at-rest before the next reconnect.
        reEncryptCredsAfterBaileys(authDir).catch((err) =>
          momai.log(`post-close re-encrypt failed: ${err.message}`)
        )
        if (preventAutoReconnect) {
          preventAutoReconnect = false
          momai.sendEvent('authenticated', { status: 'logged_out' })
          momai.sendEvent('connection_status', { status: 'disconnected' })
          return
        }
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut
        if (shouldReconnect) {
          momai.log(
            `[whatsapp] Connection closed (statusCode=${statusCode}, reason=${lastDisconnect?.error?.message || 'unknown'}). Reconnecting.`
          )
          momai.sendEvent('connection_status', { status: 'reconnecting' })
          _clearReconnectTimer()
          const delay = nextReconnectDelay()
          reconnectTimer = setTimeout(connect, delay)
        } else {
          // LOGGED OUT: Baileys confirmed the stored creds are invalid.
          // Wipe the auth dir immediately and trigger a fresh connection
          // so the user sees a QR without having to navigate to the page
          // (the UI's beginPairing() flow used to do this, but it raced
          // with the page load and wiped prematurely on every open).
          momai.log('WhatsApp logged out — wiping stale auth dir for fresh re-pair')
          try {
            const fsSync = require('fs')
            if (fsSync.existsSync(authDir)) {
              fsSync.rmSync(authDir, { recursive: true, force: true })
            }
          } catch (err) {
            momai.log(`logged-out wipe failed: ${err.message}`)
          }
          lastQr = null
          lastQrAt = 0
          momai.sendEvent('authenticated', { status: 'logged_out' })
          momai.sendEvent('connection_status', { status: 'disconnected' })
          _clearReconnectTimer()
          // Sem QR, espera 5s em vez de 500ms para não segurar thread pool do Node
          setTimeout(() => {
            connect().catch((err) => momai.log(`post-loggedout connect failed: ${err.message}`))
          }, 5000)
        }
      }
    })

    sock.ev.on('messaging-history.set', async ({ contacts: syncedContacts, chats: syncedChats, messages: syncedMessages }) => {
      _markSyncingContacts()
      const before = Object.keys(waContacts).length
      let added = 0
      let updated = 0
      let lidCount = 0

      if (syncedContacts?.length) {
        momai.log(`History sync: received ${syncedContacts.length} contacts`)
        await _forEachYield(syncedContacts, (c) => {
          if (c.id) receivedJids.add(c.id)
        })

        // Pré-computa o índice verifiedName→jid UMA vez por lote. Antes, cada
        // contato @lid fazia Object.values(waContacts).find() — O(n²) com
        // ~950 LIDs × ~1448 contatos (~1,4M de comparações por lote), e ainda
        // logava cada LID (centenas de writes síncronos que bloqueiam o event
        // loop). O worker ficava dezenas de segundos sem processar comandos
        // (send_message pendurava e o overlay travava).
        const byVerifiedName = new Map()
        await _forEachYield(Object.values<any>(waContacts), (existing) => {
          if (existing.verifiedName) {
            if (!byVerifiedName.has(existing.verifiedName)) {
              byVerifiedName.set(existing.verifiedName, existing)
            }
          }
        })

        // Processa o lote em chunks com yield do event loop: sem isso o worker
        // fica "dezenas de segundos" sem processar comandos IPC (send_message
        // pendura e estoura o timeout de 30s do host). (ver _forEachYield)
        await _forEachYield(syncedContacts, (c) => {
          if (!c.id) return

          // For @lid contacts, try to resolve to a standard JID or store with verifiedName (Business)
          if (c.id.endsWith('@lid')) {
            lidCount++
            const existingMatch = byVerifiedName.get(c.verifiedName)
            if (existingMatch) {
              existingMatch.lid = c.id
              if (c.verifiedName) existingMatch.verifiedName = c.verifiedName
              if (c.name) existingMatch.name = c.name
              return
            }

            if (!c.name && !c.verifiedName && !c.notify) {
              return
            }
          }

          const phone = c.id.split('@')[0].replace(/\D/g, '')
          if (!phone) return

          if (!waContacts[c.id]) {
            waContacts[c.id] = {
              id: c.id,
              name: _isUsableDisplayName(c.name) ? String(c.name).trim() : null,
              notify: _isUsableDisplayName(c.notify) ? String(c.notify).trim() : null,
              verifiedName: _isUsableDisplayName(c.verifiedName)
                ? String(c.verifiedName).trim()
                : null,
              phone,
              lid: c.lid || null
            }
            added++
          } else {
            if (_isUsableDisplayName(c.name)) waContacts[c.id].name = String(c.name).trim()
            if (_isUsableDisplayName(c.notify)) waContacts[c.id].notify = String(c.notify).trim()
            if (_isUsableDisplayName(c.verifiedName)) {
              waContacts[c.id].verifiedName = String(c.verifiedName).trim()
            }
            if (c.lid) waContacts[c.id].lid = c.lid
            updated++
          }
        })
      }

      if (syncedChats?.length) {
        momai.log(`History sync: received ${syncedChats.length} chats`)
        await _forEachYield(syncedChats, (c) => {
          if (!c.id) return
          receivedJids.add(c.id)
          if (c.id.endsWith('@g.us')) return
          const phone = c.id.split('@')[0].replace(/\D/g, '')
          if (!phone) return
          const name = _isUsableDisplayName(c.name) ? String(c.name).trim() : null
          if (!waContacts[c.id]) {
            waContacts[c.id] = {
              id: c.id,
              name,
              notify: null,
              verifiedName: null,
              phone,
              lid: null
            }
            added++
          } else if (name && !waContacts[c.id].name) {
            waContacts[c.id].name = name
            updated++
          }
        })
      }

      if (syncedMessages?.length) {
        momai.log(`History sync: received ${syncedMessages.length} messages`)
        await _forEachYield(syncedMessages, (m) => {
          const jid = m.key?.remoteJid
          if (!jid || jid.endsWith('@g.us')) return
          receivedJids.add(jid)
          const phone = jid.split('@')[0].replace(/\D/g, '')
          if (!phone) return
          const pushName = _isUsableDisplayName(m.pushName) ? String(m.pushName).trim() : null
          if (!waContacts[jid]) {
            waContacts[jid] = {
              id: jid,
              name: null,
              notify: pushName,
              verifiedName: null,
              phone,
              lid: null
            }
            added++
          } else if (pushName && !waContacts[jid].notify && !waContacts[jid].name) {
            waContacts[jid].notify = pushName
            updated++
          }
        })
      }

      const historyAdded = populateContactsFromChatHistory()
      if (added > 0 || updated > 0 || historyAdded > 0) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
        momai.log(
          `Contacts stored: ${added} new, ${updated} updated, ${historyAdded} from history, ${Object.keys(waContacts).length} total` +
            (lidCount > 0 ? ` (${lidCount} lid)` : '')
        )
      }
      const total = Object.keys(waContacts).length
      if (total > 0) {
        momai.sendEvent('contacts_synced', { count: total, isFinal: false })
        _notifyContactsUpdated()
      }
    })

    sock.ev.on('contacts.upsert', async (contacts) => {
      let updated = 0
      // Índice verifiedName→contato padrão (UMA vez por lote). Antes, cada
      // contato @lid fazia Object.values(waContacts).find() — O(n²) e bloqueava
      // o event loop com lote grande de LIDs durante o sync.
      const byVerifiedName = new Map()
      for (const existing of Object.values<any>(waContacts)) {
        if (existing.id && !existing.id.endsWith('@lid') && existing.verifiedName) {
          if (!byVerifiedName.has(existing.verifiedName)) {
            byVerifiedName.set(existing.verifiedName, existing)
          }
        }
      }
      await _forEachYield(contacts, (c) => {
        if (c.id) receivedJids.add(c.id)
        if (!c.id) return

        if (c.id.endsWith('@lid')) {
          // If this LID has a verifiedName, it's likely a Business account
          // Try to associate it with an existing standard JID
          const existingMatch = byVerifiedName.get(c.verifiedName)
          if (existingMatch) {
            existingMatch.lid = c.id
            if (c.verifiedName) existingMatch.verifiedName = c.verifiedName
            if (_isUsableDisplayName(c.name)) existingMatch.name = String(c.name).trim()
            return
          }
          // If no name details, skip
          if (!_pickContactLabel(c.name, c.verifiedName, c.notify)) {
            return
          }
        }

        const phone = c.id.split('@')[0].replace(/\D/g, '')
        if (!phone) return
        const nextName = _isUsableDisplayName(c.name) ? String(c.name).trim() : null
        const nextNotify = _isUsableDisplayName(c.notify) ? String(c.notify).trim() : null
        const nextVerified = _isUsableDisplayName(c.verifiedName)
          ? String(c.verifiedName).trim()
          : null
        waContacts[c.id] = {
          ...waContacts[c.id],
          id: c.id,
          name: nextName || waContacts[c.id]?.name || null,
          notify: nextNotify || waContacts[c.id]?.notify || null,
          verifiedName: nextVerified || waContacts[c.id]?.verifiedName || null,
          phone,
          lid: c.lid || waContacts[c.id]?.lid || null
        }
        updated++
      })
      if (updated > 0) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
        _notifyContactsUpdated()
      }
    })

    sock.ev.on('contacts.update', async (updates) => {
      let changed = 0
      // Índice lid→contato padrão (UMA vez por lote) — evita o O(n²) de
      // Object.values(waContacts).find() por update @lid.
      const byLid = new Map()
      for (const existing of Object.values<any>(waContacts)) {
        if (existing.lid) byLid.set(existing.lid, existing)
      }
      await _forEachYield(updates, (u) => {
        if (u.id) receivedJids.add(u.id)
        if (!u.id) return

        let target = waContacts[u.id]
        if (!target && u.id.endsWith('@lid')) {
          // Find standard contact linked to this LID
          target = byLid.get(u.id)
        }

        if (!target) return

        if (_isUsableDisplayName(u.notify)) {
          target.notify = String(u.notify).trim()
          changed++
        }
        if (_isUsableDisplayName(u.name)) {
          target.name = String(u.name).trim()
          changed++
        }
        if (u.verifiedName) {
          target.verifiedName = u.verifiedName
          changed++
        }
      })
      if (changed > 0) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
        _notifyContactsUpdated()
      }
    })

    sock.ev.on('groups.upsert', async (groupMetas) => {
      if (!groupMetas?.length) return
      let changed = false
      await _forEachYield(groupMetas, (meta) => {
        if (!meta.id || !meta.id.endsWith('@g.us')) return
        groupMetaCache.set(meta.id, { data: meta, fetchedAt: Date.now() })
        const subjectName = meta.subject ? String(meta.subject).trim() : null
        const formattedName = _isUsableDisplayName(subjectName) ? subjectName : 'Grupo'
        if (!waContacts[meta.id]) {
          waContacts[meta.id] = {
            id: meta.id,
            name: formattedName,
            notify: null,
            verifiedName: null,
            phone: null,
            lid: null
          }
          changed = true
        } else if (_isUsableDisplayName(subjectName) && waContacts[meta.id].name !== subjectName) {
          waContacts[meta.id].name = subjectName
          changed = true
        }
      })
      if (changed) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
        _notifyContactsUpdated()
      }
    })

    sock.ev.on('groups.update', async (updates) => {
      if (!updates?.length) return
      let changed = false
      await _forEachYield(updates, (u) => {
        if (!u.id || !u.id.endsWith('@g.us')) return
        if (u.subject && _isUsableDisplayName(u.subject)) {
          if (!waContacts[u.id]) {
            waContacts[u.id] = {
              id: u.id,
              name: String(u.subject).trim(),
              notify: null,
              verifiedName: null,
              phone: null,
              lid: null
            }
          } else {
            waContacts[u.id].name = String(u.subject).trim()
          }
          changed = true
        }
      })
      if (changed) {
        momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
        _notifyContactsUpdated()
      }
    })

    sock.ev.on('messages.upsert', handleMessagesUpsert)
    sock.ev.on('call', handleIncomingCalls)
  } catch (err) {
    isConnecting = false
    momai.log(`Connection error: ${err.message}`)
    _clearReconnectTimer()
    const delay = nextReconnectDelay()
    reconnectTimer = setTimeout(connect, delay)
  }
}

async function handleMessagesUpsert({ messages }) {
  for (const msg of messages) {
    if (msg.message && msg.key?.id) {
      cacheMessage(msg.key, msg.message)
    }
    const isSticker = !!msg.message?.stickerMessage
    const isGif = !!msg.message?.videoMessage?.gifPlayback
    const isConversation = !!msg.message?.conversation || !!msg.message?.extendedTextMessage
    const isAudio = !!msg.message?.audioMessage

    if (!isConversation && !isSticker && !isGif && !isAudio) continue

    const isFromMe = msg.key.fromMe
    let text = ''
    let audioFilename = null
    if (isConversation) {
      text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    } else if (isSticker) {
      text = '[Sticker]'
    } else if (isGif) {
      text = '[GIF]'
    } else if (isAudio) {
      text = '🎙️ Áudio'
      audioFilename = await saveIncomingAudio(msg)
    }

    if (!text) continue

    const remoteJid = msg.key.remoteJid
    if (!remoteJid) continue

    const isGroup = remoteJid.endsWith('@g.us')
    const senderJid = resolveMessageSenderJid(remoteJid, msg.key.participant)
    if (!senderJid) continue

    // Self-healing LID association for incoming messages
    const lidJid = remoteJid.endsWith('@lid')
      ? remoteJid
      : senderJid.endsWith('@lid')
        ? senderJid
        : null
    if (lidJid) {
      const hasLidMapping = Object.values<any>(waContacts).some((c) => c.lid === lidJid)
      if (!hasLidMapping && msg.pushName) {
        const match = Object.values<any>(waContacts).find(
          (c) => !c.id.endsWith('@lid') && (c.notify === msg.pushName || c.name === msg.pushName)
        )
        if (match) {
          waContacts[match.id].lid = lidJid
          await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
          momai.log(
            `Self-healed JID mapping: associated LID ${lidJid} with standard JID ${match.id} via pushName "${msg.pushName}"`
          )
        }
      }
    }

    // Now resolve standard JID for lookups
    const resolvedSenderJid = resolveStandardJid(senderJid) || senderJid

    // Ensure group/contact exists in waContacts
    if (isGroup) {
      if (!waContacts[msg.key.remoteJid]) {
        waContacts[msg.key.remoteJid] = {
          id: msg.key.remoteJid,
          name: 'Grupo',
          phone: msg.key.remoteJid.split('@')[0]
        }
        await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
      }
    } else {
      const storeJid = remoteJid.endsWith('@lid') ? remoteJid : resolvedSenderJid
      if (!storeJid.endsWith('@g.us') && !waContacts[storeJid]) {
        const phone = storeJid.split('@')[0].replace(/\D/g, '')
        if (phone) {
          waContacts[storeJid] = {
            id: storeJid,
            name: null,
            notify: _isUsableDisplayName(msg.pushName) ? String(msg.pushName).trim() : null,
            verifiedName: null,
            phone,
            ...(remoteJid.endsWith('@lid') ? { lid: remoteJid } : {})
          }
          await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
        }
      } else if (remoteJid.endsWith('@lid') && waContacts[storeJid] && !waContacts[storeJid].lid) {
        waContacts[storeJid].lid = remoteJid
        await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
      }
    }

    const now = Date.now()
    const ONE_DAY = 24 * 60 * 60 * 1000
    const RETRY_DELAY = 10 * 60 * 1000 // 10 minutes on failure

    // Fetch group metadata (subject) dynamically if needed
    if (
      sock &&
      connected &&
      isGroup &&
      (!waContacts[msg.key.remoteJid]?.name || waContacts[msg.key.remoteJid]?.name === 'Grupo')
    ) {
      try {
        const meta: any = await withTimeout(sock.groupMetadata(msg.key.remoteJid), 3000)
        if (meta?.subject) {
          waContacts[msg.key.remoteJid].name = meta.subject
          await momai.storage.set(_getWaContactsKey(), waContacts).catch((e) =>
            momai.log(`Failed to persist group subject for ${msg.key.remoteJid}: ${e.message}`)
          )
        }
        groupMetaCache.set(msg.key.remoteJid, { data: meta, fetchedAt: Date.now() })
      } catch (err) {
        momai.log(`Failed to fetch group metadata: ${err.message}`)
      }
    }

    // Fetch avatar picture (group avatar if group, sender avatar if private)
    // NOTA: Após a primeira sincronização, avatares NÃO são buscados automaticamente.
    // O único caminho para refetch é o botão "Atualizar fotos de perfil" (force).
    // Mantemos apenas a busca na primeira vez (sem URL armazenada) para contatos
    // novos que chegam via mensagem.
    const avatarTarget = isGroup
      ? remoteJid
      : remoteJid.endsWith('@lid')
        ? remoteJid
        : resolvedSenderJid
    if (sock && connected && waContacts[avatarTarget]) {
      const lastChecked = waContacts[avatarTarget].profilePicCheckedAt || 0
      const isFailedRecently =
        !waContacts[avatarTarget].profilePicUrl && now - lastChecked < RETRY_DELAY

      // Só busca se NÃO tem URL e NÃO falhou recentemente
      if (!waContacts[avatarTarget].profilePicUrl && !isFailedRecently) {
        try {
          const url = await withTimeout(sock.profilePictureUrl(avatarTarget, 'image'), 3000)
          if (waContacts[avatarTarget]) {
            waContacts[avatarTarget].profilePicUrl = url
            waContacts[avatarTarget].profilePicCheckedAt = now
            await momai.storage.set(_getWaContactsKey(), waContacts)
          }
        } catch {
          if (waContacts[avatarTarget]) {
            // Cooldown real: now permite retry após RETRY_DELAY (10 min)
            waContacts[avatarTarget].profilePicCheckedAt = now
            await momai.storage.set(_getWaContactsKey(), waContacts)
          }
        }
      }
    }

    // Fetch group metadata (announce status)
    let groupAnnounce = false
    if (sock && connected && isGroup) {
      // Re-fetch metadata if we don't have it or if it's potentially stale (60s)
      const cached = groupMetaCache.get(msg.key.remoteJid)
      const isMissingMetadata = !cached || !cached.data?.subject
      const isStale = cached && Date.now() - cached.fetchedAt > 60 * 1000

      if (isMissingMetadata || isStale) {
        try {
          const meta: any = await withTimeout(sock.groupMetadata(msg.key.remoteJid), 5000)
          if (meta) {
            groupAnnounce = !!meta.announce
            groupMetaCache.set(msg.key.remoteJid, { data: meta, fetchedAt: Date.now() })

            // Update the subject in waContacts while we're at it
            if (meta.subject && waContacts[msg.key.remoteJid]) {
              waContacts[msg.key.remoteJid].name = meta.subject
              await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})
            }
          }
        } catch (err) {
          momai.log(`Failed to fetch fresh group metadata: ${err.message}`)
          // Fallback to cache if exists
          if (cached) groupAnnounce = !!cached.data?.announce
        }
      } else {
        groupAnnounce = !!cached.data?.announce
      }
    }

    const resGroupName = isGroup
      ? resolveContactName(remoteJid) ||
        _pickContactLabel(waContacts[remoteJid]?.name, waContacts[remoteJid]?.verifiedName) ||
        'Grupo'
      : null
    const displayName = isFromMe
      ? resolvedSenderJid.split('@')[0] || resolvedSenderJid
      : resolveContactName(resolvedSenderJid)

    const replyJid = isGroup ? remoteJid : resolveStandardJid(remoteJid) || remoteJid

    chatHistory.unshift(
      enrichHistoryEntry({
        from: displayName,
        jid: remoteJid,
        senderJid,
        replyJid,
        text,
        audio: audioFilename,
        timestamp: msg.messageTimestamp
          ? Number(msg.messageTimestamp)
          : Math.floor(Date.now() / 1000),
        direction: isFromMe ? 'outgoing' : 'incoming',
        isGroup,
        groupName: resGroupName,
        forceUpdateNames: true
      })
    )
    if (chatHistory.length > MAX_HISTORY) chatHistory.pop()
    totalMessages++
    schedulePersistChatHistory()
    momai.log(
      `Message tracked: from=${displayName} text="${text.substring(0, 50)}" total=${totalMessages}`
    )

    const standardizedRemoteJid = resolveStandardJid(remoteJid)
    const myJidRaw = sock?.user?.id || sock?.authState?.creds?.me?.id
    const myJidStandardized = resolveStandardJid(myJidRaw)
    const myLidRaw = sock?.user?.lid || sock?.authState?.creds?.me?.lid
    // Strip device suffix from LID manually (resolveStandardJid uses corrupted waContacts mapping)
    const myLidStandardized =
      myLidRaw?.includes(':') && myLidRaw?.includes('@')
        ? myLidRaw.split('@')[0].split(':')[0] + '@' + myLidRaw.split('@')[1]
        : myLidRaw
    // Note to Self: message sent to own number. Compare raw and standardized JIDs.
    const isNoteToSelf =
      isFromMe &&
      !isGroup &&
      (remoteJid === myJidRaw ||
        remoteJid === myLidRaw ||
        remoteJid === myLidStandardized ||
        standardizedRemoteJid === myJidStandardized)

    const isOldMessage = msg.messageTimestamp && Number(msg.messageTimestamp) < workerStartTime

    const senderDisabled = _isContactDisabled(resolvedSenderJid)
    const remoteDisabled = _isContactDisabled(remoteJid)
    const shouldNotify =
      !notificationsDisabled &&
      !isOldMessage &&
      ((!isFromMe && !senderDisabled && !remoteDisabled) || isNoteToSelf)
    momai.log(
      `[notif-debug] shouldNotify=${shouldNotify} isFromMe=${isFromMe} isOldMessage=${isOldMessage} notificationsDisabled=${notificationsDisabled} senderDisabled=${senderDisabled} remoteDisabled=${remoteDisabled} isNoteToSelf=${isNoteToSelf} remoteJid=${remoteJid} standardizedRemoteJid=${standardizedRemoteJid} resolvedSenderJid=${resolvedSenderJid} myJidRaw=${myJidRaw} myJidStandardized=${myJidStandardized} myLidRaw=${myLidRaw} myLidStandardized=${myLidStandardized} isGroup=${isGroup} disabledContacts=${JSON.stringify(disabledContacts)}`
    )
    if (shouldNotify) {
      const finalDisplayName = isGroup ? resGroupName : displayName

      // Check if I am admin in this group
      let isMeAdmin = false
      if (isGroup && groupAnnounce) {
        const meta = groupMetaCache.get(remoteJid)?.data
        const myJid = sock?.user?.id || sock?.authState?.creds?.me?.id
        const meId = resolveStandardJid(myJid)

        if (meId && meta?.participants) {
          const meParticipant = meta.participants.find((p) => resolveStandardJid(p.id) === meId)
          isMeAdmin = !!(meParticipant?.admin || meParticipant?.isSuperAdmin)

          if (isMeAdmin) {
            momai.log(`Verified: Current user is ADMIN in group ${resGroupName || remoteJid}`)
          }
        } else {
          momai.log(`Warning: Could not verify admin status for group ${remoteJid} (meId=${meId})`)
        }
      }

      momai.log(
        `[notif-debug] Sending whatsapp_notification event: contact=${finalDisplayName} isGroup=${!!isGroup} isNoteToSelf=${isNoteToSelf}`
      )
      // For self-messages, use the user's own JID (not the corrupted LID-resolved one)
      const notifContactJid = isNoteToSelf ? myJidStandardized || replyJid : replyJid
      momai.log(`[audio-debug] whatsapp_notification audioFilename=${audioFilename} isGroup=${isGroup} contact=${finalDisplayName}`)
      momai.sendEvent('whatsapp_notification', {
        contact: finalDisplayName,
        senderName: isGroup ? displayName : undefined,
        contactJid: notifContactJid,
        senderJid,
        message: text,
        audio: audioFilename,
        timestamp: msg.messageTimestamp,
        contactAvatar: resolveChatAvatarUrl(remoteJid, isGroup, senderJid),
        isGroup: !!isGroup,
        isNoteToSelf,
        groupName: isGroup ? resGroupName : undefined,
        isAdminsOnly: !!groupAnnounce && !isMeAdmin
      })

      if (!isNoteToSelf) {
        const defaultContact = await getDefaultContact()
        momai.sendEvent('whatsapp_message', {
          contact: finalDisplayName,
          senderName: isGroup ? displayName : undefined,
          contactJid: replyJid,
          senderJid,
          message: text,
          audio: audioFilename,
          contactAvatar: resolveChatAvatarUrl(remoteJid, isGroup, senderJid),
          timestamp: msg.messageTimestamp,
          isGroup: !!isGroup,
          groupName: isGroup ? resGroupName : undefined,
          defaultContact: defaultContact || undefined
        })
      }
    }
  }
}

async function handleIncomingCalls(calls) {
  for (const call of calls) {
    momai.log(`[call-debug] Call received: id=${call.id} status=${call.status} from=${call.from} isGroup=${call.isGroup}`)
    if (call.status === 'offer' && !notificationsDisabled) {
      const callerJid = call.from
      const isGroup = !!call.isGroup
      const groupJid = call.groupJid

      const displayName = resolveContactName(callerJid) || callerJid.split('@')[0]
      const groupName = isGroup && groupJid ? resolveContactName(groupJid) || 'Grupo' : null
      const finalDisplayName = isGroup ? groupName : displayName

      momai.log(`[call-debug] Sending call notification for: ${finalDisplayName}`)

      momai.sendEvent('whatsapp_notification', {
        contact: finalDisplayName,
        senderName: isGroup ? displayName : undefined,
        contactJid: isGroup && groupJid ? groupJid : callerJid,
        senderJid: callerJid,
        message: '📞Chamada em curso...',
        timestamp: Math.floor(Date.now() / 1000),
        contactAvatar: resolveChatAvatarUrl(isGroup && groupJid ? groupJid : callerJid, isGroup, callerJid),
        isGroup,
        isNoteToSelf: false,
        groupName: isGroup ? groupName : undefined,
        isAdminsOnly: false
      })
    }
  }
}

async function saveIncomingAudio(msg) {
  try {
    const audioMessage = msg.message?.audioMessage
    if (!audioMessage) return null

    const baileys = require('@whiskeysockets/baileys')
    const downloadMediaMessage = baileys.downloadMediaMessage || baileys.default?.downloadMediaMessage
    if (!downloadMediaMessage) {
      momai.log(`[whatsapp-audio] downloadMediaMessage helper not found in Baileys`)
      return null
    }

    const buffer = await withTimeout(
      downloadMediaMessage(
        msg,
        'buffer',
        {},
        {
          rekey: false
        }
      ),
      30000,
      'audio download timeout'
    )

    if (buffer) {
      const fsSync = require('fs')
      if (buffer.length > MAX_AUDIO_BYTES) {
        momai.log(
          `[whatsapp-audio] Áudio grande demais (${buffer.length} bytes > ${MAX_AUDIO_BYTES}); ignorado`
        )
        return null
      }
      const audioDir = path.join(momai.storage.storageDir, 'audio')
      if (!fsSync.existsSync(audioDir)) {
        fsSync.mkdirSync(audioDir, { recursive: true })
      }
      const filename = `${sanitizeMediaFilename(msg.key.id, String(Date.now()))}.ogg`
      const filePath = path.join(audioDir, filename)
      fsSync.writeFileSync(filePath, buffer)
      momai.log(`[whatsapp-audio] Saved audio message: ${filename}`)
      return filename
    }
  } catch (err) {
    momai.log(`[whatsapp-audio] Failed to download audio: ${err.message}`)
  }
  return null
}

function resolveJidForSending(contact) {
  const resolved = _resolveJidForSendingPure(contact, {
    waContacts,
    contactNames,
    resolveDisplayName: _resolveWaContactDisplayName
  })
  if (contact) momai.log(`[resolveJidForSending] Input contact="${contact}" -> "${resolved}"`)
  return resolved
}

/**
 * Resolve o JID @g.us de um grupo pelo NOME exibido — o valor que o usuário
 * digita/seleciona na ação (o JID fica resolvido por trás). Primeiro procura
 * no cache waContacts; se o grupo não estiver lá (fetch inicial falhou, grupo
 * criado depois), busca os grupos do WhatsApp sob demanda
 * (groupFetchAllParticipating) com cooldown e tenta de novo.
 */
async function findGroupJidByDisplayName(name) {
  const clean = String(name || '').trim().toLowerCase()
  if (!clean) return null

  const matchInCache = () =>
    Object.values<any>(waContacts).find(
      (c) => c && c.id && c.id.endsWith('@g.us') && _groupNameMatches(c, clean)
    )

  const cached = matchInCache()
  if (cached) return cached.id

  if (sock && connected && Date.now() - lastGroupFetchTs > GROUP_FETCH_COOLDOWN_MS) {
    lastGroupFetchTs = Date.now()
    await fetchAndStoreGroups()
    const fresh = matchInCache()
    if (fresh) return fresh.id
  }

  return null
}

function _groupNameMatches(contact, clean) {
  const candidates = [contact.name, contact.notify, contact.verifiedName]
    .filter((s) => s && typeof s === 'string')
    .map((s) => String(s).trim().toLowerCase())
    .filter((s) => s && s !== 'grupo')
  if (candidates.includes(clean)) return true
  return candidates.some((s) => s.includes(clean) || clean.includes(s))
}

// Builds the Baileys message content (with image → caption). Implementação em
// worker-utils.ts (validada por testes) e importada no topo deste arquivo.

async function sendMessage(contact, message, image = null) {
  const t0 = Date.now()
  const stage = (label, extra = '') =>
    momai.log(`[send] ${label}${extra ? ' ' + extra : ''} (t+${Date.now() - t0}ms)`)
  if (!sock || !connected) throw new Error('WhatsApp not connected')
  stage(
    'enter',
    `to="${contact}" msg="${(message || '').substring(0, 40)}" image=${image ? 'yes' : 'no'} connected=${connected}`
  )
  console.log(`[PERF] sendMessage START contact=${contact}`)

  // Valida/decodifica a imagem ANTES de qualquer retry de rede (evita mandar
  // base64 gigante; erro claro imediato).
  const content = buildMessageContent(message, image)

  // Resolve o JID do destino com retry curto. Logo após uma reconexão o sync de
  // contatos/grupos (messaging-history.set) ainda está populando waContacts; um
  // NOME que não resolve na 1ª tentativa pode resolver segundos depois. Antes,
  // o throw "Não encontrei X" acontecia nesse janela → envio intermitente.
  const MAX_RESOLVE_RETRIES = 3
  let jid = null
  const resolveStart = Date.now()
  console.log(`[PERF] sendMessage RESOLVE_JID_START contact=${contact} time=${Date.now() - t0}ms`)
  for (let attempt = 1; attempt <= MAX_RESOLVE_RETRIES; attempt++) {
    jid = resolveJidForSending(contact)
    console.log(`[PERF] sendMessage RESOLVE_JID attempt=${attempt} contact="${contact}" -> "${jid}" time=${Date.now() - t0}ms`)
    if (jid && jid.includes('@')) break

    // Nome cru (sem '@'): pode ser nome de GRUPO ainda não sincronizado. Busca
    // os grupos sob demanda (fetch com cooldown próprio de grupos) e resolve
    // pelo nome exibido — o valor salvo na ação é o nome, o JID fica por trás.
    if (jid && !jid.includes('@')) {
      const groupJid = await findGroupJidByDisplayName(contact)
      if (groupJid) {
        jid = groupJid
        momai.log(`sendMessage: resolved group by name "${contact}" -> ${jid}`)
        break
      }
    }

    if (attempt < MAX_RESOLVE_RETRIES) {
      momai.log(
        `sendMessage: destino "${contact}" ainda não resolvido (tentativa ${attempt}/${MAX_RESOLVE_RETRIES}); ` +
          `aguardando sync de contatos...`
      )
      await new Promise((r) => setTimeout(r, attempt * 1500))
    }
  }
  console.log(`[PERF] sendMessage RESOLVE_JID_DONE contact="${contact}" -> "${jid}" total=${Date.now() - resolveStart}ms time=${Date.now() - t0}ms`)

  if (!jid) {
    throw new Error(`Invalid contact: "${contact}"`)
  }
  if (!jid.includes('@') && /[a-zA-Z\u00C0-\u024F]/.test(String(contact))) {
    // Nome com letras não resolveu para contato nem grupo mesmo após o retry:
    // melhor dar erro claro do que deixar o onWhatsApp tratar como "número".
    throw new Error(
      `Não encontrei "${contact}" no WhatsApp (nem como contato, nem como grupo). ` +
      `Verifique se o número da sessão participa do grupo e se o nome está correto.`
    )
  }

  const isGroup = jid.endsWith('@g.us')
  stage('jid', `contact="${contact}" -> "${jid}" group=${isGroup}`)
  momai.log(
    `sendMessage: contact="${contact}" resolved_jid="${jid}" group=${isGroup} msg="${(message || '').substring(0, 40)}" image=${image ? 'yes' : 'no'}`
  )
  console.log(`[PERF] sendMessage RESOLVED_JID jid=${jid} time=${Date.now() - t0}ms`)

  // Captura o socket ativo. `sock` pode ser nulo/substituído por uma reconexão
  // no meio do fluxo (race com `sock = null` no connect()); re-checar evita
  // TypeError cru em `sock.ws`/`sock.onWhatsApp`.
  let current = sock
  if (!current) throw new Error('WhatsApp reconectando; tente novamente')

  // O flag `connected` é atualizado nos eventos de conexão e pode ficar defasado
  // durante uma reconexão: o Baileys aceita o envio localmente, resolve, mas a
  // mensagem fica presa no relógio "Aguardando mensagem" porque o WebSocket real
  // está morto. Verificar o estado real antes de enviar evita isso.
  const wsOpen =
    current.ws && typeof current.ws.isOpen === 'boolean' ? current.ws.isOpen : 'n/a'
  if (current.ws && typeof current.ws.isOpen === 'boolean' && !current.ws.isOpen) {
    const waitMs = 15000
    const wsWaitStart = Date.now()
    console.log(`[PERF] sendMessage WS_WAIT_START jid=${jid} wsOpen=${wsOpen} time=${Date.now() - t0}ms`)
    momai.log(`[whatsapp] WebSocket closed; waiting for reconnect before sending to ${jid}`)
    stage('ws_wait', `start wsOpen=${wsOpen}`)
    while (Date.now() - wsWaitStart < waitMs) {
      await new Promise((r) => setTimeout(r, 500))
      if (!sock) {
        console.log(`[PERF] sendMessage WS_WAIT_ABORT jid=${jid} sock=null time=${Date.now() - t0}ms`)
        throw new Error(`WhatsApp reconectando; tente novamente em instantes (destino: "${contact}")`)
      }
      if (sock.ws && sock.ws.isOpen) break
    }
    if (!sock || !sock.ws || !sock.ws.isOpen) {
      console.log(`[PERF] sendMessage WS_WAIT_TIMEOUT jid=${jid} time=${Date.now() - t0}ms`)
      throw new Error(`WhatsApp reconectando; tente novamente em instantes (destino: "${contact}")`)
    }
    console.log(`[PERF] sendMessage WS_WAIT_DONE jid=${jid} waited=${Date.now() - wsWaitStart}ms time=${Date.now() - t0}ms`)
    stage('ws_wait_done', `waited=${Date.now() - wsWaitStart}ms wsOpen=true`)
    momai.log(`[whatsapp] WebSocket reconnected; proceeding with send to ${jid}`)
  } else {
    stage('ws_check', `wsOpen=${wsOpen} (no wait needed)`)
  }
  console.log(`[PERF] sendMessage WS_CHECK wsOpen=${wsOpen} time=${Date.now() - t0}ms`)

  // Re-captura após a espera: se o socket foi trocado, usa o novo.
  current = sock
  if (!current) throw new Error('WhatsApp reconectando; tente novamente')

  // Destinatário individual precisa ser um WhatsApp ativo. Sem essa checagem,
  // o Baileys aceita o envio localmente e a mensagem fica presa no relógio
  // "Aguardando mensagem" para sempre quando o número não existe (ex.: número
  // trocado/desativado ou contato sem WhatsApp). A validação é best-effort:
  // se a query falhar por rede, segue tentando enviar (mesmo comportamento de
  // antes) em vez de bloquear o fluxo.
  // A checagem SÓ roda para números crus/desconhecidos: contatos que o app já
  // conhece (waContacts, últimas mensagens, notificação) ou JIDs @lid/@g.us
  // pulam o onWhatsApp — quem mandou mensagem ou está na agenda existe no
  // WhatsApp, e o USync query só adiciona latência (estourava o timeout do
  // painel durante a sync pós-conexão). @lid não é número de telefone: a query
  // por telefone sempre falha ("Número não registrado") mesmo com contato
  // válido; Baileys aceita enviar direto pro @lid. (MOM-XXX)
  const isLidJid = jid.endsWith('@lid')
  const shouldCheck = _shouldCheckWhatsAppExistence(contact, jid, waContacts)
  if (
    !isGroup &&
    !isLidJid &&
    current &&
    typeof current.onWhatsApp === 'function' &&
    shouldCheck
  ) {
    const owaStart = Date.now()
    console.log(`[PERF] sendMessage ON_WHATSAPP_START jid=${jid} time=${Date.now() - t0}ms`)
    try {
      const result = await withTimeout(current.onWhatsApp(jid), 4000, 'onWhatsApp timeout')
      console.log(`[PERF] sendMessage ON_WHATSAPP_RESULT jid=${jid} entries=${Array.isArray(result) ? result.length : 'null'} time=${Date.now() - t0}ms`)
      const jidDigits = jid.replace(/[^0-9]/g, '')
      const entries = Array.isArray(result) ? result : null
      if (entries) {
        // Em sessões LID (Privacy ID), o Baileys pode devolver o JID do contato
        // como @lid — os dígitos do LID NÃO são o telefone, então a comparação
        // por dígitos falhava e mensagens legítimas eram bloqueadas com
        // "Número não registrado". Resolve o LID de volta para o telefone
        // conhecido (waContacts) antes de comparar.
        const entry = entries.find((r) => {
          if (!r) return false
          const rJid = String(r.jid || '').replace(/[^0-9]/g, '')
          const rLid = String(r.lid || '').replace(/[^0-9]/g, '')
          const rRaw = String(r.jid || '')
          const rFromLid = rRaw.endsWith('@lid') ? resolveStandardJid(rRaw) : null
          const rResolved =
            rFromLid && rFromLid !== rRaw ? String(rFromLid).replace(/[^0-9]/g, '') : ''
          return Boolean(
            (rJid && jidDigits && (rJid === jidDigits || rJid.endsWith(jidDigits))) ||
              (rResolved && jidDigits && rResolved === jidDigits) ||
              (rLid && jidDigits && (rLid === jidDigits || jidDigits.endsWith(rLid)))
          )
        })
        const anyLidEntry =
          entries.length > 0 && entries.some((r) => r && String(r.jid || '').endsWith('@lid'))
        // O Baileys omite números não registrados da resposta, então consulta
        // concluída sem entrada = número inválido — EXCETO durante a janela de
        // sync de contatos (resposta `[]` transiente para números válidos) e
        // quando o servidor devolve apenas o @lid sem mapeamento local: nesses
        // casos não bloqueia o envio (procede como timeout de rede).
        if (!entry && !anyLidEntry) {
          if (syncingContacts) {
            momai.log(
              `sendMessage: onWhatsApp vazio para ${jid} durante sync de contatos — ` +
                `procedendo (contato pode ainda não estar carregado)`
            )
          } else {
            throw new Error(`Número não registrado no WhatsApp: "${contact}"`)
          }
        }
        if (entry?.jid && entry.jid !== jid) {
          momai.log(`sendMessage: updating target JID from "${jid}" to canonical "${entry.jid}"`)
          jid = entry.jid
        } else if (!entry && anyLidEntry) {
          momai.log(
            `sendMessage: onWhatsApp returned only LID(s) for ${jid} without local mapping — proceeding`
          )
        }
      }
    } catch (err) {
      if (err && err.message && err.message.includes('não registrado no WhatsApp')) {
        throw err
      }
      momai.log(`sendMessage: onWhatsApp check failed for ${jid}: ${err.message} — proceeding`)
    }
    console.log(`[PERF] sendMessage ON_WHATSAPP_DONE jid=${jid} time=${Date.now() - t0}ms`)
    stage('onWhatsApp', `done (took ${Date.now() - owaStart}ms)`)
  } else {
    stage(
      'onWhatsApp',
      `skipped (isGroup=${isGroup} isLid=${isLidJid} hasFn=${current && typeof current.onWhatsApp === 'function'} shouldCheck=${shouldCheck})`
    )
  }
  console.log(`[PERF] sendMessage BEFORE_SEND time=${Date.now() - t0}ms`)

  if (isGroup) {
    await prepareGroupForSend(jid)
  }

  // Sessão Signal corrompida (criada mas nunca confirmada, baseKeyType 1) faz o
  // envio resolver mas a mensagem ficar presa no relógio "Aguardando mensagem".
  // Limpar a sessão antes de enviar força o Baileys a refazer o handshake.
  if (!isGroup && isSessionUnhealthy(jid)) {
    console.log(`[PERF] sendMessage UNHEALTHY_SESSION jid=${jid} time=${Date.now() - t0}ms`)
    momai.log(`[whatsapp] Unhealthy session detected for ${jid}; clearing before send`)
    await forceClearSession(jid)
    console.log(`[PERF] sendMessage SESSION_CLEARED jid=${jid} time=${Date.now() - t0}ms`)
  }

  if (content.image && Buffer.isBuffer(content.image)) {
    momai.log(`sendMessage: media size = ${content.image.length} bytes (${jid})`)
  }

  const MAX_RETRIES = isGroup ? 4 : 3
  let lastError
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const attemptStart = Date.now()
    try {
      console.log(`[PERF] sendMessage Baileys START attempt=${attempt} jid=${jid}`)
      const sent = await withTimeout(current.sendMessage(jid, content), 15000, 'send timeout')
      console.log(`[PERF] sendMessage Baileys END attempt=${attempt} took=${Date.now() - attemptStart}ms sent=${sent ? 'ok' : 'null'} keys=${sent && sent.key ? sent.key.id : 'n/a'}`)
      stage(`send_ok`, `attempt=${attempt} sock.sendMessage took ${Date.now() - attemptStart}ms`)
      if (sent?.key?.id && sent?.message) {
        cacheMessage(sent.key, sent.message)
      }
      lastError = null
      break
    } catch (err) {
      lastError = err
      stage(
        `send_fail`,
        `attempt=${attempt} took ${Date.now() - attemptStart}ms err="${err.message}"`
      )
      momai.log(`sendMessage attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`)
      if (err && err.data !== undefined) {
        momai.log(`sendMessage error code/data: ${JSON.stringify(err.data)}`)
      }
      if (err && err.stack) {
        momai.log(
          `sendMessage error stack: ${String(err.stack).split('\n').slice(0, 8).join(' → ')}`
        )
      }

      if (attempt < MAX_RETRIES) {
        const delayMs = 1500
        if (isGroup) {
          await resetGroupSenderKeyMemory(jid)
        }
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  if (lastError) throw lastError

  const displayName = resolveContactName(jid)
  chatHistory.unshift({
    from: displayName,
    jid: jid,
    text: message,
    timestamp: Math.floor(Date.now() / 1000),
    direction: 'outgoing'
  })
  if (chatHistory.length > MAX_HISTORY) chatHistory.pop()
  totalMessages++
  schedulePersistChatHistory()

  momai.sendEvent('message_sent', { contact: displayName, jid })

  stage('total', `sent to "${jid}" ok in ${Date.now() - t0}ms`)
  console.log(`[PERF] sendMessage END OK time=${Date.now() - t0}ms`)
  return { ok: true }
}

async function getPanelData() {
  const validContacts = Object.values<any>(waContacts).filter((c) => c.phone && !c.id.endsWith('@g.us'))
  return {
    connected,
    syncedContacts: validContacts.length,
    disabledCount: disabledContacts.length
  }
}

process.on('SIGINT', () => {
  reEncryptCredsAfterBaileys(path.join(momai.storage.storageDir, 'baileys-auth'))
    .catch(() => {})
    .finally(() => {
      releaseLock()
      flushPersistedChatHistory()
        .catch(() => {})
        .finally(() => process.exit(0))
    })
})
process.on('SIGTERM', () => {
  reEncryptCredsAfterBaileys(path.join(momai.storage.storageDir, 'baileys-auth'))
    .catch(() => {})
    .finally(() => {
      releaseLock()
      flushPersistedChatHistory()
        .catch(() => {})
        .finally(() => process.exit(0))
    })
})

// When node-core restarts (dev hot-reload, crash), this worker would otherwise
// keep running as an orphan: it holds worker.lock and the WhatsApp socket, so
// fresh workers spawned by the new node-core retry the lock for seconds and
// messages fail with "No persistent host". Exit and release the lock as soon as
// the IPC channel to the parent closes.
let parentGoneHandled = false
function onParentGone() {
  if (parentGoneHandled) return
  parentGoneHandled = true
  try {
    momai.log('[whatsapp] Parent process (node-core) is gone; releasing lock and exiting.')
  } catch {}
  reEncryptCredsAfterBaileys(path.join(momai.storage.storageDir, 'baileys-auth'))
    .catch(() => {})
    .finally(() => {
      releaseLock()
      flushPersistedChatHistory()
        .catch(() => {})
        .finally(() => process.exit(0))
    })
}
if (typeof process.send === 'function') {
  process.on('disconnect', onParentGone)
  const parentWatch = setInterval(() => {
    // process.channel is null/undefined once the IPC channel is closed
    // (including when the parent was killed on Windows, where 'disconnect'
    // may not fire reliably).
    if (process.channel == null) {
      clearInterval(parentWatch)
      onParentGone()
    }
  }, 2000)
  parentWatch.unref()
}

// IPC listener for tool execution from LLM
process.on('message', async (msg) => {
  if (msg.type === 'shutdown') {
    reEncryptCredsAfterBaileys(path.join(momai.storage.storageDir, 'baileys-auth'))
      .catch(() => {})
      .finally(async () => {
        releaseLock()
        await flushPersistedChatHistory()
        process.exit(0)
      })
    return
  }
  if (msg.type === 'execute') {
    console.log(`[PERF] WORKER RECEIVE msg.type=${msg.type} toolName=${msg.payload?.toolName} requestId=${msg.requestId}`)
    try {
      let result
      switch (msg.payload?.toolName) {
        case 'send_message': {
          const args = msg.payload.args || {}
          const cmdStart = Date.now()
          console.log(`[PERF] send_message START contact=${args.contact}`)
          try {
            const rawImages = Array.isArray(args.images)
              ? args.images
              : (args.image ? [args.image] : (args.media ? [args.media] : []))
            const images = rawImages.filter(Boolean)

            if (images.length > 0) {
              for (let i = 0; i < images.length; i++) {
                const isFirst = i === 0
                const caption = isFirst ? (args.message || '') : ''
                result = await sendMessage(args.contact, caption, images[i])
              }
            } else {
              result = await sendMessage(args.contact, args.message, null)
            }
            momai.log(
              `send_message OK: to=${args.contact} msg="${(args.message || '').substring(0, 50)}" (t+${Date.now() - cmdStart}ms)`
            )
            console.log(`[PERF] send_message END OK time=${Date.now() - cmdStart}ms`)
            result = result || { ok: true }
            result.directResponse = `Mensagem enviada`
          } catch (err) {
            momai.log(
              `send_message FAILED: ${err.message} (t+${Date.now() - cmdStart}ms)`
            )
            console.log(`[PERF] send_message END FAILED err=${err.message} time=${Date.now() - cmdStart}ms`)
            const friendly = friendlySendError(err.message, args.contact)
            result = {
              ok: false,
              error: friendly,
              directResponse: `Erro ao enviar: ${friendly}`
            }
          }
          break
        }
        case 'set_default_contact': {
          const contact = String(msg.payload.args?.contact || '').trim()
          await momai.storage.set(DEFAULT_CONTACT_KEY, contact)
          result = { ok: true, contact }
          break
        }
        case 'get_default_contact':
          result = { ok: true, contact: await getDefaultContact() }
          break
        case 'list_contacts': {
          const allContacts = Object.values<any>(waContacts)
            .filter((c) => c.phone && !c.id.endsWith('@g.us'))
            .map((c) => ({
              id: c.id,
              name: _resolveWaContactDisplayName(c, c.id),
              phone: c.phone,
              monitoring: !_isContactDisabled(c.id),
              profilePicUrl: c.profilePicUrl || null,
              isGroup: false
            }))
          const allGroups = Object.values<any>(waContacts)
            .filter((c) => c.id && c.id.endsWith('@g.us'))
            .map((c) => ({
              id: c.id,
              name: _resolveWaContactDisplayName(c, c.id),
              phone: null,
              monitoring: !_isContactDisabled(c.id),
              profilePicUrl: c.profilePicUrl || null,
              isGroup: true
            }))
          result = { contacts: allContacts, groups: allGroups }
          break
        }
        case 'toggle_monitoring': {
          const contactId = msg.payload.args?.contact
          if (!contactId) break
          const isDisabled = _isContactDisabled(contactId)
          if (isDisabled) {
            disabledContacts = disabledContacts.filter((d) => {
              const dDigits = String(d).replace(/\D/g, '')
              const cDigits = String(contactId).replace(/\D/g, '')
              return !(
                d === contactId ||
                (dDigits && cDigits && (dDigits.endsWith(cDigits) || cDigits.endsWith(dDigits)))
              )
            })
          } else {
            disabledContacts.push(contactId)
          }
          await momai.storage.set(_getDisabledContactsKey(), disabledContacts)
          result = { ok: true, contact: contactId, monitoring: isDisabled }
          break
        }
        case 'add_contact':
        case 'remove_contact': {
          // Monitoramento = lista de contatos DESABILITADOS (disabledContacts).
          // add_contact tira da lista (volta a notificar); remove_contact coloca.
          const raw = String(msg.payload.args?.contact || '').trim()
          if (!raw) {
            result = { ok: false, error: 'contato vazio' }
            break
          }
          const jid = _normalizeContactId(raw)
          const digits = jid.split('@')[0].replace(/\D/g, '')
          const matches = (d) => {
            const dd = String(d).replace(/\D/g, '')
            return d === raw || d === jid || (digits && dd && (dd.endsWith(digits) || digits.endsWith(dd)))
          }

          if (msg.payload.toolName === 'add_contact') {
            const before = disabledContacts.length
            disabledContacts = disabledContacts.filter((d) => !matches(d))
            const removedCount = before - disabledContacts.length
            await momai.storage.set(_getDisabledContactsKey(), disabledContacts)
            result = {
              ok: true,
              contact: raw,
              jid,
              monitoring: true,
              removedFromDisabled: removedCount
            }
          } else {
            if (!disabledContacts.some(matches)) disabledContacts.push(jid)
            await momai.storage.set(_getDisabledContactsKey(), disabledContacts)
            result = { ok: true, contact: raw, jid, monitoring: false }
          }
          break
        }
        case 'get_actions':
          result = { ok: true, actions: await getActionsConfig() }
          break
        case 'set_actions': {
          const incoming = msg.payload.args?.actions
          if (incoming !== undefined && !Array.isArray(incoming)) {
            result = {
              ok: false,
              error: 'payload inválido: "actions" deve ser um array de ações'
            }
            break
          }
          const actions = Array.isArray(incoming)
            ? incoming.filter(
                (a) =>
                  a &&
                  typeof a === 'object' &&
                  typeof a.target === 'string' &&
                  typeof a.tool === 'string'
              )
            : []
          await saveActionsConfig(actions)
          result = { ok: true, actions: await getActionsConfig() }
          break
        }
        case 'set_contact_name':
          if (msg.payload.args?.contact && msg.payload.args?.name) {
            const rawContact = String(msg.payload.args.contact).trim()
            const name = String(msg.payload.args.name).trim()
            const digits = rawContact.replace(/\D/g, '')

            let canonicalJid = rawContact.includes('@') ? rawContact : `${digits}@s.whatsapp.net`
            let matchedContact = waContacts[rawContact] || waContacts[canonicalJid]
            if (!matchedContact && digits) {
              matchedContact = Object.values<any>(waContacts).find(
                (c) => c.phone === digits || c.id?.split('@')[0] === digits || c.lid?.split('@')[0] === digits
              )
            }

            if (matchedContact) {
              if (matchedContact.id) canonicalJid = matchedContact.id
            } else {
              const resolved = resolveJidForSending(rawContact)
              if (resolved) canonicalJid = resolved
            }

            const phone = matchedContact?.phone || (canonicalJid.endsWith('@g.us') ? null : digits)
            const lid = matchedContact?.lid || (canonicalJid.endsWith('@lid') ? canonicalJid : null)
            const rawNumber = canonicalJid.split('@')[0]

            // 1. Store in contactNames under all possible keys
            contactNames[rawContact] = name
            contactNames[canonicalJid] = name
            if (rawNumber) contactNames[rawNumber] = name
            if (phone) contactNames[phone] = name
            if (lid) contactNames[lid] = name
            if (digits) contactNames[digits] = name

            await momai.storage.set(_getContactNamesKey(), contactNames)

            // 2. Update waContacts in-memory and on disk
            if (matchedContact) {
              matchedContact.name = name
            }
            if (waContacts[canonicalJid]) {
              waContacts[canonicalJid].name = name
            }
            if (lid && waContacts[lid]) {
              waContacts[lid].name = name
            }
            if (waContacts[rawContact]) {
              waContacts[rawContact].name = name
            }
            await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})

            // 3. Update chatHistory in-memory and persist snapshot
            let historyUpdated = false
            for (const h of chatHistory) {
              const isMatch =
                h.jid === rawContact ||
                h.jid === canonicalJid ||
                h.senderJid === rawContact ||
                h.senderJid === canonicalJid ||
                (lid && (h.jid === lid || h.senderJid === lid)) ||
                (digits && (h.jid?.split('@')[0] === digits || h.senderJid?.split('@')[0] === digits))

              if (isMatch) {
                h.from = name
                h.contactName = name
                if (h.isGroup && (h.jid === canonicalJid || h.jid === rawContact)) {
                  h.groupName = name
                }
                historyUpdated = true
              }
            }

            if (historyUpdated) {
              schedulePersistChatHistory()
            }

            _notifyContactsUpdated()
            result = { ok: true }
          }
          break
        case 'get_stats': {
          const allEntries = Object.values<any>(waContacts)
          const validContacts = allEntries.filter(
            (c) => c.phone && !c.id.endsWith('@g.us')
          )
          const syncedContactsCount = validContacts.length
          const monitoredContactsCount = allEntries.filter(
            (c) => !_isContactDisabled(c.id)
          ).length

          const hasCredentials = _hasSavedSession()

          result = {
            connected,
            hasCredentials,
            totalMessages,
            syncedContacts: syncedContactsCount,
            disabledCount: disabledContacts.length,
            monitoredCount: monitoredContactsCount,
            ...(!connected && _qrStillValid()
              ? {
                  qr: lastQr,
                  qrExpiresIn: Math.max(1, Math.ceil((QR_TTL_MS - (Date.now() - lastQrAt)) / 1000))
                }
              : {})
          }
          break
        }
        case 'restart':
        case 'request_qr': {
          const forcePairing = Boolean(msg.payload.args?.force)
          if (connected) {
            result = { ok: true, connected: true }
            break
          }
          if (_qrStillValid() && !forcePairing) {
            _emitQrCode(lastQr)
            result = { ok: true, qr: lastQr }
            break
          }
          // The page polls request_qr (~1s) while waiting for a QR. If a connect
          // is already in flight, tearing the socket down here would restart the
          // connection on every poll, so the QR never appears and the account
          // churns between connecting/disconnected. Let the in-flight attempt run.
          if (isConnecting && !forcePairing) {
            result = { ok: true, pending: true, hasCredentials: false }
            break
          }
          const fsSync = require('fs')
          const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
          if (forcePairing) {
            momai.log('request_qr: force pairing — clearing saved session')
            try {
              if (fsSync.existsSync(authDir)) {
                fsSync.rmSync(authDir, { recursive: true, force: true })
              }
            } catch (err) {
              momai.log(`force-pairing wipe failed: ${err.message}`)
            }
            lastQr = null
            lastQrAt = 0
          } else {
            momai.log('request_qr: triggering connect (no wipe; loggedOut handler manages cleanup)')
          }
          _clearReconnectTimer()
          if (sock) {
            try {
              sock.end(undefined)
            } catch {}
            sock = null
          }
          preventAutoReconnect = false
          isConnecting = false
          resetReconnectBackoff()
          connect().catch((err) => momai.log(`request_qr connect failed: ${err.message}`))
          result = { ok: true, pending: true, hasCredentials: false }
          break
        }
        case 'sync_contacts': {
          momai.log('Manual contacts sync requested')
          const cleaned = _cleanupStaleContacts() || _sanitizeStoredContactNames()
          if (cleaned) {
            await momai.storage.set(_getWaContactsKey(), waContacts)
            await momai.storage.set(_getContactNamesKey(), contactNames)
          }

          populateContactsFromChatHistory()

          if (sock && connected) {
            await fetchAndStoreGroups()

            const now = Date.now()
            const validContacts = Object.values<any>(waContacts).filter(
              (c) => c.phone && !c.id.endsWith('@g.us')
            )

            const promises = validContacts.slice(0, 15).map(async (c) => {
              try {
                const url = await withTimeout(sock.profilePictureUrl(c.id, 'image'), 2000)
                if (url && waContacts[c.id]) {
                  waContacts[c.id].profilePicUrl = url
                  waContacts[c.id].profilePicCheckedAt = now
                }
              } catch (err) {
                // Ignore profile picture fetch errors
              }
            })
            await Promise.all(promises)
          }

          await momai.storage.set(_getWaContactsKey(), waContacts).catch(() => {})

          const total = Object.values<any>(waContacts).filter(
            (c) => c.phone && !c.id.endsWith('@g.us')
          ).length
          momai.sendEvent('contacts_synced', { count: total, isFinal: true })
          _notifyContactsUpdated()

          result = { ok: true, syncedContacts: total }
          break
        }
        case 'get_wa_contacts': {
          result = await _fetchPaginatedWaEntries({
            groupsOnly: false,
            search: msg.payload.args?.search,
            page: msg.payload.args?.page,
            perPage: msg.payload.args?.perPage
          })
          break
        }
        case 'get_wa_groups': {
          result = await _fetchPaginatedWaEntries({
            groupsOnly: true,
            search: msg.payload.args?.search,
            page: msg.payload.args?.page,
            perPage: msg.payload.args?.perPage
          })
          break
        }
        case 'get_group_participants': {
          const groupJid = msg.payload?.args?.groupJid || msg.payload?.args?.jid
          result = await getGroupParticipants(groupJid)
          break
        }
        case 'get_history':
          if (chatHistory.length === 0) {
            await loadChatHistory()
          }
          result = {
            history: chatHistory.slice(0, 50).map(enrichHistoryEntry)
          }
          break
        case 'delete_message': {
          const jid = msg.payload?.args?.jid
          if (!jid) {
            result = { ok: false, error: 'jid is required' }
            break
          }
          const before = chatHistory.length
          chatHistory = chatHistory.filter((m) => m.jid !== jid)
          const deleted = before - chatHistory.length
          if (deleted > 0) {
            schedulePersistChatHistory()
            momai.sendEvent('history_updated', { count: chatHistory.length })
          }
          result = { ok: true, deleted, remaining: chatHistory.length }
          break
        }
        case 'flush_history':
          await flushPersistedChatHistory()
          result = { ok: true, count: chatHistory.length }
          break
        case 'flush_credentials':
          try {
            const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
            const reEncrypted = await reEncryptCredsAfterBaileys(authDir)
            await flushPersistedChatHistory()
            result = { ok: true, reEncrypted, count: chatHistory.length }
          } catch (err) {
            momai.log(`flush_credentials failed: ${err.message}`)
            result = { ok: false, error: err.message }
          }
          break
        case 'get_avatars': {
          const jids = Array.isArray(msg.payload.args?.jids) ? msg.payload.args.jids : []
          const force = msg.payload.args?.force === true
          const unique: any[] = [...new Set(jids.filter((j) => typeof j === 'string' && j.includes('@')))]
          const avatars = {}
          for (let i = 0; i < unique.length; i++) {
            if (i > 0) await new Promise((r) => setTimeout(r, 300))
            avatars[unique[i]] = await ensureAvatarForJid(unique[i], { force })
          }
          result = { avatars }
          break
        }
        case 'disconnect':
        case 'logout': {
          preventAutoReconnect = true
          connected = false
          lastQr = null
          lastQrAt = 0
          momai.log('WhatsApp disconnect requested')
          if (sock) {
            try {
              await sock.logout()
            } catch (e) {
              momai.log(`disconnect logout: ${e.message}`)
            }
            try {
              sock.end(undefined)
            } catch (e) {
              momai.log(`disconnect end: ${e.message}`)
            }
            sock = null
          }
          // Clear session files from disk so Baileys generates a clean QR
          try {
            const fsSync = require('fs')
            const authDir = path.join(momai.storage.storageDir, 'baileys-auth')
            if (fsSync.existsSync(authDir)) {
              fsSync.rmSync(authDir, { recursive: true, force: true })
            }
          } catch (err) {
            momai.log(`disconnect session wipe failed: ${err.message}`)
          }
          // Reset internal memory state
          waContacts = {}
          chatHistory = []
          totalMessages = 0
          _currentPhone = null
          momai.sendEvent('authenticated', { status: 'logged_out' })
          momai.sendEvent('connection_status', { status: 'disconnected' })
          result = { ok: true }
          break
        }
        case 'update_settings': {
          const args = msg.payload.args || {}
          if (args.notificationsDisabled !== undefined) {
            notificationsDisabled = args.notificationsDisabled
          }
          await momai.storage.set(_getSettingsKey(), { notificationsDisabled })
          result = { ok: true, notificationsDisabled }
          break
        }
        case 'get_settings': {
          result = { ok: true, settings: { notificationsDisabled } }
          break
        }
        case 'panel':
          result = await getPanelData()
          break
        case 'process_notification': {
          const notifContact = msg.payload?.args?.contact || 'Desconhecido'
          const notifMessage = msg.payload?.args?.message || ''
          const notifAudio = msg.payload?.args?.audio || null
          const isNoteToSelf = !!msg.payload?.args?.isNoteToSelf
          const isGroupNotif = !!msg.payload?.args?.isGroup
          const isPhoneNumber = /^\d+$/.test(String(notifContact).replace(/\D/g, ''))

          const hasEmoji = /\p{Extended_Pictographic}/u.test(notifMessage)
          const isGif = notifMessage === '[GIF]'
          const isSticker = notifMessage === '[Sticker]'
          const isCall = notifMessage === '📞Chamada em curso...' || notifMessage.includes('Chamada em curso')
          const isAudio = notifMessage === '🎙️ Áudio'

          let ttsText
          if (isCall) {
            ttsText = `Ligação pendente de contato ${notifContact}`
          } else if (isAudio) {
            if (isNoteToSelf) {
              ttsText = 'Você enviou um áudio para si mesmo'
            } else if (isPhoneNumber) {
              ttsText = 'Um número desconhecido enviou um áudio'
            } else {
              ttsText = `${notifContact} enviou um áudio`
            }
          } else if (isGif) {
            if (isNoteToSelf) {
              ttsText = 'Você enviou um gif para si mesmo'
            } else if (isPhoneNumber) {
              ttsText = 'Um número desconhecido enviou um gif'
            } else {
              ttsText = `${notifContact} enviou um gif`
            }
          } else if (isSticker) {
            if (isNoteToSelf) {
              ttsText = 'Você enviou um sticker para si mesmo'
            } else if (isPhoneNumber) {
              ttsText = 'Um número desconhecido enviou um sticker'
            } else {
              ttsText = `${notifContact} enviou um sticker`
            }
          } else if (hasEmoji) {
            if (isNoteToSelf) {
              ttsText = 'Você enviou um emoji para si mesmo'
            } else if (isPhoneNumber) {
              ttsText = 'Um número desconhecido enviou um emoji'
            } else {
              ttsText = `${notifContact} enviou um emoji`
            }
          } else {
            if (isNoteToSelf) {
              ttsText = `Você enviou para si mesmo: ${notifMessage}`
            } else if (isPhoneNumber) {
              ttsText = `Um número desconhecido disse: ${notifMessage}`
            } else {
              ttsText = `${notifContact} disse: ${notifMessage}`
            }
          }

          const quickReplies = []
          if (notifMessage && !isGif && !isSticker && !isCall && !isAudio) {
            quickReplies.push(`Obrigado pela mensagem, ${notifContact}!`)
            quickReplies.push(`Vou verificar e respondo em breve.`)
          }
          result = {
            quickReplies,
            tts: ttsText,
            audio: notifAudio
          }
          break
        }
        default: {
          // Voice command via "responda": reply to last contact
          const lastIncoming = chatHistory.find((m) => m.direction === 'incoming')
          const cmdContent = String(msg.payload?.content || '')
            .toLowerCase()
            .trim()

          if (
            lastIncoming &&
            (cmdContent.startsWith('responda') || cmdContent.startsWith('responde'))
          ) {
            const replyMsg = msg.payload.content.replace(/^(responda|responde)\s+/i, '').trim()
            if (replyMsg) {
              await sendMessage(lastIncoming.jid, replyMsg)
              result = {
                ok: true,
                to: lastIncoming.from,
                message: replyMsg,
                directResponse: `Mensagem enviada para ${lastIncoming.from}`
              }
            } else {
              result = {
                ok: false,
                error: 'mensagem vazia',
                directResponse: 'Fale a mensagem depois de responda'
              }
            }
          } else {
            result = await getPanelData()
          }
          break
        }
      }
      process.send({ type: 'response', requestId: msg.requestId, result })
    } catch (err) {
      process.send({
        type: 'response',
        requestId: msg.requestId,
        result: { ok: false, error: err.message }
      })
    }
  }
})

function gracefulShutdown(reason) {
  momai.log(`[whatsapp:worker] Shutting down (${reason})...`)
  _clearReconnectTimer()
  preventAutoReconnect = true
  if (sock) {
    try {
      sock.end(undefined)
    } catch {}
    try {
      sock.ws?.close()
    } catch {}
    sock = null
  }
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

main().catch((err) => {
  momai.log(`Fatal error: ${err.message}`)
  process.exit(1)
})

