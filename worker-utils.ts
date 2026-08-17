// Shared pure helpers extracted from background-worker.ts so they can be unit
// tested without booting the worker (which starts a WhatsApp connection).
// CommonJS + erasable TypeScript only — runs via Node type stripping.
'use strict'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_AUDIO_BYTES = 16 * 1024 * 1024 // 16MB (voice notes do WhatsApp)

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
function buildMessageContent(message, image) {
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

module.exports = {
  withTimeout,
  friendlySendError,
  buildMessageContent,
  sanitizeMediaFilename,
  resolveJidForSending,
  shouldCheckWhatsAppExistence,
  forEachYield,
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES
}
