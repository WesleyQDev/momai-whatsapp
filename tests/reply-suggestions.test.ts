import { describe, it, expect, vi } from 'vitest'
import {
  buildReplySuggestionPrompt,
  sanitizeSuggestions,
  createReplySuggestionCache,
  generateReplySuggestions,
  REPLY_SUGGESTIONS_CACHE_TTL_MS
} from '../src/services/replySuggestions'

const ctx = {
  contactName: 'Ana',
  contactJid: '5511999@s.whatsapp.net',
  isGroup: false,
  latestMessage: 'Qual o preço do pacote?',
  history: [
    { direction: 'outgoing', text: 'Oi, tudo bem?' },
    { direction: 'incoming', text: 'Qual o preço do pacote?' }
  ],
  language: 'pt-BR'
}

describe('buildReplySuggestionPrompt', () => {
  it('includes the contact, the transcript and a JSON contract', () => {
    const { system, user } = buildReplySuggestionPrompt(ctx)
    expect(system).toMatch(/JSON/i)
    expect(system).toContain('pt-BR')
    expect(user).toContain('Ana')
    expect(user).toContain('Qual o preço do pacote?')
  })

  it('identifies the group and who said each message', () => {
    const { system, user } = buildReplySuggestionPrompt({
      ...ctx,
      isGroup: true,
      contactName: 'Time Vendas',
      history: [
        { direction: 'incoming', from: 'Ana', text: 'Consegue enviar hoje?' },
        { direction: 'outgoing', text: 'Vou verificar.' },
        { direction: 'incoming', from: 'Carlos', text: 'Qual o prazo?' }
      ]
    })
    expect(user).toContain('Grupo: Time Vendas')
    expect(user).toContain('Ana: Consegue enviar hoje?')
    expect(user).toContain('Carlos: Qual o prazo?')
    expect(user).toContain('Eu: Vou verificar.')
    expect(system).toMatch(/grupo/i)
  })

  it('falls back to the latest message when there is no history', () => {
    const { user } = buildReplySuggestionPrompt({ ...ctx, history: [] })
    expect(user).toContain('Qual o preço do pacote?')
    expect(user).toContain('Última mensagem recebida')
    expect(user).not.toContain('Contato:')
  })

  it('never feeds a generic placeholder as the sender name', () => {
    const { system, user } = buildReplySuggestionPrompt({
      ...ctx,
      isGroup: true,
      contactName: 'Familia thucos',
      latestMessage: '😕',
      history: [{ direction: 'incoming', from: 'Contato', text: '😕' }]
    })
    expect(user).not.toContain('Contato:')
    expect(user).not.toContain('Participante:')
    expect(user).toContain('😕')
    expect(system).toMatch(/Nunca use rótulos/i)
  })
})

describe('sanitizeSuggestions', () => {
  it('extracts, trims, dedupes and caps the list', () => {
    const out = sanitizeSuggestions({ suggestions: ['  Olá  ', 'Olá', 'B', 'C', 'D'] })
    expect(out).toEqual(['Olá', 'B', 'C'])
  })

  it('accepts a bare array and clips long entries', () => {
    const out = sanitizeSuggestions(['x'.repeat(500)], 3)
    expect(out).toHaveLength(1)
    expect(out[0].length).toBeLessThanOrEqual(120)
  })

  it('ignores invalid entries', () => {
    expect(sanitizeSuggestions({ suggestions: [1, null, ' ok '] })).toEqual(['ok'])
    expect(sanitizeSuggestions(null)).toEqual([])
  })
})

describe('reply suggestion cache', () => {
  it('expires after the ttl', () => {
    let now = 1000
    const cache = createReplySuggestionCache(30000, () => now)
    cache.set('k', ['a'])
    expect(cache.get('k')).toEqual(['a'])
    now += REPLY_SUGGESTIONS_CACHE_TTL_MS + 1
    expect(cache.get('k')).toBeNull()
  })
})

describe('generateReplySuggestions', () => {
  it('returns LLM suggestions and serves the second call from cache', async () => {
    const completeJson = vi
      .fn()
      .mockResolvedValue({ data: { suggestions: ['Qual o valor?', 'Pode confirmar?'] } })
    const cache = createReplySuggestionCache()
    const options = { cache, fallback: ['neutro'] }

    const first = await generateReplySuggestions({ has: () => true, completeJson }, ctx, options)
    expect(first).toEqual(['Qual o valor?', 'Pode confirmar?'])

    const second = await generateReplySuggestions({ has: () => true, completeJson }, ctx, options)
    expect(second).toEqual(first)
    expect(completeJson).toHaveBeenCalledTimes(1)
  })

  it('falls back when the SDK exposes no completeJson', async () => {
    const result = await generateReplySuggestions({ has: () => false }, ctx, { fallback: ['neutro'] })
    expect(result).toEqual(['neutro'])
  })

  it('falls back when the call throws', async () => {
    const completeJson = vi.fn().mockRejectedValue(new Error('offline'))
    const result = await generateReplySuggestions({ has: () => true, completeJson }, ctx, {
      fallback: ['neutro']
    })
    expect(result).toEqual(['neutro'])
  })

  it('falls back when the model returns no usable suggestion', async () => {
    const completeJson = vi.fn().mockResolvedValue({ data: { suggestions: [] } })
    const result = await generateReplySuggestions({ has: () => true, completeJson }, ctx, {
      fallback: ['neutro']
    })
    expect(result).toEqual(['neutro'])
  })

  it('does not call the model without conversation context', async () => {
    const completeJson = vi.fn()
    const result = await generateReplySuggestions(
      { has: () => true, completeJson },
      { contactName: 'Ana' },
      { fallback: ['neutro'] }
    )
    expect(result).toEqual(['neutro'])
    expect(completeJson).not.toHaveBeenCalled()
  })

  it('parses a plain line list when the model does not return JSON', async () => {
    const complete = vi
      .fn()
      .mockResolvedValue({ text: '- Qual o valor?\n- Pode confirmar?\n- Vou verificar' })
    const result = await generateReplySuggestions({ has: () => true, complete }, ctx, {
      fallback: ['neutro']
    })
    expect(result).toEqual(['Qual o valor?', 'Pode confirmar?', 'Vou verificar'])
  })

  it('does not surface malformed JSON as a suggestion list', async () => {
    const complete = vi.fn().mockResolvedValue({ text: '{"suggestions": ["a", "b",]}' })
    const result = await generateReplySuggestions({ has: () => true, complete }, ctx, {
      fallback: ['neutro']
    })
    expect(result).toEqual(['neutro'])
  })

  it('retries once after a failed attempt and returns the generated suggestions', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ text: '1. Qual o valor?\n2. Pode confirmar?' })
    const result = await generateReplySuggestions(
      { has: (method: string) => method === 'llm.complete', complete },
      ctx,
      { fallback: ['neutro'] }
    )
    expect(result).toEqual(['Qual o valor?', 'Pode confirmar?'])
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('uses the raw API fallback when the SDK exposes no llm module', async () => {
    const post = vi.fn().mockResolvedValue({ data: { text: '{"suggestions":["a","b"]}' } })
    const result = await generateReplySuggestions(null, ctx, { fallback: ['neutro'], api: { post } })
    expect(result).toEqual(['a', 'b'])
    expect(post).toHaveBeenCalledWith(
      '/extensions/llm/complete',
      expect.objectContaining({ format: 'json' })
    )
  })

  it('reads a direct (unwrapped) API response shape too', async () => {
    const post = vi.fn().mockResolvedValue({ text: '{"suggestions":["c"]}' })
    const result = await generateReplySuggestions(null, ctx, { fallback: ['neutro'], api: { post } })
    expect(result).toEqual(['c'])
  })

  it('uses llm.complete with local JSON parse on hosts without completeJson', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: 'Claro:\n```json\n{"suggestions":["Qual o valor?","Pode confirmar?"]}\n```'
    })
    const result = await generateReplySuggestions(
      { has: (method: string) => method === 'llm.complete', complete },
      ctx,
      { fallback: ['neutro'] }
    )
    expect(result).toEqual(['Qual o valor?', 'Pode confirmar?'])
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
