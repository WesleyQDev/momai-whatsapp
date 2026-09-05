// Shared pure helpers extracted from background-worker.ts so they can be unit
// tested without booting the worker (which starts a WhatsApp connection).
// CommonJS + erasable TypeScript only — runs via Node type stripping.
'use strict'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_AUDIO_BYTES = 16 * 1024 * 1024 // 16MB (voice notes do WhatsApp)
const MAX_STICKER_BYTES = 5 * 1024 * 1024 // 5MB (stickers WebP do WhatsApp)
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024 // 25MB (incoming documents)

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
    if (!entry.image && !entry.document) continue
    items.push({
      image: entry.image || null,
      document: entry.document || null,
      documentName: entry.documentName || null,
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
  getRecentChatMedia,
  resolveDocumentPath,
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_STICKER_BYTES,
  MAX_DOCUMENT_BYTES
}
