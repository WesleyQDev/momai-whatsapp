import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import utils from '../worker-utils'

const {
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
  isGifMessage,
  getGifNotificationText,
  getRecentChatMedia,
  resolveDocumentPath,
  resolveReplyQuoted,
  extractQuotedMessage,
  GROUP_FETCH_COOLDOWN_MS,
  shouldFetchGroups,
  sanitizeRemoteMediaUrl,
  isPrivateNetworkHost,
  pruneMediaDirectories,
  evaluateMediaPathPolicy,
  MAX_ATTACHMENTS_PER_SEND,
  MAX_MESSAGE_CHARS
} = utils as any

describe('withTimeout', () => {
  it('resolves with the promise value when it wins the race', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('rejects with the original error when the promise rejects first', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('original')), 1000)
    ).rejects.toThrow('original')
  })

  it('rejects with the timeout error when the promise never settles', async () => {
    const slow = new Promise(() => {})
    await expect(withTimeout(slow, 40, 'boom')).rejects.toThrow('boom')
  })

  it('clears the timer when the promise resolves (no leaked timer)', async () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout')
    await withTimeout(Promise.resolve(1), 500)
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('clears the timer when the promise rejects (no leaked timer)', async () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout')
    await expect(withTimeout(Promise.reject(new Error('x')), 500)).rejects.toThrow('x')
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('does not produce an unhandled rejection from a late loser', async () => {
    const unhandled = vi.fn()
    const handler = (err: any) => unhandled(err)
    process.on('unhandledRejection', handler)
    let rejectLate: ((e: Error) => void) | null = null
    try {
      const slow = new Promise((_, rej) => {
        rejectLate = rej
      })
      await expect(withTimeout(slow, 30, 'too slow')).rejects.toThrow('too slow')
    } finally {
      await new Promise((r) => setTimeout(r, 40))
      rejectLate?.(new Error('late rejection'))
      await new Promise((r) => setTimeout(r, 40))
      process.removeListener('unhandledRejection', handler)
    }
    expect(unhandled).not.toHaveBeenCalled()
  })
})

describe('friendlySendError', () => {
  it('translates not-acceptable (grupo) into an actionable message', () => {
    const out = friendlySendError('not-acceptable', 'Familia')
    expect(out).toContain('Familia')
    expect(out).toContain('not-acceptable')
    expect(out).toContain('grupo')
  })

  it('translates Invalid contact', () => {
    const out = friendlySendError('Invalid contact', 'X')
    expect(out).toContain('Destinatário inválido')
    expect(out).toContain('X')
  })

  it('points disconnected sends to the chat QR instead of the raw English error', () => {
    const out = friendlySendError('WhatsApp not connected', 'Ana')
    expect(out).toContain('desconectado')
    expect(out).toContain('QR')
    expect(out).not.toContain('not connected')
  })

  it('passes through "Número não registrado" (already actionable)', () => {
    const m = 'Número não registrado no WhatsApp: "5555"'
    expect(friendlySendError(m, '5555')).toBe(m)
  })

  it('passes through "Não encontrei ... nem como contato" (already actionable)', () => {
    const m = 'Não encontrei "Zé" no WhatsApp (nem como contato, nem como grupo). Verifique...'
    expect(friendlySendError(m, 'Zé')).toBe(m)
  })

  it('translates raw null-property races (sock race)', () => {
    const out = friendlySendError('Cannot read properties of null (reading \'ws\')', 'Ana')
    expect(out).toContain('reconectou')
    expect(out).toContain('Ana')
  })

  it('translates raw undefined-property races', () => {
    const out = friendlySendError('Cannot read properties of undefined (reading \'isOpen\')', 'Ana')
    expect(out).toContain('reconectou')
  })

  it('passes through the already-friendly "reconectando" error', () => {
    const m = 'WhatsApp reconectando; tente novamente em instantes (destino: "Bia")'
    expect(friendlySendError(m, 'Bia')).toBe(m)
  })

  it('translates timeouts', () => {
    const out = friendlySendError('onWhatsApp timeout', 'Carla')
    expect(out).toContain('timeout')
    expect(out).toContain('Carla')
  })

  it('keeps unknown messages untouched', () => {
    const m = 'some raw error'
    expect(friendlySendError(m, 'Dani')).toBe(m)
  })
})

describe('buildMessageContent (limite de imagem M5)', () => {
  it('returns text-only content when no image', () => {
    expect(buildMessageContent('oi', null)).toEqual({ text: 'oi' })
  })

  it('decodes a data URI image and sets the caption', () => {
    const tiny = Buffer.from('hello').toString('base64')
    const content = buildMessageContent('legenda', `data:image/png;base64,${tiny}`)
    expect(Buffer.isBuffer(content.image)).toBe(true)
    expect(content.image.toString()).toBe('hello')
    expect(content.caption).toBe('legenda')
  })

  it('decodes raw base64', () => {
    const tiny = Buffer.from('abc').toString('base64')
    const content = buildMessageContent('', tiny)
    expect(Buffer.isBuffer(content.image)).toBe(true)
    expect(content.image.toString()).toBe('abc')
  })

  it('accepts a Buffer', () => {
    const buf = Buffer.from('xyz')
    const content = buildMessageContent('m', buf)
    expect(content.image).toBe(buf)
  })

  it('rejects an oversized base64 string (~>10MB)', () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64')
    expect(() => buildMessageContent('m', big)).toThrow(/muito grande/)
  })

  it('rejects an oversized Buffer', () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1)
    expect(() => buildMessageContent('m', big)).toThrow(/muito grande/)
  })

  it('rejects invalid image payloads', () => {
    expect(() => buildMessageContent('m', 'not-a-data-uri!!')).toThrow(/image inválida/)
  })

  it('accepts images right at the limit', () => {
    const big = Buffer.alloc(10 * 1024 * 1024)
    const content = buildMessageContent('m', big)
    expect(content.image.length).toBe(10 * 1024 * 1024)
  })

  it('builds sticker content with Buffer', () => {
    const buf = Buffer.from('sticker-data')
    const content = buildMessageContent('', undefined, buf)
    expect(content.sticker).toBe(buf)
  })

  it('builds sticker content with base64 data URL', () => {
    const dataUrl = 'data:image/webp;base64,' + Buffer.from('sticker-data').toString('base64')
    const content = buildMessageContent('', undefined, dataUrl)
    expect(Buffer.isBuffer(content.sticker)).toBe(true)
    expect(content.sticker.toString()).toBe('sticker-data')
  })

  it('builds gif content with url, gifPlayback: true, and video/mp4 mimetype', () => {
    const gifUrl = 'https://media.tenor.com/test.mp4'
    const content = buildMessageContent('nice gif', undefined, undefined, gifUrl)
    expect(content.video).toEqual({ url: gifUrl })
    expect(content.gifPlayback).toBe(true)
    expect(content.mimetype).toBe('video/mp4')
    expect(content.caption).toBe('nice gif')
  })

  it('sends a real .gif url as a downloadable document instead of a corrupt video', () => {
    const gifUrl = 'https://nekos.best/api/v2/hug/abc.gif'
    const content = buildMessageContent('nice gif', undefined, undefined, gifUrl)
    expect(content.document).toEqual({ url: gifUrl })
    expect(content.mimetype).toBe('image/gif')
    expect(content.fileName).toBe('gif.gif')
    expect(content.video).toBeUndefined()
  })

  it('sends a data:image/gif payload as a document too', () => {
    const b64 = Buffer.from('GIF89a').toString('base64')
    const content = buildMessageContent(
      '',
      undefined,
      undefined,
      `data:image/gif;base64,${b64}`
    )
    expect(Buffer.isBuffer(content.document)).toBe(true)
    expect(content.mimetype).toBe('image/gif')
    expect(content.fileName).toBe('gif.gif')
  })

  it('builds document content with Buffer', () => {
    const buf = Buffer.from('pdf-content')
    const content = buildMessageContent('segue pdf', undefined, undefined, undefined, {
      buffer: buf,
      fileName: 'relatorio.pdf',
      mimetype: 'application/pdf'
    })
    expect(content.document).toBe(buf)
    expect(content.fileName).toBe('relatorio.pdf')
    expect(content.mimetype).toBe('application/pdf')
    expect(content.caption).toBe('segue pdf')
  })

  it('builds document content with base64 data URI', () => {
    const b64 = Buffer.from('my-doc').toString('base64')
    const dataUri = `data:application/pdf;base64,${b64}`
    const content = buildMessageContent('', undefined, undefined, undefined, {
      dataUrl: dataUri,
      fileName: 'doc.pdf'
    })
    expect(Buffer.isBuffer(content.document)).toBe(true)
    expect(content.document.toString()).toBe('my-doc')
    expect(content.fileName).toBe('doc.pdf')
    expect(content.mimetype).toBe('application/pdf')
  })

  it('rejects an oversized document (>25MB)', () => {
    const big = Buffer.alloc(25 * 1024 * 1024 + 1)
    expect(() =>
      buildMessageContent('', undefined, undefined, undefined, {
        buffer: big,
        fileName: 'big.pdf'
      })
    ).toThrow(/documento muito grande/)
  })
})

describe('sanitizeMediaFilename (M9)', () => {
  it('strips path separators and leading dots', () => {
    expect(sanitizeMediaFilename('../../etc/passwd')).toBe('etcpasswd')
    expect(sanitizeMediaFilename('..\\evil')).toBe('evil')
  })

  it('keeps safe alphanumeric, dots, underscores and dashes', () => {
    expect(sanitizeMediaFilename('3A1B_C-2.ogg')).toBe('3A1B_C-2.ogg')
  })

  it('falls back when the input is empty or unsafe', () => {
    expect(sanitizeMediaFilename('')).toBe('media')
    expect(sanitizeMediaFilename('???', 'fallback')).toBe('fallback')
  })
})

describe('resolveJidForSending (mock waContacts)', () => {
  const ctx = {
    waContacts: {
      '5511999990001@s.whatsapp.net': {
        id: '5511999990001@s.whatsapp.net',
        name: 'Maria',
        notify: null,
        verifiedName: null,
        phone: '5511999990001',
        lid: null
      },
      '120363000000000001@g.us': {
        id: '120363000000000001@g.us',
        name: 'Família',
        notify: null,
        verifiedName: null,
        phone: null,
        lid: null
      },
      '5511999990002@lid': {
        id: '5511999990002@lid',
        name: 'João',
        phone: '5511999990002',
        lid: '5511999990002@lid'
      },
      '5511999990002@s.whatsapp.net': {
        id: '5511999990002@s.whatsapp.net',
        name: 'João',
        phone: '5511999990002',
        lid: '5511999990002@lid'
      }
    },
    contactNames: { '5511999990003@s.whatsapp.net': 'Carlos' },
    resolveDisplayName: (c: any) => c.name || c.phone || ''
  }

  it('passes through a valid group JID', () => {
    expect(resolveJidForSending('120363000000000001@g.us', ctx)).toBe(
      '120363000000000001@g.us'
    )
  })

  it('formats a raw number as @s.whatsapp.net', () => {
    expect(resolveJidForSending('5511988887777', ctx)).toBe('5511988887777@s.whatsapp.net')
  })

  it('resolves a display name from waContacts to the phone JID', () => {
    expect(resolveJidForSending('Maria', ctx)).toBe('5511999990001@s.whatsapp.net')
  })

  it('resolves a name via contactNames', () => {
    expect(resolveJidForSending('Carlos', ctx)).toBe('5511999990003@s.whatsapp.net')
  })

  it('resolves an @lid JID back to a phone JID when mapped', () => {
    expect(resolveJidForSending('5511999990002@lid', ctx)).toBe('5511999990002@s.whatsapp.net')
  })

  it('falls back to the @lid JID when there is no phone-mapped entry', () => {
    const lidOnly = {
      ...ctx,
      waContacts: {
        '5511999990002@lid': {
          id: '5511999990002@lid',
          name: 'João',
          phone: '5511999990002',
          lid: '5511999990002@lid'
        }
      }
    }
    // Sem entrada por telefone, envia-se para o @lid (MOM-117).
    expect(resolveJidForSending('5511999990002@lid', lidOnly)).toBe('5511999990002@lid')
  })

  it('returns the raw name (no @) when nothing matches — caller decides retry', () => {
    expect(resolveJidForSending('Zé Desconhecido', ctx)).toBe('Zé Desconhecido')
  })

  it('returns null for empty input', () => {
    expect(resolveJidForSending('', ctx)).toBeNull()
    expect(resolveJidForSending(null as any, ctx)).toBeNull()
  })

  it('does partial match via resolveDisplayName', () => {
    expect(resolveJidForSending('mari', ctx)).toBe('5511999990001@s.whatsapp.net')
  })
})

describe('shouldCheckWhatsAppExistence (evita onWhatsApp para destinos conhecidos)', () => {
  const ctx = {
    waContacts: {
      '5511999990001@s.whatsapp.net': {
        id: '5511999990001@s.whatsapp.net',
        name: 'Maria',
        phone: '5511999990001',
        lid: null
      },
      '120363000000000001@g.us': { id: '120363000000000001@g.us', name: 'Família', lid: null }
    }
  }

  it('skips groups (@g.us) — never queried', () => {
    expect(shouldCheckWhatsAppExistence('Família', '120363000000000001@g.us', ctx.waContacts)).toBe(false)
  })

  it('skips @lid JIDs — not phone numbers', () => {
    expect(shouldCheckWhatsAppExistence('5511999990002@lid', '5511999990002@lid', ctx.waContacts)).toBe(false)
  })

  it('skips when the input was already a full JID (recents / contact list / notification)', () => {
    // Vindo de "últimas mensagens": contato NÃO está em waContacts mas o input
    // é o JID da mensagem — quem mandou mensagem existe no WhatsApp.
    expect(
      shouldCheckWhatsAppExistence('5511999990009@s.whatsapp.net', '5511999990009@s.whatsapp.net', ctx.waContacts)
    ).toBe(false)
  })

  it('skips when the jid matches a known waContacts entry by phone digits', () => {
    expect(shouldCheckWhatsAppExistence('5511999990001', '5511999990001@s.whatsapp.net', ctx.waContacts)).toBe(false)
  })

  it('skips when the jid matches a known waContacts entry by id', () => {
    expect(
      shouldCheckWhatsAppExistence('Maria', '5511999990001@s.whatsapp.net', ctx.waContacts)
    ).toBe(false)
  })

  it('skips when the jid matches a waContacts lid digits', () => {
    const withLid = {
      ...ctx.waContacts,
      '5511999990003@s.whatsapp.net': {
        id: '5511999990003@s.whatsapp.net',
        phone: '5511999990003',
        lid: '5511999990003@lid'
      }
    }
    expect(
      shouldCheckWhatsAppExistence('5511999990003@s.whatsapp.net', '5511999990003@s.whatsapp.net', withLid)
    ).toBe(false)
  })

  it('checks unknown raw numbers not present in waContacts', () => {
    expect(shouldCheckWhatsAppExistence('5511988887777', '5511988887777@s.whatsapp.net', ctx.waContacts)).toBe(true)
  })

  it('checks a name resolved to a phone jid not present in waContacts', () => {
    expect(shouldCheckWhatsAppExistence('Zé', '5511988887777@s.whatsapp.net', ctx.waContacts)).toBe(true)
  })

  it('returns false for empty/invalid input', () => {
    expect(shouldCheckWhatsAppExistence('', '', ctx.waContacts)).toBe(false)
    expect(shouldCheckWhatsAppExistence('Maria', '', ctx.waContacts)).toBe(false)
    expect(shouldCheckWhatsAppExistence('Maria', null as any, ctx.waContacts)).toBe(false)
  })

  it('checks unknown raw numbers even when waContacts is empty (no local knowledge)', () => {
    expect(
      shouldCheckWhatsAppExistence('5511988887777', '5511988887777@s.whatsapp.net', undefined)
    ).toBe(true)
  })

  it('does not crash on null/undefined contact entries', () => {
    const messy = { 'x@s.whatsapp.net': null, 'y@s.whatsapp.net': undefined }
    expect(shouldCheckWhatsAppExistence('5511988887777', '5511988887777@s.whatsapp.net', messy)).toBe(true)
  })
})

describe('forEachYield (chunking com yield do event loop)', () => {
  it('calls fn for every item in order with (item, index)', async () => {
    const seen: Array<[any, number]> = []
    await forEachYield(['a', 'b', 'c'], (v: any, i: number) => seen.push([v, i]))
    expect(seen).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2]
    ])
  })

  it('emulates continue via return: skips rest of body but keeps iterating', async () => {
    const calls: number[] = []
    await forEachYield([1, 2, 3, 4, 5, 6], (v: number) => {
      if (v % 2 === 0) return
      calls.push(v)
    })
    expect(calls).toEqual([1, 3, 5])
  })

  it('handles null/empty input without throwing', async () => {
    await expect(forEachYield(null, () => {})).resolves.toBeUndefined()
    await expect(forEachYield(undefined, () => {})).resolves.toBeUndefined()
    await expect(forEachYield([], () => {})).resolves.toBeUndefined()
  })

  it('yields the event loop mid-iteration so a queued macrotask runs (IPC/IPC heartbeat served)', async () => {
    // Um macrotask enfileirado ANTES do loop (simula uma mensagem IPC que chegou
    // enquanto o sync rodava) precisa ser processado entre os chunks. Sem yield
    // (setImmediate), ele só rodaria depois do loop inteiro.
    let queuedRan = false
    let seenMidIteration = false
    setImmediate(() => {
      queuedRan = true
    })
    const items = Array.from({ length: 150 }, (_, i) => i)
    await forEachYield(
      items,
      (_v: number, i: number) => {
        if (queuedRan && i > 0) seenMidIteration = true
      },
      50
    )
    expect(queuedRan).toBe(true)
    expect(seenMidIteration).toBe(true)
  })

  it('does NOT yield for arrays smaller than the chunk size (no overhead on small batches)', async () => {
    let queuedRan = false
    let seenMidIteration = false
    setImmediate(() => {
      queuedRan = true
    })
    await forEachYield([1, 2, 3], (_v: number, i: number) => {
      if (queuedRan && i > 0) seenMidIteration = true
    }, 50)
    // O loop de 3 itens (< chunkSize) não cedeu; o macrotask enfileirado só
    // roda quando o event loop voltar ao check phase (depois do loop terminar).
    expect(seenMidIteration).toBe(false)
    await new Promise((r) => setImmediate(r))
    expect(queuedRan).toBe(true)
  })

  it('exports valid MAX_STICKER_BYTES limit', () => {
    expect(utils.MAX_STICKER_BYTES).toBe(5 * 1024 * 1024)
    expect(utils.MAX_AUDIO_BYTES).toBeGreaterThan(0)
    expect(utils.MAX_IMAGE_BYTES).toBeGreaterThan(0)
  })
})

describe('isBenignBaileysLog (init queries timeout não é Error real)', () => {
  it('marca init queries + Timed Out como benigno', () => {
    expect(isBenignBaileysLog("unexpected error in 'init queries'", 'Timed Out')).toBe(true)
  })

  it('marca presence update timeout como benigno', () => {
    expect(isBenignBaileysLog("unexpected error in 'presence update requests'", 'timeout')).toBe(true)
  })

  it('não marca erro real como benigno', () => {
    expect(isBenignBaileysLog("unexpected error in 'init queries'", 'Connection Closed')).toBe(false)
    expect(isBenignBaileysLog('connection lost', 'Timed Out')).toBe(false)
    expect(isBenignBaileysLog('some other error', 'boom')).toBe(false)
  })
})

describe('summarizeBaileysDetail (stream errored out traz code/reason)', () => {
  it('extracts code and reason from stream error node', () => {
    const detail = summarizeBaileysDetail({
      msg: 'stream errored out',
      node: { tag: 'stream:error', attrs: { code: '440' }, content: [{ tag: 'conflict' }] }
    })
    expect(detail).toContain('code=440')
    expect(detail).toContain('reason=conflict')
  })

  it('prefers err.message when present', () => {
    expect(summarizeBaileysDetail({ err: { message: 'Timed Out' } })).toBe('Timed Out')
  })

  it('returns empty string for unrecognized payloads without throwing', () => {
    expect(summarizeBaileysDetail({})).toBe('')
    expect(summarizeBaileysDetail(null)).toBe('')
    expect(summarizeBaileysDetail({ node: { attrs: {}, content: [] } })).toBe('')
  })
})

describe('incoming photo helpers (image notification reaches overlay)', () => {
  it('detects imageMessage on the unwrapped payload', () => {
    expect(isImageMessage({ imageMessage: {} })).toBe(true)
    expect(
      isImageMessage({ viewOnceMessage: { message: { imageMessage: {} } } })
    ).toBe(false)
    expect(isImageMessage({ conversation: 'hi' })).toBe(false)
    expect(isImageMessage(null)).toBe(false)
  })

  it('keeps the sender caption, falling back to a non-empty placeholder', () => {
    expect(getImageNotificationText({ imageMessage: { caption: 'olha isso' } })).toBe('olha isso')
    expect(getImageNotificationText({ imageMessage: {} })).toBe('📷 Foto')
    expect(getImageNotificationText({ imageMessage: { caption: '  ' } })).toBe('📷 Foto')
    expect(getImageNotificationText(null)).toBe('📷 Foto')
  })
})

describe('incoming document helpers (document notification reaches overlay)', () => {
  it('detects documentMessage on the unwrapped payload', () => {
    expect(isDocumentMessage({ documentMessage: {} })).toBe(true)
    expect(isDocumentMessage({ conversation: 'hi' })).toBe(false)
    expect(isDocumentMessage(null)).toBe(false)
  })

  it('prefers caption, then filename, then placeholder', () => {
    expect(
      getDocumentNotificationText({ documentMessage: { caption: 'segue', fileName: 'a.pdf' } })
    ).toBe('segue')
    expect(getDocumentNotificationText({ documentMessage: { fileName: 'nota.pdf' } })).toBe(
      'nota.pdf'
    )
    expect(getDocumentNotificationText({ documentMessage: {} })).toBe('📄 Documento')
    expect(getDocumentNotificationText(null)).toBe('📄 Documento')
  })

  it('exports a document size cap', () => {
    expect(utils.MAX_DOCUMENT_BYTES).toBe(25 * 1024 * 1024)
  })
})

describe('incoming video helpers (plain videos reach history and overlay)', () => {
  it('detects videoMessage without gifPlayback', () => {
    expect(isVideoMessage({ videoMessage: {} })).toBe(true)
    expect(isVideoMessage({ videoMessage: { caption: 'festa' } })).toBe(true)
  })

  it('keeps GIFs out of the video branch', () => {
    expect(isVideoMessage({ videoMessage: { gifPlayback: true } })).toBe(false)
    expect(isVideoMessage({ conversation: 'hi' })).toBe(false)
    expect(isVideoMessage(null)).toBe(false)
  })

  it('prefers caption, then placeholder', () => {
    expect(getVideoNotificationText({ videoMessage: { caption: 'olha' } })).toBe('olha')
    expect(getVideoNotificationText({ videoMessage: {} })).toBe('🎥 Vídeo')
    expect(getVideoNotificationText({ videoMessage: { caption: '  ' } })).toBe('🎥 Vídeo')
    expect(getVideoNotificationText(null)).toBe('🎥 Vídeo')
  })

  it('exports a video size cap', () => {
    expect(utils.MAX_VIDEO_BYTES).toBe(64 * 1024 * 1024)
  })

  it('includes videos in recent chat media', () => {
    const history = [
      { replyJid: 'a@g.us', video: 'v.mp4', text: '🎥 Vídeo', timestamp: 5 },
      { replyJid: 'a@g.us', image: 'c.jpg', text: '📷 Foto', timestamp: 2 }
    ]
    const media = getRecentChatMedia(history, 'a@g.us')
    expect(media).toHaveLength(2)
    expect(media[0].image).toBe('c.jpg')
    expect(media[1].video).toBe('v.mp4')
  })
})

describe('incoming GIF helpers (GIFs detected with gifPlayback)', () => {
  it('detects videoMessage with gifPlayback', () => {
    expect(isGifMessage({ videoMessage: { gifPlayback: true } })).toBe(true)
    expect(isGifMessage({ videoMessage: { gifPlayback: false } })).toBe(false)
    expect(isGifMessage({ videoMessage: {} })).toBe(false)
    expect(isGifMessage(null)).toBe(false)
  })

  it('prefers caption, then [GIF] placeholder', () => {
    expect(getGifNotificationText({ videoMessage: { caption: 'engraçado' } })).toBe('engraçado')
    expect(getGifNotificationText({ videoMessage: {} })).toBe('[GIF]')
    expect(getGifNotificationText({ videoMessage: { caption: '  ' } })).toBe('[GIF]')
    expect(getGifNotificationText(null)).toBe('[GIF]')
  })
})

describe('resolveDocumentPath (open_document stays inside documents/)', () => {
  const path = require('path')
  const dir = path.join('C:', 'data', 'momai-whatsapp')

  it('resolves plain filenames inside documents/', () => {
    expect(resolveDocumentPath(dir, 'nota.pdf')).toBe(
      path.resolve(dir, 'documents', 'nota.pdf')
    )
  })

  it('rejects traversal, separators and bad input', () => {
    expect(resolveDocumentPath(dir, '../secret.txt')).toBeNull()
    expect(resolveDocumentPath(dir, 'sub/file.pdf')).toBeNull()
    expect(resolveDocumentPath(dir, 'C:\\data\\x.pdf')).toBeNull()
    expect(resolveDocumentPath(dir, '')).toBeNull()
    expect(resolveDocumentPath(dir, null)).toBeNull()
    expect(resolveDocumentPath('', 'nota.pdf')).toBeNull()
  })
})

describe('getRecentChatMedia (gallery of one chat, oldest first)', () => {
  const history = [
    { replyJid: 'a@g.us', text: 'hello', timestamp: 3 },
    { replyJid: 'a@g.us', image: 'c.jpg', text: '📷 Foto', timestamp: 2 },
    { replyJid: 'b@s.whatsapp.net', image: 'other.jpg', text: '📷 Foto', timestamp: 4 },
    {
      replyJid: 'a@g.us',
      document: 'doc.pdf',
      documentName: 'nota.pdf',
      text: 'nota.pdf',
      timestamp: 1
    }
  ]

  it('returns only media of the requested chat, oldest first', () => {
    const media = getRecentChatMedia(history, 'a@g.us')
    expect(media).toHaveLength(2)
    expect(media[0].document).toBe('doc.pdf')
    expect(media[1].image).toBe('c.jpg')
  })

  it('caps the number of items', () => {
    const media = getRecentChatMedia(history, 'a@g.us', 1)
    expect(media).toHaveLength(1)
    expect(media[0].image).toBe('c.jpg')
  })

  it('returns empty for unknown chats or bad input', () => {
    expect(getRecentChatMedia(history, 'nobody')).toEqual([])
    expect(getRecentChatMedia(null, 'a@g.us')).toEqual([])
    expect(getRecentChatMedia(history, '')).toEqual([])
  })
})

describe('shouldFetchGroups & GROUP_FETCH_COOLDOWN_MS', () => {
  it('defines a 3-minute cooldown default', () => {
    expect(GROUP_FETCH_COOLDOWN_MS).toBe(180000)
  })

  it('allows fetching on first run when lastFetchTs is 0 or uninitialized', () => {
    expect(shouldFetchGroups(0)).toBe(true)
    expect(shouldFetchGroups(-1)).toBe(true)
    expect(shouldFetchGroups(null as any)).toBe(true)
  })

  it('throttles fetching within cooldown window', () => {
    const now = 1000000
    const lastFetchTs = now - 60000 // 1 minute ago
    expect(shouldFetchGroups(lastFetchTs, GROUP_FETCH_COOLDOWN_MS, now)).toBe(false)
  })

  it('allows fetching once cooldown threshold has passed', () => {
    const now = 1000000
    const lastFetchTs = now - 180000 // 3 minutes ago
    expect(shouldFetchGroups(lastFetchTs, GROUP_FETCH_COOLDOWN_MS, now)).toBe(true)
    expect(shouldFetchGroups(now - 200000, GROUP_FETCH_COOLDOWN_MS, now)).toBe(true)
  })

  it('bypasses cooldown when force flag is set', () => {
    const now = 1000000
    const lastFetchTs = now - 5000 // 5 seconds ago
    expect(shouldFetchGroups(lastFetchTs, GROUP_FETCH_COOLDOWN_MS, now, true)).toBe(true)
  })
})

describe('resolveReplyQuoted (citação enviada ao WhatsApp)', () => {
  const contactJid = '5511999999999@s.whatsapp.net'

  it('returns null without a stanza id (previously sent a plain message silently)', () => {
    expect(resolveReplyQuoted(null, contactJid)).toBeNull()
    expect(resolveReplyQuoted({ text: 'sem id' }, contactJid)).toBeNull()
    expect(resolveReplyQuoted({ id: '' }, contactJid)).toBeNull()
  })

  it('builds the quoted key/proto for an incoming DM text', () => {
    const quoted = resolveReplyQuoted(
      { id: '3EB0ABC', text: 'pergunta', direction: 'incoming' },
      contactJid
    )
    expect(quoted.key).toEqual({
      remoteJid: contactJid,
      fromMe: false,
      id: '3EB0ABC'
    })
    expect(quoted.message).toEqual({ conversation: 'pergunta' })
  })

  it('marks own messages with fromMe so Baileys attributes the participant correctly', () => {
    const quoted = resolveReplyQuoted(
      { id: '3EB0OWN', text: 'minha', direction: 'outgoing' },
      contactJid
    )
    expect(quoted.key.fromMe).toBe(true)
    expect(quoted.key.participant).toBeUndefined()
  })

  it('uses the sender as participant when replying inside a group', () => {
    const groupJid = '120363000000000000@g.us'
    const quoted = resolveReplyQuoted(
      {
        id: '3EB0GRP',
        text: 'no grupo',
        direction: 'incoming',
        senderJid: '5511977777777@s.whatsapp.net'
      },
      groupJid,
      true
    )
    expect(quoted.key.participant).toBe('5511977777777@s.whatsapp.net')
  })

  it('prefers the cached proto when the quoted message was sent by us', () => {
    const cached = { extendedTextMessage: { text: 'original' } }
    const quoted = resolveReplyQuoted(
      { id: '3EB0CACHE', direction: 'outgoing' },
      contactJid,
      false,
      cached
    )
    expect(quoted.message).toBe(cached)
  })
})

describe('extractQuotedMessage (citação recebida)', () => {
  it('extracts the stanza id and text from a reply contextInfo', () => {
    const extracted = extractQuotedMessage({
      extendedTextMessage: {
        text: 'resposta',
        contextInfo: {
          stanzaId: '3EB0ORIG',
          participant: '5511977777777@s.whatsapp.net',
          quotedMessage: { conversation: 'original' }
        }
      }
    })
    expect(extracted.id).toBe('3EB0ORIG')
    expect(extracted.senderJid).toBe('5511977777777@s.whatsapp.net')
    expect(extracted.text).toBe('original')
  })

  it('returns null when there is no quote context', () => {
    expect(extractQuotedMessage({ conversation: 'oi' })).toBeNull()
  })
})

describe('media path confinement (item 2)', () => {
  it('rejects local paths outside the extension storage', () => {
    const outside = path.join(os.tmpdir(), `momai-outside-${Date.now()}.txt`)
    fs.writeFileSync(outside, 'secret')
    try {
      expect(() =>
        buildMessageContent('', undefined, undefined, undefined, outside, {
          allowedFileBase: path.join(os.tmpdir(), `momai-storage-${Date.now()}`)
        })
      ).toThrow(/fora da pasta da extensão/)
    } finally {
      fs.unlinkSync(outside)
    }
  })

  it('reads a document inside the extension storage and keeps the filename', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-storage-'))
    const docs = path.join(base, 'documents')
    fs.mkdirSync(docs)
    const file = path.join(docs, 'nota.txt')
    fs.writeFileSync(file, 'hello')
    const content = buildMessageContent('', undefined, undefined, undefined, file, {
      allowedFileBase: base
    })
    expect(content.document.toString()).toBe('hello')
    expect(content.fileName).toBe('nota.txt')
  })

  it('rejects local sticker paths outside the extension storage', () => {
    const outside = path.join(os.tmpdir(), `momai-sticker-${Date.now()}.webp`)
    fs.writeFileSync(outside, 'x')
    try {
      expect(() =>
        buildMessageContent('', undefined, outside, undefined, undefined, {
          allowedFileBase: path.join(os.tmpdir(), `momai-storage-${Date.now()}`)
        })
      ).toThrow(/fora da pasta da extensão/)
    } finally {
      fs.unlinkSync(outside)
    }
  })

  it('rejects image paths outside the extension storage without user approval', () => {
    const outside = path.join(os.tmpdir(), `momai-shot-${Date.now()}.jpg`)
    fs.writeFileSync(outside, 'jpeg-bytes')
    try {
      expect(() =>
        buildMessageContent('', outside, undefined, undefined, undefined, {
          allowedFileBase: path.join(os.tmpdir(), `momai-storage-${Date.now()}`),
          allowExternalImagePaths: false
        })
      ).toThrow(/fora da pasta da extensão/)
    } finally {
      fs.unlinkSync(outside)
    }
  })

  it('reads image paths outside the extension storage when the user approved', () => {
    const outside = path.join(os.tmpdir(), `momai-shot-${Date.now()}.jpg`)
    fs.writeFileSync(outside, 'jpeg-bytes')
    try {
      const content = buildMessageContent('legenda', outside, undefined, undefined, undefined, {
        allowedFileBase: path.join(os.tmpdir(), `momai-storage-${Date.now()}`),
        allowExternalImagePaths: true
      })
      expect(content.image.toString()).toBe('jpeg-bytes')
      expect(content.mimetype).toBe('image/jpeg')
      expect(content.caption).toBe('legenda')
    } finally {
      fs.unlinkSync(outside)
    }
  })

  it('reads image paths inside the extension storage and rejects non-image files', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-storage-'))
    const inside = path.join(base, 'print.png')
    fs.writeFileSync(inside, 'png-bytes')
    const content = buildMessageContent('', inside, undefined, undefined, undefined, {
      allowedFileBase: base
    })
    expect(content.image.toString()).toBe('png-bytes')
    expect(content.mimetype).toBe('image/png')

    const textFile = path.join(os.tmpdir(), `momai-note-${Date.now()}.txt`)
    fs.writeFileSync(textFile, 'segredo')
    try {
      expect(() =>
        buildMessageContent('', textFile, undefined, undefined, undefined, {
          allowedFileBase: os.tmpdir(),
          allowExternalImagePaths: true
        })
      ).toThrow(/use data URI, base64, Buffer ou caminho de arquivo/)
    } finally {
      fs.unlinkSync(textFile)
    }

    expect(() =>
      buildMessageContent('', path.join(os.tmpdir(), 'momai-missing.png'), undefined, undefined, undefined, {
        allowedFileBase: base,
        allowExternalImagePaths: true
      })
    ).toThrow(/arquivo não encontrado/)
  })

  it('keeps decoding raw base64 JPEG instead of reading it as a path', () => {
    const base64 = Buffer.from('fake image bytes here').toString('base64')
    expect(base64.startsWith('/')).toBe(false)
    const content = buildMessageContent('', base64, undefined, undefined, undefined, {
      allowedFileBase: os.tmpdir(),
      allowExternalImagePaths: true
    })
    expect(Buffer.isBuffer(content.image)).toBe(true)
    expect(content.image.toString()).toBe('fake image bytes here')
  })

  it('accepts quoted paths the model may send', () => {
    const outside = path.join(os.tmpdir(), `momai-shot-${Date.now()}.png`)
    const storage = path.join(os.tmpdir(), `momai-storage-${Date.now()}`)
    fs.writeFileSync(outside, 'png-bytes')
    try {
      const content = buildMessageContent('', `"${outside}"`, undefined, undefined, undefined, {
        allowedFileBase: storage,
        allowExternalImagePaths: true
      })
      expect(content.image.toString()).toBe('png-bytes')
      const decision: any = evaluateMediaPathPolicy({ image: `"${outside}"` }, storage)
      expect(decision.policy).toBe('ask')
      expect(decision.reason).toContain(path.basename(outside))
    } finally {
      fs.unlinkSync(outside)
    }
  })
})

describe('media path policy hook (send_message gate)', () => {
  const storageDir = path.join(os.tmpdir(), 'momai-whatsapp-storage')

  it('allows data URIs, base64 and files inside the extension storage', () => {
    expect(evaluateMediaPathPolicy({ image: 'data:image/png;base64,AAA' }, storageDir)).toEqual({
      policy: 'allow'
    })
    expect(evaluateMediaPathPolicy({ image: 'QUJDRA==' }, storageDir)).toEqual({ policy: 'allow' })
    expect(
      evaluateMediaPathPolicy({ image: path.join(storageDir, 'images', 'foto.jpg') }, storageDir)
    ).toEqual({ policy: 'allow' })
    expect(evaluateMediaPathPolicy({ message: 'oi' }, storageDir)).toEqual({ policy: 'allow' })
  })

  it('asks for confirmation for image paths outside the extension storage', () => {
    const outside = path.join(os.tmpdir(), 'momai-desktop-captures', 'capture-1-d1-ab12.jpg')
    const decision: any = evaluateMediaPathPolicy({ image: outside }, storageDir)
    expect(decision.policy).toBe('ask')
    expect(decision.ruleId).toBe(
      `media-dir:${path.join(os.tmpdir(), 'momai-desktop-captures').toLowerCase()}`
    )
    expect(decision.reason).toContain('capture-1-d1-ab12.jpg')
  })

  it('covers the plural images/media fields and counts multiple files', () => {
    const dir = path.join(os.tmpdir(), 'momai-desktop-captures')
    const decision: any = evaluateMediaPathPolicy(
      { images: [path.join(dir, 'a.jpg'), path.join(dir, 'b.png')] },
      storageDir
    )
    expect(decision.policy).toBe('ask')
    expect(decision.reason).toContain('2')
    expect(evaluateMediaPathPolicy({ media: 'https://example.com/a.jpg' }, storageDir)).toEqual({
      policy: 'allow'
    })
  })
})

describe('remote media url guard (item 17)', () => {
  it('blocks non-https and private-network hosts', () => {
    expect(sanitizeRemoteMediaUrl('http://example.com/a.gif')).toBeNull()
    expect(sanitizeRemoteMediaUrl('https://127.0.0.1/a.gif')).toBeNull()
    expect(sanitizeRemoteMediaUrl('https://192.168.0.10/a.gif')).toBeNull()
    expect(sanitizeRemoteMediaUrl('https://169.254.169.254/latest/meta-data')).toBeNull()
    expect(sanitizeRemoteMediaUrl('https://[::1]/a.gif')).toBeNull()
    expect(sanitizeRemoteMediaUrl('not a url')).toBeNull()
  })

  it('accepts public https urls', () => {
    expect(sanitizeRemoteMediaUrl('https://media.example.com/a.gif')).toBe(
      'https://media.example.com/a.gif'
    )
  })

  it('classifies private hosts', () => {
    expect(isPrivateNetworkHost('localhost')).toBe(true)
    expect(isPrivateNetworkHost('10.1.2.3')).toBe(true)
    expect(isPrivateNetworkHost('172.20.0.1')).toBe(true)
    expect(isPrivateNetworkHost('example.com')).toBe(false)
  })

  it('rejects gif urls pointing at the local network', () => {
    expect(() =>
      buildMessageContent('x', undefined, undefined, 'https://10.0.0.5/a.mp4')
    ).toThrow(/gif inválido/)
  })
})

describe('pruneMediaDirectories (item 8)', () => {
  it('removes old files and keeps recent ones', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-prune-'))
    const dir = path.join(base, 'images')
    fs.mkdirSync(dir)
    const oldFile = path.join(dir, 'old.jpg')
    fs.writeFileSync(oldFile, 'x'.repeat(10))
    const newFile = path.join(dir, 'new.jpg')
    fs.writeFileSync(newFile, 'y'.repeat(10))
    const old = Date.now() - 40 * 24 * 3600 * 1000
    fs.utimesSync(oldFile, new Date(old), new Date(old))

    const result = pruneMediaDirectories(base, {
      now: Date.now(),
      maxAgeMs: 30 * 24 * 3600 * 1000
    })
    expect(result.removed).toBe(1)
    expect(fs.existsSync(oldFile)).toBe(false)
    expect(fs.existsSync(newFile)).toBe(true)
  })

  it('removes the oldest files when the survivors exceed the total budget', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-prune-'))
    const dir = path.join(base, 'videos')
    fs.mkdirSync(dir)
    const first = path.join(dir, 'first.mp4')
    const second = path.join(dir, 'second.mp4')
    fs.writeFileSync(first, 'a'.repeat(60))
    fs.writeFileSync(second, 'b'.repeat(60))
    const older = Date.now() - 2 * 3600 * 1000
    fs.utimesSync(first, new Date(older), new Date(older))

    const result = pruneMediaDirectories(base, {
      now: Date.now(),
      maxAgeMs: 365 * 24 * 3600 * 1000,
      maxTotalBytes: 100
    })
    expect(result.removed).toBe(1)
    expect(fs.existsSync(first)).toBe(false)
    expect(fs.existsSync(second)).toBe(true)
  })

  it('exposes the IPC send limits used by the worker', () => {
    expect(MAX_ATTACHMENTS_PER_SEND).toBeGreaterThan(0)
    expect(MAX_MESSAGE_CHARS).toBeGreaterThan(0)
  })
})
