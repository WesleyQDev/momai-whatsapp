const { tokenize } = require('../services/keyword-router')

describe('tokenize', () => {
  test('lowercases and splits on whitespace', () => {
    expect(tokenize('Abre Pasta X')).toEqual(['abre', 'pasta', 'x'])
  })
  test('trims and removes empty tokens', () => {
    expect(tokenize('  abre   pasta  ')).toEqual(['abre', 'pasta'])
  })
  test('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([])
  })
})

const { matchKeyword } = require('../services/keyword-router')

describe('matchKeyword', () => {
  test('matches exact prefix tokens', () => {
    expect(matchKeyword(['abre', 'pasta'], ['abre'])).toBe(true)
  })
  test('matches with skipped words between keyword tokens', () => {
    expect(matchKeyword(['manda', 'uma', 'mensagem'], ['manda', 'mensagem'])).toBe(true)
  })
  test('matches when keyword appears later in input', () => {
    expect(matchKeyword(['por', 'favor', 'abre'], ['abre'])).toBe(true)
  })
  test('returns false when keyword tokens not found', () => {
    expect(matchKeyword(['abre', 'pasta'], ['fecha'])).toBe(false)
  })
  test('returns false for empty input', () => {
    expect(matchKeyword([], ['abre'])).toBe(false)
  })
  test('handles multi-token keywords', () => {
    expect(matchKeyword(['manda', 'mensagem', 'hoje'], ['manda', 'mensagem'])).toBe(true)
  })
})

const { routeByKeyword } = require('../services/keyword-router')

describe('routeByKeyword', () => {
  const mockRegistry = {
    getById: (id) => {
      const skills = {
        launcher: { id: 'launcher', enabled: true },
        whatsapp: { id: 'whatsapp', enabled: true },
        disabledSkill: { id: 'disabledSkill', enabled: false }
      }
      return skills[id] || null
    }
  }

  beforeEach(() => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = {}
  })

  test('returns match for keyword prefix', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { launcher: ['abre', 'abra'] }

    const result = routeByKeyword('abre pasta x', mockRegistry)
    expect(result).toEqual({ skillId: 'launcher', keyword: 'abre' })
  })

  test('returns null when no keyword matches', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { launcher: ['abre'] }

    const result = routeByKeyword('fecha pasta x', mockRegistry)
    expect(result).toBeNull()
  })

  test('returns null for disabled skill', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { disabledSkill: ['teste'] }

    const result = routeByKeyword('teste qualquer', mockRegistry)
    expect(result).toBeNull()
  })

  test('returns null for empty input', () => {
    const result = routeByKeyword('', mockRegistry)
    expect(result).toBeNull()
  })

  test('handles multi-token keyword with skipped words', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { whatsapp: ['manda mensagem'] }

    const result = routeByKeyword('manda uma mensagem para o pai', mockRegistry)
    expect(result).toEqual({ skillId: 'whatsapp', keyword: 'manda mensagem' })
  })
})
