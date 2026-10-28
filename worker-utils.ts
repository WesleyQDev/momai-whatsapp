// Shared pure helpers extracted from background-worker.ts so they can be unit
// tested without booting the worker (which starts a WhatsApp connection).
// CommonJS + erasable TypeScript only — runs via Node type stripping.
'use strict'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_AUDIO_BYTES = 16 * 1024 * 1024 // 16MB (voice notes do WhatsApp)
const MAX_STICKER_BYTES = 5 * 1024 * 1024 // 5MB (stickers WebP do WhatsApp)
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024 // 25MB (incoming documents)
const MAX_VIDEO_BYTES = 64 * 1024 * 1024 // 64MB (incoming videos)
// IPC send limits: bounded fan-out per command and a per-contact rate window
// so a single tool call cannot spam a chat with unbounded attachments (item 18).
const MAX_ATTACHMENTS_PER_SEND = 5
const MAX_MESSAGE_CHARS = 4096
const SEND_RATE_WINDOW_MS = 10 * 1000
const SEND_RATE_MAX_PER_WINDOW = 15

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
  // Sessão desligada: o usuário resolve escaneando o QR, e o card de conexão
  // acompanha esta mesma resposta (ver `_connectionQrCardNow` no worker).
  if (/not connected/i.test(m)) {
    return 'O WhatsApp está desconectado — escaneie o QR para reconectar.'
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

/**
 * Shaping for a successful `send_message` result. It deliberately omits
 * `directResponse`: that field ends the host turn, so the agent would stop
 * mid-task after every send instead of continuing with the next step. The
 * plain object becomes the tool result the model reads back.
 *
 * @param {unknown} rawResult value returned by Baileys/sendMessage
 * @returns {Record<string, unknown>} tool result with `ok: true`
 */
function buildSendSuccessResult(rawResult) {
  const base = rawResult && typeof rawResult === 'object' ? rawResult : {}
  return { ...base, ok: true }
}

// Structured-response type rendered by the extension's chat card. The card
// module imports the same literal from src/services/connectionQr.ts; a unit
// test asserts both stay equal so a rename can never render "unsupported".
const CONNECTION_QR_CARD_TYPE = 'whatsapp-connection-qr'

/**
 * Builds the model instruction + chat card for the `show_connection_qr` tool.
 * The card always goes to the chat: ready (qr + expiresIn), pending (the QR is
 * still being generated) or an "already connected" guidance without a card.
 * Pure so the tool contract can be unit-tested without booting the worker.
 *
 * @param {{ connected?: boolean, qr?: string | null, expiresIn?: number, now?: number }} input
 * @returns {{ ok: boolean, connected?: boolean, pending?: boolean, instruction: string, structuredResponse?: { type: string, data: Record<string, unknown> } }}
 */
function buildConnectionQrCardResult({ connected = false, qr = null, expiresIn = 0, now = Date.now() } = {}) {
  const generatedAt = Number(now) || Date.now()
  if (connected) {
    return {
      ok: true,
      connected: true,
      instruction:
        'WhatsApp is already connected. Tell the user it is ready to use and do not show QR or pairing instructions.'
    }
  }
  const expiresInSeconds = Math.ceil(Number(expiresIn) || 0)
  if (typeof qr === 'string' && qr && expiresInSeconds > 0) {
    return {
      ok: true,
      instruction:
        'A connection QR card is displayed in the chat. Ask the user to scan it with WhatsApp > Linked devices ' +
        'and continue only after it turns connected; do not write step-by-step pairing instructions.',
      structuredResponse: {
        type: CONNECTION_QR_CARD_TYPE,
        data: { state: 'ready', qr, expiresIn: expiresInSeconds, generatedAt }
      }
    }
  }
  return {
    ok: true,
    pending: true,
    instruction:
      'A QR code is being generated and the card in the chat updates automatically. Tell the user to wait a few ' +
      'seconds and scan the code as soon as it appears; do not write step-by-step pairing instructions.',
    structuredResponse: {
      type: CONNECTION_QR_CARD_TYPE,
      data: { state: 'pending', generatedAt }
    }
  }
}

function _decodeB64(b64, label, maxBytes = MAX_IMAGE_BYTES) {
  const approxBytes = Math.ceil((b64.length * 3) / 4)
  if (approxBytes > maxBytes) {
    throw new Error(
      `${label} muito grande: ~${Math.round(approxBytes / 1024 / 1024)}MB ` +
        `(máx. ${Math.round(maxBytes / 1024 / 1024)}MB). Envie uma ${label} menor.`
    )
  }
  return Buffer.from(b64, 'base64')
}

/**
 * True for hostnames that must never be fetched by the extension: loopback,
 * link-local, private ranges, CGNAT, `.local` names and cloud metadata. Covers
 * literal IPv4/IPv6 and hostnames; DNS rebinding is out of scope here.
 */
function isPrivateNetworkHost(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === 'metadata.google.internal' || host === 'metadata.goog') return true
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const parts = ipv4.slice(1).map((part) => Number(part))
    if (parts.some((part) => part > 255)) return true
    const [a, b] = parts
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true
    if (/^fe[89ab]/.test(host)) return true
    if (/^f[cd]/.test(host)) return true
    const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) return isPrivateNetworkHost(mapped[1])
  }
  return false
}

/**
 * Accepts only https URLs pointing at public hosts. Used before handing a
 * media URL to Baileys (which downloads it) or returning it to the UI.
 * Returns null when the URL is invalid, not https or points at the local
 * network (item 17).
 */
function sanitizeRemoteMediaUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let parsed
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (isPrivateNetworkHost(parsed.hostname)) return null
  return parsed.toString()
}

/**
 * True when `filePath` resolves to `baseDir` itself or a path inside it.
 */
function isPathInside(filePath, baseDir) {
  if (typeof filePath !== 'string' || !filePath.trim()) return false
  if (typeof baseDir !== 'string' || !baseDir.trim()) return false
  const path = require('path')
  const resolved = path.resolve(filePath)
  const base = path.resolve(baseDir)
  return resolved === base || resolved.startsWith(base + path.sep)
}

/**
 * Reads a local file only when it lives inside `baseDir` and is within
 * `maxBytes`. Path-based media is a legacy contract used by automations and
 * the LLM; it must never read outside the extension storage (item 2).
 * Returns null when the path does not exist or is not a regular file.
 */
function readConfinedFile(filePath, baseDir, maxBytes, label) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null
  if (typeof baseDir !== 'string' || !baseDir.trim()) {
    throw new Error(`${label}: caminho de arquivo não permitido`)
  }
  if (!isPathInside(filePath, baseDir)) {
    throw new Error(`${label}: acesso a arquivos fora da pasta da extensão não é permitido`)
  }
  const path = require('path')
  const fsSync = require('fs')
  const resolved = path.resolve(filePath)
  let stat
  try {
    stat = fsSync.statSync(resolved)
  } catch {
    return null
  }
  if (!stat.isFile()) return null
  if (stat.size > maxBytes) {
    throw new Error(
      `${label} muito grande: ${Math.round(stat.size / 1024 / 1024)}MB ` +
        `(máx. ${Math.round(maxBytes / 1024 / 1024)}MB).`
    )
  }
  return fsSync.readFileSync(resolved)
}

/** Image types WhatsApp renders inline; other files go through `document`. */
const IMAGE_MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}
const IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i

function imageMimeForPath(filePath) {
  const path = require('path')
  return IMAGE_MIME_BY_EXT[path.extname(String(filePath || '')).toLowerCase()] || null
}

/** Strips the surrounding quotes some models add around file paths. */
function stripPathQuotes(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/^'(.*)'$/, '$1')
    .trim()
}

/**
 * True when the value is a filesystem path to an image (absolute, drive letter
 * or UNC), never a data URI, URL or base64 payload — raw base64 JPEG starts
 * with "/9j/" and must keep being decoded, not read as a path.
 */
function looksLikeImagePath(value) {
  if (typeof value !== 'string') return false
  const raw = stripPathQuotes(value)
  if (!raw || raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return false
  if (!IMAGE_EXT_RE.test(raw)) return false
  if (/^[A-Za-z]:[\\/]/.test(raw)) return true
  if (raw.startsWith('\\\\')) return true
  if (raw.includes('\\')) return true
  return raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')
}

/**
 * Reads an image sent by path. Inside the extension storage the legacy
 * confined contract applies; outside it, the read only happens when the host
 * already asked the user for this call (`allowExternal` — the worker sets it
 * from the interactive threadId), and even then only image extensions within
 * the size cap are accepted.
 */
function readImageFile(filePath, opts: any = {}) {
  const allowedFileBase = typeof opts.allowedFileBase === 'string' ? opts.allowedFileBase : ''
  const maxBytes = Number(opts.maxBytes) || MAX_IMAGE_BYTES
  const target = stripPathQuotes(filePath)
  if (!isPathInside(target, allowedFileBase)) {
    if (opts.allowExternal !== true) {
      // Legacy refusal path (kept for automations and non-interactive calls).
      return readConfinedFile(target, allowedFileBase, maxBytes, 'imagem')
    }
    const path = require('path')
    const fsSync = require('fs')
    const resolved = path.resolve(target)
    if (!imageMimeForPath(resolved)) {
      throw new Error('imagem inválida: use um arquivo .jpg, .jpeg, .png ou .webp')
    }
    let stat
    try {
      stat = fsSync.statSync(resolved)
    } catch {
      throw new Error(`imagem: arquivo não encontrado (${path.basename(resolved)})`)
    }
    if (!stat.isFile()) throw new Error('imagem: o caminho não é um arquivo')
    if (stat.size > maxBytes) {
      throw new Error(
        `imagem muito grande: ${Math.round(stat.size / 1024 / 1024)}MB ` +
          `(máx. ${Math.round(maxBytes / 1024 / 1024)}MB).`
      )
    }
    return fsSync.readFileSync(resolved)
  }
  const buffer = readConfinedFile(target, allowedFileBase, maxBytes, 'imagem')
  if (!buffer) throw new Error('imagem: arquivo não encontrado')
  return buffer
}

/**
 * Policy hook for `send_message` (host gate): an image sent by path from
 * outside the extension storage needs the user's OK — data URIs, base64 and
 * confined paths run untouched. The ruleId scopes "allow always" to the
 * folder, so prints coming from the same place only ask once.
 */
function evaluateMediaPathPolicy(args, storageDir) {
  const source = args && typeof args === 'object' ? args : {}
  const candidates = []
  const push = (value) => {
    if (looksLikeImagePath(value)) candidates.push(stripPathQuotes(value))
  }
  push(source.image)
  if (Array.isArray(source.images)) source.images.forEach(push)
  push(source.media)
  const outside = candidates.filter((value) => !isPathInside(value, storageDir))
  if (outside.length === 0) return { policy: 'allow' }
  const path = require('path')
  const first = outside[0]
  const dir = path.dirname(path.resolve(first))
  return {
    policy: 'ask',
    ruleId: `media-dir:${dir.toLowerCase()}`,
    reason:
      outside.length === 1
        ? `Enviar um arquivo de fora da extensão: ${path.basename(first)} (${dir})`
        : `Enviar ${outside.length} arquivos de fora da extensão (ex.: ${path.basename(first)} em ${dir})`
  }
}

/** Media folders owned by the extension; pruned by age and total size. */
const MEDIA_SUBDIRS = ['audio', 'images', 'stickers', 'documents', 'videos']
const MEDIA_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MEDIA_MAX_TOTAL_BYTES = 500 * 1024 * 1024

/**
 * Deletes local copies of received media (audio, images, stickers, documents,
 * videos) older than `maxAgeMs`; when the survivors still exceed
 * `maxTotalBytes`, removes the oldest first until under the budget. Only
 * touches the extension storage dir — never the user's real WhatsApp (item 8).
 */
function pruneMediaDirectories(
  storageDir,
  opts: { now?: number; maxAgeMs?: number; maxTotalBytes?: number } = {}
) {
  const fsSync = require('fs')
  const path = require('path')
  const now = Number(opts.now) || Date.now()
  const maxAgeMs = Number(opts.maxAgeMs) || MEDIA_MAX_AGE_MS
  const maxTotalBytes = Number(opts.maxTotalBytes) || MEDIA_MAX_TOTAL_BYTES
  const result = { removed: 0, freedBytes: 0, keptBytes: 0 }
  if (typeof storageDir !== 'string' || !storageDir) return result

  const survivors = []
  for (const sub of MEDIA_SUBDIRS) {
    const dir = path.join(storageDir, sub)
    let entries = []
    try {
      entries = fsSync.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      const filePath = path.join(dir, name)
      let stat
      try {
        stat = fsSync.statSync(filePath)
      } catch {
        continue
      }
      if (!stat.isFile()) continue
      if (now - stat.mtimeMs > maxAgeMs) {
        try {
          fsSync.unlinkSync(filePath)
          result.removed += 1
          result.freedBytes += stat.size
          continue
        } catch {
          // Keep the file listed when deletion fails (locked by another app).
        }
      }
      survivors.push({ filePath, size: stat.size, mtimeMs: stat.mtimeMs })
    }
  }

  let total = survivors.reduce((sum, file) => sum + file.size, 0)
  if (total > maxTotalBytes) {
    survivors.sort((a, b) => a.mtimeMs - b.mtimeMs)
    for (const file of survivors) {
      if (total <= maxTotalBytes) break
      try {
        fsSync.unlinkSync(file.filePath)
        result.removed += 1
        result.freedBytes += file.size
        total -= file.size
      } catch {}
    }
  }
  result.keptBytes = Math.max(0, total)
  return result
}

/**
 * Builds the Baileys message content. With an image, sends the image and uses
 * the text as the caption (MOM-117). Accepts a data URI, raw base64, Buffer or
 * a local image path (jpg/png/webp). Rejects imagens acima de ~10MB com erro
 * claro (evita mandar base64 gigante).
 *
 * `opts.allowedFileBase` confines path-based media to the extension storage
 * dir: the LLM/automations may reference files already saved by the extension,
 * never arbitrary paths from the machine (item 2). Image paths outside it are
 * only read when the host already asked the user (`opts.allowExternalImagePaths`
 * — set from the interactive thread), so a print produced by another extension
 * can be sent with consent instead of failing.
 */
function buildMessageContent(message, image, sticker = null, gif = null, document = null, opts: any = {}) {
  const allowedFileBase = typeof opts.allowedFileBase === 'string' ? opts.allowedFileBase : ''
  if (sticker) {
    let buffer
    if (Buffer.isBuffer(sticker)) {
      buffer = sticker
    } else if (typeof sticker === 'string' && /^data:image\/[^;]+;base64,/.test(sticker)) {
      buffer = _decodeB64(sticker.slice(sticker.indexOf(',') + 1), 'sticker', MAX_STICKER_BYTES)
    } else if (
      typeof sticker === 'string' &&
      sticker.length % 4 === 0 &&
      /^[A-Za-z0-9+/=]+$/.test(sticker)
    ) {
      buffer = _decodeB64(sticker, 'sticker', MAX_STICKER_BYTES)
    } else if (typeof sticker === 'string') {
      buffer = readConfinedFile(sticker, allowedFileBase, MAX_STICKER_BYTES, 'sticker')
      if (!buffer) {
        const safeUrl = sanitizeRemoteMediaUrl(sticker)
        if (!safeUrl) {
          throw new Error('sticker inválida: use data URI, base64, arquivo da extensão ou URL https pública')
        }
        return { sticker: { url: safeUrl } }
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
    const caption = message && message !== '[GIF]' ? message : undefined
    if (typeof gif === 'string' && /^https?:\/\//i.test(gif)) {
      const safeUrl = sanitizeRemoteMediaUrl(gif)
      if (!safeUrl) {
        throw new Error('gif inválido: use URL https pública ou data URI/base64')
      }
      // WhatsApp only plays GIFs as MP4 (gifPlayback). A real .gif source
      // (keyless fallback) would upload as a corrupt video the contact cannot
      // download, so it is sent as a downloadable image/gif document instead.
      if (!/\.mp4(\?|#|$)/i.test(safeUrl)) {
        return {
          document: { url: safeUrl },
          mimetype: 'image/gif',
          fileName: 'gif.gif',
          caption
        }
      }
      return {
        video: { url: safeUrl },
        gifPlayback: true,
        mimetype: 'video/mp4',
        caption
      }
    }
    let buffer
    const gifIsRealGif =
      typeof gif === 'string' && /^data:image\/gif[^;]*;base64,/i.test(gif)
    if (Buffer.isBuffer(gif)) {
      buffer = gif
    } else if (typeof gif === 'string' && /^data:(video|image)\/[^;]+;base64,/.test(gif)) {
      buffer = _decodeB64(gif.slice(gif.indexOf(',') + 1), 'gif', MAX_VIDEO_BYTES)
    }
    if (buffer) {
      if (gifIsRealGif) {
        return {
          document: buffer,
          mimetype: 'image/gif',
          fileName: 'gif.gif',
          caption
        }
      }
      return {
        video: buffer,
        gifPlayback: true,
        mimetype: 'video/mp4',
        caption
      }
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
        buffer = _decodeB64(rawData.slice(rawData.indexOf(',') + 1), 'documento', MAX_DOCUMENT_BYTES)
      } else if (
        typeof rawData === 'string' &&
        rawData.length % 4 === 0 &&
        /^[A-Za-z0-9+/=]+$/.test(rawData)
      ) {
        buffer = _decodeB64(rawData, 'documento', MAX_DOCUMENT_BYTES)
      } else if (typeof rawData === 'string') {
        buffer = readConfinedFile(rawData, allowedFileBase, MAX_DOCUMENT_BYTES, 'documento')
        if (buffer && !fileName) fileName = require('path').basename(rawData) || 'documento'
      }
    } else if (Buffer.isBuffer(document)) {
      buffer = document
    } else if (typeof document === 'string' && /^data:([^;]+);base64,/.test(document)) {
      const match = document.match(/^data:([^;]+);base64,/)
      if (match) mimetype = match[1]
      buffer = _decodeB64(document.slice(document.indexOf(',') + 1), 'documento', MAX_DOCUMENT_BYTES)
    } else if (
      typeof document === 'string' &&
      document.length % 4 === 0 &&
      /^[A-Za-z0-9+/=]+$/.test(document)
    ) {
      buffer = _decodeB64(document, 'documento', MAX_DOCUMENT_BYTES)
    } else if (typeof document === 'string') {
      buffer = readConfinedFile(document, allowedFileBase, MAX_DOCUMENT_BYTES, 'documento')
      if (buffer) fileName = require('path').basename(document)
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
  let imageMimetype = null
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
  } else if (looksLikeImagePath(image)) {
    buffer = readImageFile(image, {
      allowedFileBase,
      maxBytes: MAX_IMAGE_BYTES,
      allowExternal: opts.allowExternalImagePaths === true
    })
    imageMimetype = imageMimeForPath(image)
  } else {
    throw new Error('image inválida: use data URI, base64, Buffer ou caminho de arquivo')
  }
  const content: any = { image: buffer }
  if (imageMimetype) content.mimetype = imageMimetype
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

  // 2. If it ends with @lid, resolve to the known phone JID from waContacts.
  // The phone JID is the chat the user sees; the Baileys patch still addresses
  // the contact's LID device for the actual Signal session.
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
      const targetJid = getPhoneJidFromContact(c)
      if (!targetJid) continue

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
        return targetJid
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
      const targetJid = getPhoneJidFromContact(c)
      if (!targetJid) continue

      const resolvedLabel = resolveDisplayName(c, cId).toLowerCase()
      if (resolvedLabel.includes(cleanContact)) {
        return targetJid
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
 * True when the unwrapped message carries a GIF playback video.
 */
function isGifMessage(innerMsg) {
  return !!innerMsg?.videoMessage?.gifPlayback
}

/**
 * Notification text for an incoming GIF message: keeps the sender caption when
 * present, otherwise falls back to '[GIF]' placeholder so the overlay gate opens.
 */
function getGifNotificationText(innerMsg) {
  const caption = innerMsg?.videoMessage?.caption
  if (typeof caption === 'string' && caption.trim().length > 0) return caption
  return '[GIF]'
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

function isSameChat(a: string, b: string): boolean {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false
  if (a === b) return true
  const aIsGroup = a.endsWith('@g.us')
  const bIsGroup = b.endsWith('@g.us')
  if (aIsGroup || bIsGroup) {
    if (aIsGroup !== bIsGroup) return false
    const aClean = a.includes(':') ? `${a.split('@')[0].split(':')[0]}@${a.split('@')[1]}` : a
    const bClean = b.includes(':') ? `${b.split('@')[0].split(':')[0]}@${b.split('@')[1]}` : b
    return aClean === bClean
  }
  const [aUser, aDomain] = a.split('@')
  const [bUser, bDomain] = b.split('@')
  if (!aUser || !bUser || !aDomain || !bDomain) {
    const aDig = String(a).replace(/\D/g, '')
    const bDig = String(b).replace(/\D/g, '')
    return aDig.length >= 7 && aDig === bDig
  }
  if (aUser.split(':')[0] === bUser.split(':')[0] && aDomain === bDomain) return true
  const aDigits = aUser.replace(/\D/g, '')
  const bDigits = bUser.replace(/\D/g, '')
  return aDigits.length >= 7 && aDigits === bDigits
}

/**
 * Deletes all messages matching target JIDs from collections and legacy KV sources.
 */
async function deleteHistoryMessages(
  momai,
  targetJids: string[],
  opts: { sources?: Array<string | { key: string; phone?: string | null }>; phone?: string | null } = {}
) {
  const { sources = [], phone = null } = opts
  const pickPhone = phone
  let removedCount = 0

  if (hasCollections(momai)) {
    try {
      const rows = await momai.collections.list(MESSAGES_COLLECTION, {
        limit: HISTORY_LIST_LIMIT * 10
      })
      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          if (pickPhone !== null && row._phone && row._phone !== pickPhone) continue
          const rowJid = row.jid || ''
          const rowSender = row.senderJid || ''
          const rowReply = row.replyJid || ''
          const rowIsGroup = Boolean(row.isGroup || rowJid.endsWith('@g.us'))
          let matches = false
          if (rowIsGroup) {
            matches = targetJids.some(
              (target) =>
                isSameChat(target, rowJid) ||
                isSameChat(target, rowReply) ||
                target === rowJid ||
                target === rowReply
            )
          } else {
            matches = targetJids.some(
              (target) =>
                isSameChat(target, rowJid) ||
                isSameChat(target, rowSender) ||
                isSameChat(target, rowReply) ||
                target === rowJid ||
                target === rowSender ||
                target === rowReply
            )
          }
          if (matches) {
            const rowId = row._rowId ?? row.id
            if (rowId !== undefined) {
              await momai.collections.remove(MESSAGES_COLLECTION, rowId)
              removedCount++
            }
          }
        }
      }
    } catch (e) {
      logHistory(momai, `deleteHistoryMessages (collections): ${e.message}`)
    }
  }

  for (const source of sources) {
    const key = typeof source === 'string' ? source : source.key
    try {
      const saved = await momai.storage.get(key)
      if (Array.isArray(saved) && saved.length > 0) {
        const filtered = saved.filter((row) => {
          const rowJid = row.jid || ''
          const rowSender = row.senderJid || ''
          const rowReply = row.replyJid || ''
          const rowIsGroup = Boolean(row.isGroup || rowJid.endsWith('@g.us'))
          if (rowIsGroup) {
            const matches = targetJids.some(
              (target) =>
                isSameChat(target, rowJid) ||
                isSameChat(target, rowReply) ||
                target === rowJid ||
                target === rowReply
            )
            return !matches
          }
          const matches = targetJids.some(
            (target) =>
              isSameChat(target, rowJid) ||
              isSameChat(target, rowSender) ||
              isSameChat(target, rowReply) ||
              target === rowJid ||
              target === rowSender ||
              target === rowReply
          )
          return !matches
        })
        if (filtered.length !== saved.length) {
          await momai.storage.set(key, filtered)
          removedCount += saved.length - filtered.length
        }
      }
    } catch (e) {
      logHistory(momai, `deleteHistoryMessages (legacy ${key}): ${e.message}`)
    }
  }

  return { removed: removedCount }
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
        if (typeof row.id === 'string' && row.id.endsWith('@lid')) {
          try {
            await momai.collections.remove(CONTACTS_COLLECTION, row._rowId ?? row.id)
          } catch {}
          continue
        }
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
    const filteredSaved = Object.fromEntries(
      Object.entries(saved).filter(([jid]) => !jid.endsWith('@lid'))
    )
    if (hasCollections(momai)) {
      try {
        await momai.collections.upsertMany(
          CONTACTS_COLLECTION,
          Object.entries(filteredSaved).map(([jid, contact]) => {
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
    return { ...filteredSaved }
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
        limit: limit * 2,
        offset
      }),
      momai.collections.count(CONTACTS_COLLECTION, { where })
    ])
    const contacts = (Array.isArray(rows) ? rows : [])
      .filter((row) => row && typeof row.id === 'string' && !row.id.endsWith('@lid'))
      .slice(0, limit)
      .map((row) => {
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
 * Server-side contact search over indexed text fields. Returns stripped
 * bodies in rank order, or null when collections are unavailable.
 */
async function searchContacts(momai, { phone = null, query = '', limit = 100 } = {}) {
  if (!hasCollections(momai)) return null
  try {
    const rows = await momai.collections.search(CONTACTS_COLLECTION, query, {
      where: { _phone: phone },
      limit
    })
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => row && typeof row.id === 'string' && !row.id.endsWith('@lid'))
      .map((row) => {
        const body = { ...(row || {}) }
        delete body._rowId
        delete body._key
        delete body._phone
        delete body.created_at
        return body
      })
  } catch (e) {
    logHistory(momai, `searchContacts: ${e.message}`)
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
      if (row && typeof row.id === 'string' && row.id.endsWith('@lid')) {
        await momai.collections.remove(CONTACTS_COLLECTION, row._rowId ?? row.id)
        removed += 1
        continue
      }
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
 * Bounded-parallel map preserving input order. Network fan-out without
 * stampeding the phone connection.
 */
async function mapWithConcurrency(items, limit, fn) {
  const list = Array.isArray(items) ? items : []
  const workers = Math.min(Math.max(Number(limit) || 1, 1), list.length || 1)
  const results = new Array(list.length)
  let next = 0
  async function run() {
    while (next < list.length) {
      const index = next++
      results[index] = await fn(list[index], index)
    }
  }
  await Promise.all(Array.from({ length: workers }, () => run()))
  return results
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
        send({ type: 'storage-request', requestId, method, args, extensionId: 'momai-whatsapp' })
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
    collections: area('collections', ['insert', 'list', 'count', 'search', 'remove', 'clear', 'upsert', 'upsertMany']),
    sessionFiles: area('sessionFiles', ['write', 'read', 'list', 'remove']),
    __pendingCount: () => pending.size
  }
}

/**
 * True when the remote JID carries a WhatsApp Status (story) update.
 * Baileys delivers stories as `status@broadcast`.
 */
function isStatusUpdate(remoteJid) {
  if (typeof remoteJid !== 'string' || remoteJid.length === 0) return false
  return remoteJid === 'status@broadcast' || remoteJid.endsWith('@broadcast')
}

/**
 * True when the remote JID belongs to a WhatsApp Channel (Canais).
 * Channel posts are broadcast-style content, not conversations; Baileys
 * delivers them as `<id>@newsletter`.
 */
function isChannelUpdate(remoteJid) {
  if (typeof remoteJid !== 'string' || remoteJid.length === 0) return false
  return remoteJid.endsWith('@newsletter')
}

/**
 * True when a status or channel update must be skipped because the user
 * disabled status notifications. The status notifications switch mutes both
 * status stories and WhatsApp Channel posts; regular chats and groups are
 * never suppressed.
 */
function shouldSuppressStatusOrChannelUpdate(remoteJid, statusNotificationsDisabled) {
  if (!isStatusUpdate(remoteJid) && !isChannelUpdate(remoteJid)) return false
  return Boolean(statusNotificationsDisabled)
}

/**
 * Reply target for a notification: status updates answer the author,
 * everything else keeps the default conversation target. Falls back to
 * the default when the author cannot be resolved.
 */
function resolveNotificationReplyJid(remoteJid, resolvedSenderJid, defaultReplyJid) {
  if (
    isStatusUpdate(remoteJid) &&
    typeof resolvedSenderJid === 'string' &&
    resolvedSenderJid.length > 0
  ) {
    return resolvedSenderJid
  }
  return defaultReplyJid
}

/**
 * Spoken alert for a status update. Names the status so it never sounds
 * like a regular chat message.
 */
function getStatusTtsText(opts) {
  const input = opts || {}
  const isNoteToSelf = Boolean(input.isNoteToSelf)
  const isPhoneNumber = Boolean(input.isPhoneNumber)
  const contact = typeof input.contact === 'string' && input.contact ? input.contact : 'Alguém'
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  const mediaKind = input.mediaKind || 'text'
  const subject = isNoteToSelf ? 'Você' : isPhoneNumber ? 'Um número desconhecido' : contact
  if (mediaKind === 'video') return `${subject} postou um status em vídeo`
  if (mediaKind === 'image') return `${subject} postou um status com foto`
  if (mediaKind === 'audio') return `${subject} postou um status com áudio`
  if (mediaKind === 'document') return `${subject} postou um status com documento`
  if (mediaKind === 'sticker') return `${subject} postou um status com figurinha`
  if (mediaKind === 'gif') return `${subject} postou um status com gif`
  if (message) {
    const cleanedStatus = stripEmojis(message)
    const isStatusOnlyEmoji =
      isOnlyEmojiMessage(message) ||
      (HAS_EMOJI_REGEX.test(message) && (!cleanedStatus || !/[a-zA-Z0-9\p{L}]/u.test(cleanedStatus)))
    if (isStatusOnlyEmoji) return `${subject} postou um status com emoji`
    if (cleanedStatus) return `${subject} postou um status: ${cleanedStatus}`
    return `${subject} postou um status`
  }
  return `${subject} postou um status`
}

const EMOJI_ONLY_REGEX =
  /^(?:(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\uFE0E|\u200D|\p{Emoji_Modifier}|[0-9#*]\uFE0F?\u20E3)|\s)+$/u
const HAS_EMOJI_REGEX =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3)/u
const EMOJI_STRIP_REGEX =
  /(?:[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}{1,2}|\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u2600-\u27BF\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}]|[\uFE0E\uFE0F\u200D\u20E3])/gu

/**
 * Strips all emojis, modifiers, pictographic symbols, and combining selectors
 * from a string, normalizing whitespace so TTS can read the text cleanly without
 * reading emoji names or code points out loud.
 */
function stripEmojis(text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(EMOJI_STRIP_REGEX, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
}

/**
 * Returns true only if the message contains one or more emojis and no other text characters.
 */
function isOnlyEmojiMessage(message) {
  if (typeof message !== 'string') return false
  const trimmed = message.trim()
  return (
    trimmed.length > 0 &&
    HAS_EMOJI_REGEX.test(trimmed) &&
    EMOJI_ONLY_REGEX.test(trimmed)
  )
}

/**
 * Checks if a string contains exclusively a phone number.
 */
function isPhoneNumberString(str) {
  if (typeof str !== 'string') return false
  const digitsOnly = str.replace(/\D/g, '')
  return digitsOnly.length >= 7 && /^\+?[\d\s\-()]+$/.test(str.trim())
}

/**
 * Builds the spoken notification alert (TTS) for WhatsApp incoming messages,
 * media and calls.
 *
 * Rules:
 * - A message is announced as "enviou um emoji" ONLY if it consists purely of emojis.
 *   Messages containing text alongside emojis are spoken as text messages.
 * - Group messages announce who sent them and in which group:
 *   "contato X no grupo Y enviou [X]" instead of "Grupo Y enviou [X]".
 */
function getNotificationTtsText(opts) {
  const input = opts || {}
  const notifContact = String(input.contact || '').trim() || 'Desconhecido'
  const notifSenderName = typeof input.senderName === 'string' ? input.senderName.trim() : ''
  const notifGroupName = typeof input.groupName === 'string' ? input.groupName.trim() : ''
  const notifMessage = typeof input.message === 'string' ? input.message : ''
  const notifAudio = input.audio || null
  const notifSticker = input.sticker || null
  const notifImage = input.image || null
  const notifDocument = input.document || null
  const notifDocumentName = input.documentName || null
  const notifVideo = input.video || null
  const notifIsStatus = Boolean(input.isStatus)
  const isNoteToSelf = Boolean(input.isNoteToSelf)
  const isGroupNotif = Boolean(
    input.isGroup ||
    (typeof input.contactJid === 'string' && input.contactJid.endsWith('@g.us'))
  )
  const docLabel = notifDocumentName || 'um documento'

  const isCall =
    notifMessage === '📞Chamada em curso...' ||
    notifMessage.includes('Chamada em curso')
  const isAudio = notifMessage === '🎙️ Áudio' || !!notifAudio
  const isGif = notifMessage === '[GIF]'
  const isSticker = notifMessage === '[Sticker]' || !!notifSticker
  const isImage =
    notifMessage === '📷 Foto' ||
    notifMessage.startsWith('📷') ||
    !!notifImage
  const isVideo =
    notifMessage === '🎥 Vídeo' ||
    notifMessage.startsWith('🎥') ||
    !!notifVideo
  const isDocument =
    notifMessage === '📄 Documento' ||
    notifMessage.startsWith('📄') ||
    !!notifDocument

  const trimmedMessage = notifMessage.trim()
  const rawHasEmoji = HAS_EMOJI_REGEX.test(trimmedMessage)
  const cleanedMessage = stripEmojis(notifMessage)
  const hasAlphanumeric = /[a-zA-Z0-9\p{L}]/u.test(cleanedMessage)

  // Pure emoji detection:
  // 1) isOnlyEmojiMessage(notifMessage) is true, OR
  // 2) it contained emojis and after stripping emojis no alphanumeric text remains
  const isOnlyEmoji =
    isOnlyEmojiMessage(notifMessage) ||
    (rawHasEmoji && (!cleanedMessage || !hasAlphanumeric))

  const spokenMessage = cleanedMessage || trimmedMessage

  // 1. Status / Story
  if (notifIsStatus && typeof getStatusTtsText === 'function') {
    const isPhone = isPhoneNumberString(notifContact)
    const mediaKind = isVideo
      ? 'video'
      : isAudio
        ? 'audio'
        : isGif
          ? 'gif'
          : isSticker
            ? 'sticker'
            : isImage
              ? 'image'
              : isDocument
                ? 'document'
                : 'text'
    return getStatusTtsText({
      contact: notifContact,
      message: notifMessage,
      mediaKind,
      isNoteToSelf,
      isPhoneNumber: isPhone
    })
  }

  // 2. Grupo
  if (isGroupNotif) {
    const groupLabel = notifGroupName || notifContact || 'Grupo'
    const groupLower = groupLabel.toLowerCase()
    const groupPhrase =
      groupLower === 'grupo'
        ? 'no grupo'
        : groupLower.startsWith('grupo ')
          ? `no ${groupLabel}`
          : `no ${groupLabel}`

    const rawSender =
      notifSenderName ||
      (notifContact && notifContact !== groupLabel ? notifContact : '') ||
      'Alguém'
    const isSenderPhone = isPhoneNumberString(rawSender)

    let senderSubject
    if (isNoteToSelf) {
      senderSubject = 'Você'
    } else if (isSenderPhone) {
      senderSubject = 'Um número desconhecido'
    } else {
      senderSubject = rawSender
    }

    if (isCall) {
      return `Ligação pendente de ${senderSubject} ${groupPhrase}`
    }
    if (isAudio) {
      return `${senderSubject} enviou ${groupPhrase} um áudio`
    }
    if (isGif) {
      return `${senderSubject} enviou ${groupPhrase} um gif`
    }
    if (isSticker) {
      return `${senderSubject} enviou ${groupPhrase} um sticker`
    }
    if (isImage) {
      return `${senderSubject} enviou ${groupPhrase} uma foto`
    }
    if (isVideo) {
      return `${senderSubject} enviou ${groupPhrase} um vídeo`
    }
    if (isDocument) {
      return `${senderSubject} enviou ${groupPhrase} um documento (${docLabel})`
    }
    if (isOnlyEmoji) {
      return `${senderSubject} enviou ${groupPhrase} um emoji`
    }
    if (!spokenMessage) {
      return `${senderSubject} enviou ${groupPhrase} uma mensagem`
    }
    return `${senderSubject} enviou ${groupPhrase}: ${spokenMessage}`
  }

  // 3. Conversa direta
  const isPhone = isPhoneNumberString(notifContact)
  if (isCall) {
    return `Ligação pendente de contato ${notifContact}`
  }
  if (isAudio) {
    if (isNoteToSelf) return 'Você enviou um áudio para si mesmo'
    if (isPhone) return 'Um número desconhecido enviou um áudio'
    return `${notifContact} enviou um áudio`
  }
  if (isGif) {
    if (isNoteToSelf) return 'Você enviou um gif para si mesmo'
    if (isPhone) return 'Um número desconhecido enviou um gif'
    return `${notifContact} enviou um gif`
  }
  if (isSticker) {
    if (isNoteToSelf) return 'Você enviou um sticker para si mesmo'
    if (isPhone) return 'Um número desconhecido enviou um sticker'
    return `${notifContact} enviou um sticker`
  }
  if (isImage) {
    if (isNoteToSelf) return 'Você enviou uma foto para si mesmo'
    if (isPhone) return 'Um número desconhecido enviou uma foto'
    return `${notifContact} enviou uma foto`
  }
  if (isVideo) {
    if (isNoteToSelf) return 'Você enviou um vídeo para si mesmo'
    if (isPhone) return 'Um número desconhecido enviou um vídeo'
    return `${notifContact} enviou um vídeo`
  }
  if (isDocument) {
    if (isNoteToSelf) return `Você enviou um documento para si mesmo (${docLabel})`
    if (isPhone) return `Um número desconhecido enviou um documento (${docLabel})`
    return `${notifContact} enviou um documento (${docLabel})`
  }
  if (isOnlyEmoji) {
    if (isNoteToSelf) return 'Você enviou um emoji para si mesmo'
    if (isPhone) return 'Um número desconhecido enviou um emoji'
    return `${notifContact} enviou um emoji`
  }
  if (isNoteToSelf) {
    return spokenMessage
      ? `Você enviou para si mesmo: ${spokenMessage}`
      : 'Você enviou uma mensagem para si mesmo'
  }
  if (isPhone) {
    return spokenMessage
      ? `Um número desconhecido disse: ${spokenMessage}`
      : 'Um número desconhecido enviou uma mensagem'
  }
  return spokenMessage
    ? `${notifContact} disse: ${spokenMessage}`
    : `${notifContact} enviou uma mensagem`
}

/**
 * Resolves the `quoted` payload used to answer a WhatsApp Status (story).
 * Replying with the original status message makes WhatsApp render the
 * "Name · Status" quote with the media preview, exactly like the app;
 * a plain reply would show up as an unrelated message. Returns null when
 * the status message is no longer cached or the context is malformed.
 */
function resolveStatusReplyQuoted(statusContext, storedMessage) {
  if (!statusContext || typeof statusContext !== 'object') return null
  const stanzaId =
    typeof statusContext.stanzaId === 'string' ? statusContext.stanzaId.trim() : ''
  if (!stanzaId) return null
  if (!storedMessage || !storedMessage.key || !storedMessage.message) return null
  const participant =
    typeof statusContext.participant === 'string' ? statusContext.participant.trim() : ''
  return participant ? { ...storedMessage, participant } : storedMessage
}

/**
 * Resolves the `quoted` payload used to answer a standard WhatsApp message.
 */
function resolveReplyQuoted(quoted, targetJid, isGroup = false, cachedProto = null) {
  if (!quoted) return null
  const id = typeof quoted === 'string' ? quoted : quoted.id || quoted.stanzaId
  if (!id) return null

  const fromMe = quoted.direction === 'outgoing' || Boolean(quoted.fromMe)
  const participant = isGroup
    ? (quoted.senderJid || quoted.participant || (!fromMe ? targetJid : undefined))
    : undefined

  const key = {
    remoteJid: targetJid,
    fromMe,
    id: String(id),
    ...(participant ? { participant } : {})
  }

  if (cachedProto) {
    return {
      key,
      message: cachedProto
    }
  }

  let message: any = {}
  if (quoted.image) {
    message = {
      imageMessage: {
        caption: quoted.text && quoted.text !== '📷 Foto' ? quoted.text : ''
      }
    }
  } else if (quoted.video || quoted.gif || quoted.isGif) {
    message = {
      videoMessage: {
        caption: quoted.text && quoted.text !== '🎥 Vídeo' && quoted.text !== '[GIF]' ? quoted.text : '',
        gifPlayback: Boolean(quoted.gif || quoted.isGif)
      }
    }
  } else if (quoted.sticker) {
    message = {
      stickerMessage: {}
    }
  } else if (quoted.document || quoted.documentName) {
    message = {
      documentMessage: {
        fileName: quoted.documentName || quoted.text || 'Documento'
      }
    }
  } else if (quoted.audio) {
    message = {
      audioMessage: {}
    }
  } else {
    message = {
      conversation: quoted.text || ''
    }
  }

  return {
    key,
    message
  }
}

/**
 * Extracts quoted message info from a Baileys inner message contextInfo.
 */
function extractQuotedMessage(innerMsg) {
  if (!innerMsg || typeof innerMsg !== 'object') return null
  const contextInfo =
    innerMsg?.extendedTextMessage?.contextInfo ||
    innerMsg?.imageMessage?.contextInfo ||
    innerMsg?.videoMessage?.contextInfo ||
    innerMsg?.documentMessage?.contextInfo ||
    innerMsg?.stickerMessage?.contextInfo ||
    innerMsg?.audioMessage?.contextInfo ||
    innerMsg?.contextInfo ||
    null

  if (!contextInfo?.stanzaId || !contextInfo?.quotedMessage) return null

  const qm = contextInfo.quotedMessage
  const qInner =
    qm?.ephemeralMessage?.message ||
    qm?.viewOnceMessage?.message ||
    qm?.viewOnceMessageV2?.message ||
    qm?.documentWithCaptionMessage?.message ||
    qm

  const qSenderJid = contextInfo.participant ? String(contextInfo.participant).trim() : null
  const qText =
    qInner?.conversation ||
    qInner?.extendedTextMessage?.text ||
    qInner?.imageMessage?.caption ||
    qInner?.videoMessage?.caption ||
    qInner?.documentMessage?.caption ||
    qInner?.documentMessage?.fileName ||
    (qInner?.imageMessage ? '📷 Foto' : qInner?.videoMessage ? (qInner?.videoMessage?.gifPlayback ? '[GIF]' : '🎥 Vídeo') : qInner?.stickerMessage ? '🏷️ Figurinha' : qInner?.audioMessage ? '🎙️ Áudio' : '')

  return {
    id: String(contextInfo.stanzaId),
    senderJid: qSenderJid,
    text: qText || '',
    image: qInner?.imageMessage ? true : undefined,
    video: qInner?.videoMessage && !qInner?.videoMessage?.gifPlayback ? true : undefined,
    gif: qInner?.videoMessage?.gifPlayback ? true : undefined,
    isGif: Boolean(qInner?.videoMessage?.gifPlayback),
    audio: qInner?.audioMessage ? true : undefined,
    sticker: qInner?.stickerMessage ? true : undefined,
    document: qInner?.documentMessage ? true : undefined,
    documentName: qInner?.documentMessage?.fileName || undefined
  }
}

/** Cooldown / debounce threshold for WhatsApp group fetching (3 minutes). */
const GROUP_FETCH_COOLDOWN_MS = 3 * 60 * 1000

/**
 * Determines whether group fetching should be executed based on the last fetch timestamp,
 * cooldown threshold, and whether a forced sync was requested.
 */
function shouldFetchGroups(
  lastFetchTs: number,
  cooldownMs: number = GROUP_FETCH_COOLDOWN_MS,
  now: number = Date.now(),
  force: boolean = false
): boolean {
  if (force) return true
  if (!lastFetchTs || lastFetchTs <= 0) return true
  return now - lastFetchTs >= cooldownMs
}

/**
 * Presença do overlay de contatos (chat aberto por clique).
 *
 * Enquanto houver um overlay de conversa aberto, mensagens novas NÃO devem
 * abrir o overlay de notificação (que substituiria o chat aberto no modo
 * `replace` do host). A mensagem aparece ao vivo no chat aberto via eventos
 * `whatsapp_message`, e os demais contatos sinalizam só pela bolinha verde
 * (badge) + card "Nova" (unread). O worker é o gatekeeper: o panel anuncia
 * `opened`/`heartbeat`/`closed` e o worker consulta `isHistoryOverlayOpen`
 * antes de emitir `whatsapp_notification`.
 *
 * O store é um Map<jId, lastSeenMs> mantido pelo worker; `now` é injetável
 * para testes. Entradas sem heartbeat expiram pelo TTL (fecha-crash seguro:
 * overlay fechado sem `closed` some sozinho).
 *
 * O panel bate heartbeat a cada 5s; 15s dá 3 batimentos de folga e encurta a
 * janela em que a supressão "vaza" depois que o overlay fecha sem avisar.
 */
const HISTORY_OVERLAY_PRESENCE_TTL_MS = 15 * 1000

function cleanHistoryOverlayJid(jid) {
  const raw = String(jid || '').trim()
  if (!raw) return ''
  if (raw.includes(':') && raw.includes('@')) {
    const [user, domain] = raw.split('@')
    return `${user.split(':')[0]}@${domain}`
  }
  return raw
}

function noteHistoryOverlayPresence(store, jid, now = Date.now()) {
  const key = cleanHistoryOverlayJid(jid)
  if (!key) return false
  store.set(key, Number(now) || Date.now())
  return true
}

function removeHistoryOverlayPresence(store, jid) {
  const key = cleanHistoryOverlayJid(jid)
  if (!key) return false
  return store.delete(key)
}

function isHistoryOverlayOpen(store, now = Date.now(), ttlMs = HISTORY_OVERLAY_PRESENCE_TTL_MS) {
  const at = Number(now) || Date.now()
  let open = false
  for (const [key, lastSeen] of store) {
    if (at - Number(lastSeen) < ttlMs) {
      open = true
    } else {
      store.delete(key)
    }
  }
  return open
}

/**
 * True quando a conversa `jid` tem um overlay de contatos aberto (comparação
 * tolerante a sufixo de device/telefone). Mensagem desse chat já está sendo
 * vista ao vivo: não gera badge (bolinha) nem entra no card NOVA.
 */
function isHistoryOverlayOpenFor(store, jid, now = Date.now(), ttlMs = HISTORY_OVERLAY_PRESENCE_TTL_MS) {
  const target = cleanHistoryOverlayJid(jid)
  if (!target) return false
  const at = Number(now) || Date.now()
  let open = false
  for (const [key, lastSeen] of store) {
    if (at - Number(lastSeen) >= ttlMs) {
      store.delete(key)
      continue
    }
    if (typeof isSameChat === 'function' ? isSameChat(key, target) : key === target) {
      open = true
    }
  }
  return open
}

/**
 * Returns the phone/LID user digits from a WhatsApp JID, ignoring the device
 * suffix and the server. `211093884559589:30@lid` -> `211093884559589`.
 * A naive `replace(/[^0-9]/g, '')` would include the `:30` device and miss the
 * Signal session files (`session-<user>.<device>.json`).
 */
function normalizeJidUser(jid) {
  if (!jid) return ''
  const userPart = String(jid).split('@')[0].split(':')[0]
  return userPart.replace(/[^0-9]/g, '')
}

/** True for the Baileys/libsignal decryption-failure messages we throttle. */
function isDecryptFailureDetail(detail) {
  return /Bad MAC|No matching sessions|No session record|failed to decrypt|no session found/i.test(
    String(detail || '')
  )
}

/**
 * Self-LID repair policy. Only own messages (`key.fromMe === true`) with an
 * unrecoverable MAC/session failure are eligible; contact LIDs are never
 * cleared here (the v0.12.0 session-safety regression).
 *
 * Returns the self LID JID (`<user>@lid`) or null when no repair is allowed.
 */
function shouldRepairSelfLid(detail, key, meLid) {
  if (!/Bad MAC|No matching sessions/i.test(String(detail || ''))) return null
  if (!key || key.fromMe !== true) return null
  const lidUser = normalizeJidUser(meLid)
  return lidUser ? `${lidUser}@lid` : null
}

/**
 * Builds the `authState.keys.set({ session: ... })` payload for a JID.
 * Includes every existing session file for that user (all devices) plus the
 * base `.0`/`.1` ids used by Baileys' cache. Null removes the entry/file via
 * the Baileys file lock; callers must never unlink session files directly
 * while the socket is open.
 */
function buildSessionClearKeys(jid, sessionFileNames = [], altJid = null) {
  const keys = {}
  const allowedUsers = new Set(
    [normalizeJidUser(jid), normalizeJidUser(altJid)].filter(Boolean)
  )
  for (const name of sessionFileNames) {
    if (typeof name !== 'string' || !name.startsWith('session-') || !name.endsWith('.json')) {
      continue
    }
    const id = name.slice('session-'.length, -'.json'.length)
    const user = id.split('.')[0]
    if (id && allowedUsers.has(user)) keys[id] = null
  }
  const user = normalizeJidUser(jid)
  if (user) {
    keys[user] = null
    keys[`${user}.0`] = null
    keys[`${user}.1`] = null
  }
  return keys
}

/**
 * Counts decrypt failures per message id and reports every `threshold`-th
 * occurrence. The caller still owns the time-based cooldown and the actual
 * session clear, so repeated retries cannot cause a clear storm.
 */
function createDecryptFailureTracker({ threshold = 3, maxEntries = 500 } = {}) {
  const counts = new Map()
  const step = Math.max(1, Number(threshold) || 1)
  const max = Math.max(1, Number(maxEntries) || 1)
  return {
    record(id) {
      const key = String(id || '').trim() || 'unknown'
      const next = (counts.get(key) || 0) + 1
      counts.set(key, next)
      if (counts.size > max) {
        const oldest = counts.keys().next().value
        if (oldest !== undefined) counts.delete(oldest)
      }
      return next % step === 0
    },
    reset(id) {
      counts.delete(String(id || '').trim() || 'unknown')
    },
    clear() {
      counts.clear()
    },
    get size() {
      return counts.size
    }
  }
}

/**
 * Sliding-window budget for destructive repairs. Prevents a clear/recreate
 * loop when the peer never re-handshakes: at most `max` repairs per key in
 * `windowMs`; `exhausted` means the caller should stop and surface a re-pair
 * hint instead of clearing again.
 */
function createRepairBudget({ max = 2, windowMs = 60 * 60 * 1000 } = {}) {
  const attempts = new Map()
  const limit = Math.max(1, Number(max) || 1)
  const window = Math.max(1, Number(windowMs) || 1)
  return {
    tryAcquire(key, now = Date.now()) {
      const id = String(key || '').trim() || 'unknown'
      const recent = (attempts.get(id) || []).filter((ts) => now - ts < window)
      if (recent.length >= limit) {
        attempts.set(id, recent)
        return { allowed: false, exhausted: true, attempts: recent.length }
      }
      recent.push(now)
      attempts.set(id, recent)
      return { allowed: true, exhausted: false, attempts: recent.length }
    },
    reset(key) {
      attempts.delete(String(key || '').trim() || 'unknown')
    },
    clear() {
      attempts.clear()
    }
  }
}

module.exports = {
  withTimeout,
  friendlySendError,
  buildSendSuccessResult,
  normalizeJidUser,
  isDecryptFailureDetail,
  shouldRepairSelfLid,
  buildSessionClearKeys,
  createDecryptFailureTracker,
  createRepairBudget,
  CONNECTION_QR_CARD_TYPE,
  buildConnectionQrCardResult,
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
  isGifMessage,
  getGifNotificationText,
  getRecentChatMedia,
  resolveDocumentPath,
  isStatusUpdate,
  isChannelUpdate,
  shouldSuppressStatusOrChannelUpdate,
  resolveNotificationReplyJid,
  getStatusTtsText,
  stripEmojis,
  isOnlyEmojiMessage,
  isPhoneNumberString,
  getNotificationTtsText,
  resolveStatusReplyQuoted,
  resolveReplyQuoted,
  extractQuotedMessage,
  cacheGet,
  cacheSet,
  MESSAGES_COLLECTION,
  HISTORY_LIST_LIMIT,
  HISTORY_RETENTION_MS,
  CONTACTS_COLLECTION,
  trackHistoryMessage,
  loadHistoryMessages,
  deleteHistoryMessages,
  isSameChat,
  pruneHistoryMessages,
  loadContacts,
  syncContacts,
  rekeyContacts,
  fetchContactPage,
  searchContacts,
  mapWithConcurrency,
  createIpcMomai,
  GROUP_FETCH_COOLDOWN_MS,
  shouldFetchGroups,
  HISTORY_OVERLAY_PRESENCE_TTL_MS,
  cleanHistoryOverlayJid,
  noteHistoryOverlayPresence,
  removeHistoryOverlayPresence,
  isHistoryOverlayOpen,
  isHistoryOverlayOpenFor,
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_STICKER_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_VIDEO_BYTES,
  MAX_ATTACHMENTS_PER_SEND,
  MAX_MESSAGE_CHARS,
  SEND_RATE_WINDOW_MS,
  SEND_RATE_MAX_PER_WINDOW,
  isPrivateNetworkHost,
  sanitizeRemoteMediaUrl,
  readConfinedFile,
  isPathInside,
  looksLikeImagePath,
  imageMimeForPath,
  readImageFile,
  evaluateMediaPathPolicy,
  MEDIA_SUBDIRS,
  MEDIA_MAX_AGE_MS,
  MEDIA_MAX_TOTAL_BYTES,
  pruneMediaDirectories
}
