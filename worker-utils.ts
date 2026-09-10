// Shared pure helpers extracted from background-worker.ts so they can be unit
// tested without booting the worker (which starts a WhatsApp connection).
// CommonJS + erasable TypeScript only — runs via Node type stripping.
'use strict'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_AUDIO_BYTES = 16 * 1024 * 1024 // 16MB (voice notes do WhatsApp)
const MAX_STICKER_BYTES = 5 * 1024 * 1024 // 5MB (stickers WebP do WhatsApp)
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024 // 25MB (incoming documents)
const MAX_VIDEO_BYTES = 64 * 1024 * 1024 // 64MB (incoming videos)

/**
 * Races a promise against a timeout. Sempre limpa o timer depois que o race
 * assenta (resolve OU reject), e engole a rejeição tardia do perdedor para não
 * vazar unhandled-rejection.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage = 'timeout'): Promise<T> {
  let timer = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  })
  if (promise && typeof (promise as any).catch === 'function') {
    ;(promise as any).catch(() => {})
  }
  timeoutPromise.catch(() => {})
  const winner = Promise.race([promise, timeoutPromise])
  return winner.finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Traduz erros crus do WhatsApp/Baileys em orientações acionáveis (pt-BR).
 * `not-acceptable` é a rejeição 403 do servidor ao preparar o envio para um
 * GRUPO: sessão do número no grupo dessincronizada, grupo não-participado ou
 * permissão (só admins). Mantém os erros que já são claros.
 */
function friendlySendError(message, contact) {
  const m = String(message || '')
  const target = contact || 'destinatário'

  if (/not-acceptable/i.test(m)) {
    return (
      `O WhatsApp recusou o envio para "${target}" (not-acceptable). Costuma ser a sessão ` +
      `do número no grupo dessincronizada ou sem permissão. Tente no celular: saia e entre ` +
      `no grupo de novo, ou reconecte o WhatsApp na extensão.`
    )
  }
  if (/Invalid contact/i.test(m)) {
    return `Destinatário inválido: "${target}". Confira o nome ou número.`
  }
  // Erros já claros e acionáveis: não re-traduzir.
  if (/não registrado no WhatsApp/i.test(m) || /nem como contato/i.test(m)) {
    return m
  }
  // O próprio worker já gera essa mensagem clara quando o WebSocket está
  // fechado — não re-traduzir para algo mais genérico.
  if (/reconectando/i.test(m)) {
    return m
  }
  // Erros crus de race de reconexão (sock nulo/substituído no meio do envio).
  if (/Cannot read propert(y|ies) of (null|undefined)/i.test(m) || /reading 'ws'/i.test(m)) {
    return `O WhatsApp reconectou no meio do envio para "${target}". Tente novamente em instantes.`
  }
  if (/timeout/i.test(m)) {
    return `O envio para "${target}" demorou demais (timeout de rede). Tente novamente.`
  }
  return m
}

function _decodeB64(b64, label) {
  const approxBytes = Math.ceil((b64.length * 3) / 4)
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw new Error(
      `${label} muito grande: ~${Math.round(approxBytes / 1024 / 1024)}MB ` +
        `(máx. ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB). Envie uma ${label} menor.`
    )
  }
  return Buffer.from(b64, 'base64')
}

/**
 * Builds the Baileys message content. With an image, sends the image and uses
 * the text as the caption (MOM-117). Accepts a data URI, raw base64 or Buffer.
 * Rejects imagens acima de ~10MB com erro claro (evita mandar base64 gigante).
 */
function buildMessageContent(message, image, sticker = null, gif = null, document = null) {
  if (sticker) {
    let buffer
    if (Buffer.isBuffer(sticker)) {
      buffer = sticker
    } else if (typeof sticker === 'string' && /^data:image\/[^;]+;base64,/.test(sticker)) {
      buffer = _decodeB64(sticker.slice(sticker.indexOf(',') + 1), 'sticker')
    } else if (
      typeof sticker === 'string' &&
      sticker.length % 4 === 0 &&
      /^[A-Za-z0-9+/=]+$/.test(sticker)
    ) {
      buffer = _decodeB64(sticker, 'sticker')
    } else if (typeof sticker === 'string') {
      const fsSync = require('fs')
      if (fsSync.existsSync(sticker)) {
        buffer = fsSync.readFileSync(sticker)
      } else {
        return { sticker: { url: sticker } }
      }
    }
    if (buffer) {
      if (buffer.length > MAX_STICKER_BYTES) {
        throw new Error(
          `sticker muito grande: ${buffer.length} bytes (máx. ${MAX_STICKER_BYTES}).`
        )
      }
      return { sticker: buffer }
    }
  }

  if (gif) {
    if (typeof gif === 'string' && (gif.startsWith('http://') || gif.startsWith('https://'))) {
      return { video: { url: gif }, gifPlayback: true, caption: message || undefined }
    }
    let buffer
    if (Buffer.isBuffer(gif)) {
      buffer = gif
    } else if (typeof gif === 'string' && /^data:video\/[^;]+;base64,/.test(gif)) {
      buffer = _decodeB64(gif.slice(gif.indexOf(',') + 1), 'gif')
    }
    if (buffer) {
      return { video: buffer, gifPlayback: true, caption: message || undefined }
    }
  }

  if (document) {
    let buffer
    let fileName = 'documento'
    let mimetype = 'application/octet-stream'

    if (typeof document === 'object' && document !== null && !Buffer.isBuffer(document)) {
      if (document.fileName || document.name) {
        fileName = String(document.fileName || document.name)
      }
      if (document.mimetype || document.type) {
        mimetype = String(document.mimetype || document.type)
      }
      const rawData = document.dataUrl || document.data || document.buffer
      if (Buffer.isBuffer(rawData)) {
        buffer = rawData
      } else if (typeof rawData === 'string' && /^data:([^;]+);base64,/.test(rawData)) {
        const match = rawData.match(/^data:([^;]+);base64,/)
        if (match && !document.mimetype && !document.type) mimetype = match[1]
        buffer = _decodeB64(rawData.slice(rawData.indexOf(',') + 1), 'documento')
      } else if (
        typeof rawData === 'string' &&
        rawData.length % 4 === 0 &&
        /^[A-Za-z0-9+/=]+$/.test(rawData)
      ) {
        buffer = _decodeB64(rawData, 'documento')
      } else if (typeof rawData === 'string') {
        const fsSync = require('fs')
        if (fsSync.existsSync(rawData)) {
          buffer = fsSync.readFileSync(rawData)
        }
      }
    } else if (Buffer.isBuffer(document)) {
      buffer = document
    } else if (typeof document === 'string' && /^data:([^;]+);base64,/.test(document)) {
      const match = document.match(/^data:([^;]+);base64,/)
      if (match) mimetype = match[1]
      buffer = _decodeB64(document.slice(document.indexOf(',') + 1), 'documento')
    } else if (
      typeof document === 'string' &&
      document.length % 4 === 0 &&
      /^[A-Za-z0-9+/=]+$/.test(document)
    ) {
      buffer = _decodeB64(document, 'documento')
    } else if (typeof document === 'string') {
      const fsSync = require('fs')
      if (fsSync.existsSync(document)) {
        buffer = fsSync.readFileSync(document)
        fileName = require('path').basename(document)
      }
    }

    if (buffer) {
      if (buffer.length > MAX_DOCUMENT_BYTES) {
        throw new Error(
          `documento muito grande: ${buffer.length} bytes (máx. ${MAX_DOCUMENT_BYTES}). Envie um documento menor.`
        )
      }
      const content: any = {
        document: buffer,
        mimetype,
        fileName
      }
      if (message) content.caption = message
      return content
    }
    throw new Error('documento inválido: use data URI, base64, Buffer ou path existente')
  }

  if (!image) return { text: message }
  let buffer
  if (typeof image === 'string' && /^data:image\/[^;]+;base64,/.test(image)) {
    buffer = _decodeB64(image.slice(image.indexOf(',') + 1), 'imagem')
  } else if (
    typeof image === 'string' &&
    image.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(image)
  ) {
    buffer = _decodeB64(image, 'imagem')
  } else if (Buffer.isBuffer(image)) {
    if (image.length > MAX_IMAGE_BYTES) {
      throw new Error(
        `imagem muito grande: ${image.length} bytes (máx. ${MAX_IMAGE_BYTES}). Envie uma imagem menor.`
      )
    }
    buffer = image
  } else {
    throw new Error('image inválida: use data URI, base64 ou Buffer')
  }
  const content: any = { image: buffer }
  if (message) content.caption = message
  return content
}

/**
 * Sanitiza nomes de arquivo vindos de IDs de mensagem (podem conter `/`, `\`,
 * `..`, etc.) para nunca montar paths fora do diretório de áudio.
 */
function sanitizeMediaFilename(input, fallback = 'media') {
  const cleaned = String(input || '')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^\.+/, '')
  return cleaned || String(fallback)
}

/**
 * Decide se a checagem de existência (onWhatsApp) agrega valor ANTES de enviar.
 *
 * onWhatsApp faz um USync query por telefone — um roundtrip no servidor que pode
 * levar segundos (e mais ainda durante a sync pós-conexão) e ainda falha para
 * contatos @lid. Para destinos que o app JÁ conhece, a checagem só infla a
 * latência do envio (e estoura o timeout do painel). Pula quando:
 *   - é grupo (@g.us) ou @lid (não são números de telefone para consultar);
 *   - o input veio como JID completo (contato da lista, últimas mensagens,
 *     notificação) — quem mandou mensagem ou está na agenda existe no WhatsApp;
 *   - o JID resolve para um contato já em waContacts (por id, lid ou telefone).
 * Só consulta o WhatsApp para números crus/desconhecidos (sem '@' e fora do
 * cache local), onde a validação de "número registrado" realmente importa.
 */
function shouldCheckWhatsAppExistence(contact, jid, waContacts) {
  if (!jid || typeof jid !== 'string') return false
  if (jid.endsWith('@g.us') || jid.endsWith('@lid')) return false
  // Input já era um JID completo → destino já resolvido pelo app.
  if (typeof contact === 'string' && contact.includes('@')) return false
  const rawDigits = jid.split('@')[0].replace(/\D/g, '')
  if (!rawDigits) return false
  const known = Object.values<any>(waContacts || {}).some((c) => {
    if (!c) return false
    const cId = String(c.id || '')
    const cLid = String(c.lid || '')
    const cPhoneDigits = String(c.phone || '').replace(/\D/g, '')
    const cIdDigits = cId.split('@')[0].replace(/\D/g, '')
    const cLidDigits = cLid.replace(/\D/g, '')
    return (
      cId === jid ||
      cLid === jid ||
      (cPhoneDigits && cPhoneDigits === rawDigits) ||
      (cIdDigits && cIdDigits === rawDigits) ||
      (cLidDigits && cLidDigits === rawDigits)
    )
  })
  return !known
}

const DEFAULT_YIELD_CHUNK_SIZE = 50

/**
 * Itera `items` chamando `fn(item, i)` por elemento e CEDE o event loop
 * (macrotask `setImmediate`) a cada `chunkSize` itens.
 *
 * Por que é necessário: loops de sync do worker (messaging-history.set,
 * fetchAndStoreGroups, contacts/groups upsert) processam milhares de contatos,
 * chats e mensagens de forma síncrona. Enquanto rodam, mensagens IPC do host
 * (comandos `execute` — send_message) ficam na fila do pipe até o loop terminar,
 * e o host aborta o comando aos 30s ("Extension execution timeout"). O yield
 * com `setImmediate` (macrotask) deixa o Node processar IPC pendente entre
 * chunks. `await Promise.resolve()` NÃO resolve: é microtask, que roda antes do
 * próximo macrotask e não drena o pipe.
 *
 * Preserva ordem e resultado: mesma sequência de chamadas, mesmos side effects.
 * `continue` do for original vira `return` na callback.
 */
async function forEachYield(items, fn, chunkSize = DEFAULT_YIELD_CHUNK_SIZE) {
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    fn(items[i], i)
    if (i > 0 && i % chunkSize === 0) {
      await new Promise((resolve) => setImmediate(resolve))
    }
  }
}

/**
 * Resolve um "contato" (nome, número, JID) para um JID do WhatsApp. Versão pura:
 * `ctx` injeta os stores em memória (waContacts, contactNames) e o resolver de
 * nome exibido, permitindo testar sem worker. Retorna `null` para input vazio e
 * o nome cru (sem '@') quando não resolveu — o chamador decide entre retry
 * (sync ainda populando) ou erro claro.
 */
function resolveJidForSending(contact, ctx: any = {}) {
  const waContacts: any = ctx.waContacts || {}
  const contactNames: any = ctx.contactNames || {}
  const resolveDisplayName: any = ctx.resolveDisplayName || ((_c: any, jid: any) => jid)
  if (!contact || typeof contact !== 'string' || contact.trim() === '') {
    return null
  }

  let jid = contact.trim()

  // 1. If it's already a valid group JID, return it directly
  if (jid.endsWith('@g.us')) {
    return jid
  }

  // Helper to extract a valid phone @s.whatsapp.net JID from a waContacts object.
  // Contatos LID-only (Privacy ID) têm o "phone" preenchido com o próprio LID
  // numérico, que NÃO é um telefone real. Fabricar um @s.whatsapp.net a partir
  // desse valor gera um JID inexistente. Para esses, devolve o JID @lid, que o
  // Baileys aceita como destinatário. (MOM-117)
  const getPhoneJidFromContact = (c) => {
    if (!c) return null
    if (c.id && c.id.endsWith('@g.us')) return c.id
    if (c.id && c.id.endsWith('@lid')) return c.lid || c.id
    if (c.phone) {
      const cleanPhone = c.phone.replace(/\D/g, '')
      if (cleanPhone) return `${cleanPhone}@s.whatsapp.net`
    }
    if (c.id && c.id.endsWith('@s.whatsapp.net')) return c.id
    return null
  }

  // Helper to find a contact in waContacts by key (ID, phone, LID, or LID digits)
  const findWaContactByKeyOrDigits = (keyStr) => {
    if (!keyStr) return null
    const cleanKey = String(keyStr).trim()
    const rawDigits = cleanKey.replace(/\D/g, '')

    return Object.values<any>(waContacts).find(
      (c) =>
        c.id === cleanKey ||
        c.phone === cleanKey ||
        c.lid === cleanKey ||
        c.lid === `${cleanKey}@lid` ||
        (rawDigits && c.phone && c.phone === rawDigits) ||
        (rawDigits && c.id && c.id.split('@')[0] === rawDigits) ||
        (rawDigits && c.lid && c.lid.split('@')[0] === rawDigits)
    )
  }

  // 2. If it ends with @lid, resolve to s.whatsapp.net JID from waContacts
  if (jid.endsWith('@lid')) {
    const phoneMatched =
      Object.values<any>(waContacts).find((c) => c.lid === jid && !c.id.endsWith('@lid')) ||
      Object.values<any>(waContacts).find((c) => c.lid === jid)
    const phoneJid = getPhoneJidFromContact(phoneMatched)
    if (phoneJid) return phoneJid
    return jid // fallback
  }

  // 3. If it contains letters (i.e. it is a display name like "Pai Tenebroso")
  const isJid = jid.includes('@')
  const hasLetters = /[a-zA-Z\s]/.test(jid.split('@')[0])

  if (!isJid || hasLetters) {
    const cleanContact = jid.split('@')[0].trim().toLowerCase()

    // Priority 1: Direct match in waContacts (name, notify, verifiedName, labels, phone)
    for (const [cId, c] of Object.entries<any>(waContacts)) {
      if (cId.endsWith('@lid')) continue
      const targetPhoneJid = getPhoneJidFromContact(c)
      if (!targetPhoneJid) continue

      const customName = (
        contactNames[cId] ||
        (c.phone && contactNames[c.phone]) ||
        (c.lid && contactNames[c.lid]) ||
        (c.lid && contactNames[c.lid.split('@')[0]]) ||
        ''
      ).toLowerCase()
      const cName = (c.name || '').toLowerCase()
      const cNotify = (c.notify || '').toLowerCase()
      const cVerified = (c.verifiedName || '').toLowerCase()
      const cPhone = (c.phone || '').toLowerCase()

      if (
        (customName && customName === cleanContact) ||
        (cName && cName === cleanContact) ||
        (cNotify && cNotify === cleanContact) ||
        (cVerified && cVerified === cleanContact) ||
        (cPhone && cPhone === cleanContact)
      ) {
        return targetPhoneJid
      }
    }

    // Priority 2: Match in contactNames, but resolve LID keys to phone numbers via waContacts
    for (const [key, name] of Object.entries<any>(contactNames)) {
      if (name && name.toLowerCase() === cleanContact) {
        const matched = findWaContactByKeyOrDigits(key)
        const phoneJid = getPhoneJidFromContact(matched)
        if (phoneJid) return phoneJid

        if (key.endsWith('@s.whatsapp.net')) {
          return key
        }

        const rawDigits = key.replace(/\D/g, '')
        if (
          rawDigits &&
          !key.endsWith('@lid') &&
          !rawDigits.startsWith('179') &&
          !rawDigits.startsWith('211') &&
          !rawDigits.startsWith('399')
        ) {
          if (rawDigits.length >= 10 && rawDigits.length <= 14) {
            return `${rawDigits}@s.whatsapp.net`
          }
        }
      }
    }

    // Priority 3: Partial match search in waContacts
    for (const [cId, c] of Object.entries<any>(waContacts)) {
      if (cId.endsWith('@lid')) continue
      const targetPhoneJid = getPhoneJidFromContact(c)
      if (!targetPhoneJid) continue

      const resolvedLabel = resolveDisplayName(c, cId).toLowerCase()
      if (resolvedLabel.includes(cleanContact)) {
        return targetPhoneJid
      }
    }
  }

  // 4. If it's just a raw number (digits only), format as @s.whatsapp.net
  if (!jid.includes('@')) {
    const digitsOnly = jid.replace(/\D/g, '')
    if (digitsOnly) {
      return `${digitsOnly}@s.whatsapp.net`
    }
  }

  return jid
}

/**
 * Diz se um log de erro do Baileys é ruído benigno que não deve alarmar como
 * Error na UI de Logs.
 *
 * Caso coberto: `unexpected error in 'init queries' (Timed Out)` — emitido pelo
 * Baileys (socket.js `onUnexpectedError`) quando `executeInitQueries()`
 * (fetchProps + fetchBlocklist + fetchPrivacySettings, disparadas após
 * `connection open`) estoura `defaultQueryTimeoutMs`. A conexão continua open;
 * são queries de paridade com o WA Web que o worker refaz sob demanda. O mesmo
 * vale para `presence update requests` com timeout logo após o open.
 */
function isBenignBaileysLog(msgText, detail) {
  const msg = String(msgText || '')
  const det = String(detail || '')
  const isPostOpenQuery = /init queries|presence update requests/i.test(msg)
  if (!isPostOpenQuery) return false
  return /timed?\s*out|timeout/i.test(msg + ' ' + det)
}

/**
 * True when the unwrapped message carries a photo. Checked in
 * `handleMessagesUpsert` alongside conversation/sticker/gif/audio so photos
 * are not dropped before history and `whatsapp_notification` events.
 */
function isImageMessage(innerMsg) {
  return !!innerMsg?.imageMessage
}

/**
 * Notification text for an incoming photo: keeps the sender caption when
 * present, otherwise falls back to a non-empty placeholder so the overlay
 * gate (`message`/`text` required) opens. Matches the existing `[Sticker]` /
 * `[GIF]` / audio placeholders.
 */
function getImageNotificationText(innerMsg) {
  const caption = innerMsg?.imageMessage?.caption
  if (typeof caption === 'string' && caption.trim().length > 0) return caption
  return '📷 Foto'
}

/**
 * True when the unwrapped message carries a document. Checked in
 * `handleMessagesUpsert` alongside the other media kinds so documents reach
 * history and `whatsapp_notification` events instead of being dropped.
 */
function isDocumentMessage(innerMsg) {
  return !!innerMsg?.documentMessage
}

/**
 * Notification text for an incoming document: keeps the sender caption when
 * present, otherwise the original filename, otherwise a non-empty placeholder
 * so the overlay gate (`message`/`text` required) opens.
 */
function getDocumentNotificationText(innerMsg) {
  const caption = innerMsg?.documentMessage?.caption
  if (typeof caption === 'string' && caption.trim().length > 0) return caption
  const fileName = innerMsg?.documentMessage?.fileName
  if (typeof fileName === 'string' && fileName.trim().length > 0) return fileName
  return '📄 Documento'
}

/**
 * Resolves an incoming-document filename to an absolute path confined to the
 * extension `documents/` storage dir. Returns null for anything that escapes
 * the dir (absolute paths, `..` segments, separators) so `open_document`
 * can never be pointed at arbitrary files.
 */
function resolveDocumentPath(storageDir, filename) {
  if (typeof storageDir !== 'string' || storageDir.length === 0) return null
  if (typeof filename !== 'string' || filename.length === 0) return null
  if (filename.includes('/') || filename.includes('\\')) return null
  if (filename.includes('..')) return null
  if (!/^[\w\-. ]+$/u.test(filename)) return null
  const path = require('path')
  const base = path.resolve(storageDir, 'documents')
  const resolved = path.resolve(base, filename)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null
  return resolved
}
/**
 * True when the unwrapped message carries a video (not a GIF: GIFs ride on
 * videoMessage with gifPlayback and keep their own branch). Checked in
 * `handleMessagesUpsert` alongside the other media kinds so plain videos reach
 * history and `whatsapp_notification` events instead of being dropped.
 */
function isVideoMessage(innerMsg) {
  return !!innerMsg?.videoMessage && !innerMsg.videoMessage.gifPlayback
}

/**
 * Notification text for an incoming video: keeps the sender caption when
 * present, otherwise falls back to a non-empty placeholder so the overlay
 * gate (`message`/`text` required) opens. Matches the existing photo/audio
 * placeholders.
 */
function getVideoNotificationText(innerMsg) {
  const caption = innerMsg?.videoMessage?.caption
  if (typeof caption === 'string' && caption.trim().length > 0) return caption
  return '🎥 Vídeo'
}

/**
 * Latest media attachments of one chat, oldest first, capped. Derived from the
 * in-memory `chatHistory` (newest first) so each `whatsapp_notification` event
 * carries every recent photo/document of that chat — the overlay remounts per
 * notification, so the panel cannot accumulate them in local state.
 */
function getRecentChatMedia(history, replyJid, limit = 10) {
  if (!Array.isArray(history) || !replyJid) return []
  const items = []
  for (const entry of history) {
    if (!entry || entry.replyJid !== replyJid) continue
    if (!entry.image && !entry.document && !entry.video) continue
    items.push({
      image: entry.image || null,
      document: entry.document || null,
      documentName: entry.documentName || null,
      video: entry.video || null,
      text: typeof entry.text === 'string' ? entry.text : '',
      timestamp: Number(entry.timestamp) || 0
    })
    if (items.length >= limit) break
  }
  return items.reverse()
}

/**
 * Builds a short actionable detail for a Baileys log payload.
 *
 * Baileys `socket.js` logs `logger.error({ node }, 'stream errored out')` on
 * `CB:stream:error`, so pino carries the cause in `node` (not `err`). The
 * previous extractor only read `err.message/error` and produced an empty
 * `stream errored out` line. This helper prefers `err/error` and falls back
 * to `node.attrs.code + child tag` (e.g. `code=440 reason=conflict`).
 */
function summarizeBaileysDetail(source) {
  if (!source || typeof source !== 'object') return ''
  const fromErr =
    source.err?.message ||
    source.error?.message ||
    source.err?.stack ||
    source.error?.stack ||
    (typeof source.error === 'string' ? source.error : '') ||
    (typeof source.err === 'string' ? source.err : '') ||
    ''
  if (fromErr) return String(fromErr).slice(0, 300)
  const node = source.node
  if (!node || typeof node !== 'object') return ''
  const attrs = node.attrs && typeof node.attrs === 'object' ? node.attrs : {}
  const parts: string[] = []
  if (attrs.code !== undefined && attrs.code !== null && String(attrs.code).length > 0) {
    parts.push(`code=${String(attrs.code)}`)
  }
  const content = Array.isArray(node.content) ? node.content : []
  const tags = content
    .map((child) => child && child.tag)
    .filter((tag) => typeof tag === 'string' && tag.length > 0)
  if (tags.length > 0) parts.push(`reason=${tags.join(',')}`)
  if (typeof attrs.text === 'string' && attrs.text.length > 0) {
    parts.push(`text=${attrs.text.slice(0, 120)}`)
  }
  return parts.join(' ')
}

/**
 * Unified extension cache with storage fallback. Newer hosts expose
 * `momai.cache` (discardable, under <userData>/cache/extensions/<id>/cache);
 * older hosts only have `momai.storage`. Reads check the cache first and
 * promote a legacy storage value on hit, so one upgrade moves the data.
 */
function hasExtensionCache(momai) {
  return !!(
    momai &&
    momai.cache &&
    typeof momai.cache.get === 'function' &&
    typeof momai.cache.set === 'function'
  )
}

async function cacheGet(momai, key) {
  if (hasExtensionCache(momai)) {
    let hit = null
    try {
      hit = await momai.cache.get(key)
    } catch {}
    if (hit !== null && hit !== undefined) return hit
    let legacy = null
    try {
      legacy = await momai.storage.get(key)
    } catch {}
    if (legacy !== null && legacy !== undefined) {
      try {
        await momai.cache.set(key, legacy)
      } catch {}
      return legacy
    }
    return null
  }
  return momai.storage.get(key)
}

async function cacheSet(momai, key, value) {
  if (hasExtensionCache(momai)) {
    await momai.cache.set(key, value)
    return
  }
  await momai.storage.set(key, value)
}

const MESSAGES_COLLECTION = 'messages'
const HISTORY_LIST_LIMIT = 500
const HISTORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const CONTACTS_COLLECTION = 'contacts'
const CONTACTS_LIST_LIMIT = 5000

function contactKey(phone, jid) {
  return `${phone || ''}:${jid}`
}

function defaultContactSortKey(jid, contact) {
  const candidate =
    (contact && (contact.name || contact.notify || contact.phone)) || (jid || '').split('@')[0] || jid || ''
  return String(candidate).toLowerCase()
}

function hasCollections(momai) {
  return Boolean(
    momai && momai.collections && typeof momai.collections.insert === 'function'
  )
}

function logHistory(momai, message) {
  try {
    momai.log(message)
  } catch {}
}

/** One row per message; never rewrites history. Fire-and-forget safe. */
async function trackHistoryMessage(momai, entry, phone) {
  if (!hasCollections(momai)) return
  try {
    await momai.collections.insert(MESSAGES_COLLECTION, { ...entry, _phone: phone || null })
  } catch (e) {
    logHistory(momai, `trackHistoryMessage: ${e.message}`)
  }
}

/**
 * Collection first (filtered by phone when given), legacy KV sources second
 * with best-effort backfill stamped from the source key. Returns the raw
 * rows; callers enrich and cap in memory as before.
 */
async function loadHistoryMessages(
  momai,
  opts: { sources?: Array<string | { key: string; phone?: string | null }>; phone?: string | null } = {}
) {
  const { sources = [], phone = null } = opts
  const pickPhone = phone
  if (hasCollections(momai)) {
    try {
      const rows = await momai.collections.list(MESSAGES_COLLECTION, {
        limit: HISTORY_LIST_LIMIT
      })
      if (Array.isArray(rows) && rows.length > 0) {
        const filtered =
          pickPhone === null ? rows : rows.filter((row) => row._phone === pickPhone)
        if (filtered.length > 0) return filtered
      }
    } catch (e) {
      logHistory(momai, `loadHistoryMessages: ${e.message}`)
    }
  }
  for (const source of sources) {
    const key = typeof source === 'string' ? source : source.key
    const sourcePhone = typeof source === 'string' ? null : source.phone || null
    let saved = null
    try {
      saved = await momai.storage.get(key)
    } catch {}
    if (!Array.isArray(saved) || saved.length === 0) continue
    if (hasCollections(momai)) {
      try {
        for (const message of saved) {
          await momai.collections.insert(MESSAGES_COLLECTION, {
            ...message,
            _phone: sourcePhone
          })
        }
        try {
          await momai.storage.delete(key)
        } catch {}
      } catch (e) {
        logHistory(momai, `loadHistoryMessages backfill: ${e.message}`)
      }
    }
    return saved
  }
  return []
}

/** Deletes records older than the retention window. */
async function pruneHistoryMessages(momai, olderThanMs = HISTORY_RETENTION_MS) {
  if (!hasCollections(momai)) return { removed: 0 }
  try {
    return await momai.collections.clear(MESSAGES_COLLECTION, { olderThanMs })
  } catch (e) {
    logHistory(momai, `pruneHistoryMessages: ${e.message}`)
    return { removed: 0 }
  }
}

/**
 * Rebuilds the contacts map from one row per contact. Falls back to legacy
 * whole-map keys once, backfilling stamped rows and deleting the legacy key.
 */
async function loadContacts(momai, { sources = [], phone = null } = {}) {
  const pickPhone = phone === undefined ? null : phone
  if (hasCollections(momai)) {
    try {
      const rows = await momai.collections.list(CONTACTS_COLLECTION, {
        limit: CONTACTS_LIST_LIMIT
      })
      const map = {}
      for (const row of Array.isArray(rows) ? rows : []) {
        if (pickPhone !== null && row._phone !== pickPhone) continue
        const body = { ...row }
        delete body._rowId
        delete body._key
        delete body._phone
        delete body.created_at
        if (body.id) map[body.id] = body
      }
      if (Object.keys(map).length > 0) return map
    } catch (e) {
      logHistory(momai, `loadContacts: ${e.message}`)
    }
  }
  for (const source of sources) {
    const key = typeof source === 'string' ? source : source.key
    const sourcePhone = typeof source === 'string' ? null : source.phone || null
    let saved = null
    try {
      saved = await momai.storage.get(key)
    } catch {}
    if (!saved || typeof saved !== 'object' || Object.keys(saved).length === 0) continue
    if (hasCollections(momai)) {
      try {
        await momai.collections.upsertMany(
          CONTACTS_COLLECTION,
          Object.entries(saved).map(([jid, contact]) => {
            const body = ((contact ?? {}) as Record<string, unknown>) || {}
            return {
              ...body,
              id: jid,
              isGroup: typeof jid === 'string' && jid.endsWith('@g.us'),
              sortKey: defaultContactSortKey(jid, body),
              _phone: sourcePhone,
              _key: contactKey(sourcePhone, jid)
            }
          })
        )
        try {
          await momai.storage.delete(key)
        } catch {}
      } catch (e) {
        logHistory(momai, `loadContacts backfill: ${e.message}`)
      }
    }
    return { ...saved }
  }
  return {}
}

/**
 * Server-side contact page: filter + sort + count in storage, returning
 * only the requested window. Null when collections are unavailable so
 * callers fall back to the in-memory path.
 */
async function fetchContactPage(
  momai,
  { phone = null, groupsOnly = false, limit = 20, offset = 0 } = {}
) {
  if (!hasCollections(momai)) return null
  try {
    const where = { _phone: phone, isGroup: Boolean(groupsOnly) }
    const [rows, counted] = await Promise.all([
      momai.collections.list(CONTACTS_COLLECTION, {
        where,
        orderBy: 'sortKey',
        order: 'asc',
        limit,
        offset
      }),
      momai.collections.count(CONTACTS_COLLECTION, { where })
    ])
    const contacts = (Array.isArray(rows) ? rows : []).map((row) => {
      const body = { ...(row || {}) }
      delete body._rowId
      delete body._key
      delete body._phone
      delete body.created_at
      return body
    })
    return { contacts, total: counted.count }
  } catch (e) {
    logHistory(momai, `fetchContactPage: ${e.message}`)
    return null
  }
}

/**
 * Deletes unscoped rows left by a persist that ran before the phone was
 * known. The next sync re-inserts them stamped, so nothing is lost.
 */
async function rekeyContacts(momai) {
  if (!hasCollections(momai)) return { removed: 0 }
  try {
    const rows = await momai.collections.list(CONTACTS_COLLECTION, {
      limit: CONTACTS_LIST_LIMIT
    })
    let removed = 0
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row && row._phone !== undefined && row._phone !== null) continue
      await momai.collections.remove(CONTACTS_COLLECTION, row._rowId ?? row.id)
      removed += 1
    }
    return { removed }
  } catch (e) {
    logHistory(momai, `rekeyContacts: ${e.message}`)
    return { removed: 0 }
  }
}

/**
 * Diffs the in-memory map against the last persisted snapshot: upserts
 * changed/new contacts in one batch and removes deleted rows by id.
 * The 40 mutation sites keep touching the map; only this persist path
 * talks to storage. Returns the new snapshot plus stats.
 */
async function syncContacts(
  momai,
  { phone = null, map = {}, snapshot = null, sortKeyFor = null }: { phone?: string | null; map?: Record<string, any>; snapshot?: string | null; sortKeyFor?: ((jid: string, contact: any) => string) | null } = {}
) {
  const empty = { snapshot: snapshot || '{}', stats: { upserted: 0, removed: 0 } }
  if (!hasCollections(momai)) return empty
  /** @type {Record<string, string>} */
  const current: Record<string, string> = {}
  for (const [jid, contact] of Object.entries(map || {})) {
    try {
      current[jid] = JSON.stringify(contact ?? null)
    } catch {
      current[jid] = ''
    }
  }
  /** @type {Record<string, string>} */
  let previous: Record<string, string> = {}
  try {
    previous = snapshot ? JSON.parse(snapshot) : {}
  } catch {
    previous = {}
  }
  const keyFor = typeof sortKeyFor === 'function' ? sortKeyFor : defaultContactSortKey
  // Stamp first, diff second: sortKey/isGroup changes must trigger upserts too.
  /** @type {Record<string, string>} */
  const stamped: Record<string, string> = {}
  for (const [jid, serialized] of Object.entries(current)) {
    try {
      const contact = JSON.parse(serialized || 'null') || {}
      stamped[jid] = JSON.stringify({
        ...contact,
        id: jid,
        isGroup: typeof jid === 'string' && jid.endsWith('@g.us'),
        sortKey: keyFor(jid, contact),
        _phone: phone,
        _key: contactKey(phone, jid)
      })
    } catch {
      stamped[jid] = ''
    }
  }
  const changed = Object.entries(stamped)
    .filter(([jid, serialized]) => previous[jid] !== serialized)
    .map(([, serialized]) => JSON.parse(serialized))
  const removedKeys = Object.keys(previous).filter((jid) => !(jid in stamped))
  let upserted = 0
  let removed = 0
  try {
    if (changed.length > 0) {
      const res = await momai.collections.upsertMany(CONTACTS_COLLECTION, changed)
      upserted = res.upserted
    }
    if (removedKeys.length > 0) {
      const rows = await momai.collections.list(CONTACTS_COLLECTION, {
        limit: CONTACTS_LIST_LIMIT
      })
      const condemned = new Set(removedKeys.map((jid) => contactKey(phone, jid)))
      for (const row of Array.isArray(rows) ? rows : []) {
        if (condemned.has(row._key)) {
          await momai.collections.remove(CONTACTS_COLLECTION, row._rowId ?? row.id)
          removed += 1
        }
      }
    }
  } catch (e) {
    logHistory(momai, `syncContacts: ${e.message}`)
    return { snapshot: snapshot || '{}', stats: { upserted: 0, removed: 0 } }
  }
  return { snapshot: JSON.stringify(stamped), stats: { upserted, removed } }
}

/**
 * IPC momai bridge for persistent workers: same storage/collections/
 * sessionFiles shape as the host bridge, executed by the parent process
 * over the fork channel. Rejects with the host errorCode instead of
 * hanging when the parent answers { ok:false } or never answers.
 */
function createIpcMomai(
  {
    send,
    onResponse,
    storageDir,
    timeoutMs = 30000,
    log
  }: {
    send: (msg: any) => void
    onResponse: (fn: (msg: any) => void) => void
    storageDir: string
    timeoutMs?: number
    log?: (msg: string) => void
  } = {} as any
) {
  let seq = 0
  const pending = new Map()
  const notify = (message) => {
    try {
      if (typeof log === 'function') log(message)
    } catch {}
  }
  onResponse((msg) => {
    if (!msg || msg.type !== 'storage-response' || !msg.requestId) return
    const entry = pending.get(msg.requestId)
    if (!entry) return
    pending.delete(msg.requestId)
    clearTimeout(entry.timer)
    const result = msg.result || {}
    if (result.ok === false) {
      const err = new Error(result.error || 'storage request failed') as Error & { code?: string }
      if (result.errorCode) err.code = result.errorCode
      entry.reject(err)
    } else {
      entry.resolve(result.value)
    }
  })
  function call(method, args) {
    return new Promise((resolve, reject) => {
      const requestId = `s${Date.now()}.${seq++}`
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error(`storage IPC timeout: ${method}`))
      }, timeoutMs)
      if (timer.unref) timer.unref()
      pending.set(requestId, { resolve, reject, timer })
      try {
        send({ type: 'storage-request', requestId, method, args })
      } catch (e) {
        pending.delete(requestId)
        clearTimeout(timer)
        reject(e)
      }
    })
  }
  const area = (prefix, methods) =>
    Object.fromEntries(methods.map((name) => [name, (...args) => call(`${prefix}.${name}`, args)]))
  return {
    log: (message) => notify(message),
    sendEvent: () => {},
    sendStructuredResponse: () => {},
    storage: {
      storageDir,
      ...area('storage', ['get', 'set', 'getMany', 'setMany', 'delete', 'listKeys', 'migrate'])
    },
    collections: area('collections', ['insert', 'list', 'count', 'remove', 'clear', 'upsert', 'upsertMany']),
    sessionFiles: area('sessionFiles', ['write', 'read', 'list', 'remove']),
    __pendingCount: () => pending.size
  }
}

module.exports = {
  withTimeout,
  friendlySendError,
  buildMessageContent,
  sanitizeMediaFilename,
  resolveJidForSending,
  shouldCheckWhatsAppExistence,
  forEachYield,
  isBenignBaileysLog,
  summarizeBaileysDetail,
  isImageMessage,
  getImageNotificationText,
  isDocumentMessage,
  getDocumentNotificationText,
  isVideoMessage,
  getVideoNotificationText,
  getRecentChatMedia,
  resolveDocumentPath,
  cacheGet,
  cacheSet,
  MESSAGES_COLLECTION,
  HISTORY_LIST_LIMIT,
  HISTORY_RETENTION_MS,
  CONTACTS_COLLECTION,
  trackHistoryMessage,
  loadHistoryMessages,
  pruneHistoryMessages,
  loadContacts,
  syncContacts,
  rekeyContacts,
  fetchContactPage,
  createIpcMomai,
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_STICKER_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_VIDEO_BYTES
}
