import { describe, it, expect, vi } from 'vitest'
import utils from '../worker-utils'

const {
  withTimeout,
  friendlySendError,
  buildMessageContent,
  sanitizeMediaFilename,
  resolveJidForSending,
  shouldCheckWhatsAppExistence,
  forEachYield
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
})
