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

const { routeByKeyword, setStore, seedDefaultKeywords } = require('../services/keyword-router')

function fakeSkill(id, { enabled = true } = {}) {
  return { id, enabled }
}

describe('routeByKeyword', () => {
  const mockRegistry = {
    getById: (id) => skills[id] || null
  }
  let skills

  beforeEach(() => {
    skills = {
      'skill-a': fakeSkill('skill-a', { enabled: true }),
      'skill-b': fakeSkill('skill-b', { enabled: true }),
      'disabled-skill': fakeSkill('disabled-skill', { enabled: false })
    }
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = {}
    setStore(shared.store)
  })

  test('returns match for keyword prefix', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { 'skill-a': ['abre', 'abra'] }

    const result = routeByKeyword('abre pasta x', mockRegistry)
    expect(result).toEqual({ skillId: 'skill-a', keyword: 'abre' })
  })

  test('returns null when no keyword matches', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { 'skill-a': ['abre'] }

    const result = routeByKeyword('fecha pasta x', mockRegistry)
    expect(result).toBeNull()
  })

  test('returns null for disabled skill', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { 'disabled-skill': ['teste'] }

    const result = routeByKeyword('teste qualquer', mockRegistry)
    expect(result).toBeNull()
  })

  test('returns null for empty input', () => {
    const result = routeByKeyword('', mockRegistry)
    expect(result).toBeNull()
  })

  test('handles multi-token keyword with skipped words', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { 'skill-b': ['manda mensagem'] }

    const result = routeByKeyword('manda uma mensagem para o pai', mockRegistry)
    expect(result).toEqual({ skillId: 'skill-b', keyword: 'manda mensagem' })
  })
})

describe('seedDefaultKeywords', () => {
  // Auto-activation keywords are ENTIRELY user-controlled. Skill manifests
  // (intents, voice_triggers, etc.) are LLM-facing metadata only and must
  // never seed the router. This is a deliberate no-op so the user has full
  // control over what phrases auto-activate which skills. Tests below pin
  // that behavior so a future refactor doesn't quietly re-introduce
  // manifest-driven auto-activation (which caused false positives like
  // "filho vai buscar a agenda" triggering the search skill just because
  // "buscar" is a manifest trigger word).

  function fakeSkillRegistry(skills) {
    return {
      getAll: () => skills
    }
  }

  function makeSkill({ id, intents = [], voiceTriggers = null }) {
    return {
      id,
      enabled: true,
      manifest: {
        id,
        name: id,
        description: id,
        intents,
        voice_triggers: voiceTriggers
      }
    }
  }

  beforeEach(() => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = {}
    setStore(shared.store)
  })

  test('does NOT auto-seed from voice_triggers', () => {
    const skill = makeSkill({
      id: 'weather',
      intents: ['clima', 'tempo'],
      voiceTriggers: ['clima', 'tempo']
    })
    seedDefaultKeywords(fakeSkillRegistry([skill]))

    const shared = require('../services/shared-state')
    expect(shared.store.skillKeywords.weather).toBeUndefined()
  })

  test('does NOT auto-seed from intents', () => {
    const skill = makeSkill({
      id: 'memory',
      intents: ['anotar', 'salvar'],
      voiceTriggers: null
    })
    seedDefaultKeywords(fakeSkillRegistry([skill]))

    const shared = require('../services/shared-state')
    expect(shared.store.skillKeywords.memory).toBeUndefined()
  })

  test('preserves user-customized keywords', () => {
    const shared = require('../services/shared-state')
    shared.store.skillKeywords = { weather: ['my_custom_keyword'] }

    const skill = makeSkill({ id: 'weather', voiceTriggers: ['clima'] })
    seedDefaultKeywords(fakeSkillRegistry([skill]))

    // User customization is the ONLY source of keywords now.
    expect(shared.store.skillKeywords.weather).toEqual(['my_custom_keyword'])
  })

  test('initializes skillKeywords map even when no skills have keywords', () => {
    delete require('../services/shared-state').store.skillKeywords
    setStore(require('../services/shared-state').store)
    seedDefaultKeywords(fakeSkillRegistry([makeSkill({ id: 'any' })]))

    const shared = require('../services/shared-state')
    // Map exists (callers can safely read store.skillKeywords[skillId])
    // but is empty (no auto-seed).
    expect(shared.store.skillKeywords).toEqual({})
  })
})
