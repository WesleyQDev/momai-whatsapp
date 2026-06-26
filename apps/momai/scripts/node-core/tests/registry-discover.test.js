const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { parseSkillMarkdown } = require('../../skills/registry')

function writeTempSkillMd(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillmd-'))
  const file = path.join(dir, 'SKILL.md')
  fs.writeFileSync(file, content, 'utf8')
  return file
}

describe('parseSkillMarkdown - weather', () => {
  const weatherSkillMd = path.resolve(__dirname, '../../skills/core/weather/SKILL.md')

  let parsed
  beforeAll(() => {
    parsed = parseSkillMarkdown(weatherSkillMd)
  })

  test('parses successfully', () => {
    expect(parsed).not.toBeNull()
  })

  test('parses name as "weather"', () => {
    expect(parsed.name).toBe('weather')
  })

  test('parses description', () => {
    expect(parsed.description).toMatch(/previsao do tempo/i)
  })

  test('parses intents array', () => {
    expect(Array.isArray(parsed.intents)).toBe(true)
    expect(parsed.intents.length).toBeGreaterThanOrEqual(20)
  })

  test('contains key weather intents', () => {
    const required = [
      'clima',
      'tempo',
      'temperatura',
      'previsão do tempo',
      'previsao do tempo',
      'chuva',
      'chover',
      'sol',
      'calor',
      'frio'
    ]
    for (const intent of required) {
      expect(parsed.intents).toContain(intent)
    }
  })

  test('does not declare voice_triggers (user-controlled, not manifest-driven)', () => {
    // Auto-activation keywords are user-controlled. Skills must not declare
    // voice_triggers in their manifest. The parser still accepts the field
    // for backward compat with third-party extensions, but built-in skills
    // leave it empty so users have full control.
    expect(Array.isArray(parsed.voiceTriggers)).toBe(true)
    expect(parsed.voiceTriggers).toEqual([])
  })
})

describe('parseSkillMarkdown - voice_triggers field', () => {
  test('returns empty array when voice_triggers is absent', () => {
    const file = writeTempSkillMd(`---
name: foo
description: a skill without voice triggers
intents:
  - alpha
  - beta
---
body
`)
    const parsed = parseSkillMarkdown(file)
    expect(parsed).not.toBeNull()
    expect(Array.isArray(parsed.voiceTriggers)).toBe(true)
    expect(parsed.voiceTriggers).toEqual([])
  })

  test('parses voice_triggers list from front matter', () => {
    const file = writeTempSkillMd(`---
name: foo
description: a skill with voice triggers
intents:
  - alpha
  - beta
  - gamma
voice_triggers:
  - alpha
  - beta
---
body
`)
    const parsed = parseSkillMarkdown(file)
    expect(parsed).not.toBeNull()
    expect(parsed.voiceTriggers).toEqual(['alpha', 'beta'])
  })

  test('keeps voice_triggers independent from intents', () => {
    const file = writeTempSkillMd(`---
name: foo
description: voice triggers are a curated subset
intents:
  - alpha
  - beta
  - gamma
  - delta
voice_triggers:
  - alpha
---
body
`)
    const parsed = parseSkillMarkdown(file)
    expect(parsed.intents).toEqual(['alpha', 'beta', 'gamma', 'delta'])
    expect(parsed.voiceTriggers).toEqual(['alpha'])
  })
})

describe('discover matching logic', () => {
  function makeSkill(id, intents, description) {
    return {
      id,
      enabled: true,
      manifest: { id, intents, description }
    }
  }

  function discover(query, skills) {
    const q = String(query || '')
    const lower = q.toLowerCase()
    let best = null
    let bestScore = 0
    for (const skill of skills) {
      if (!skill.enabled) continue
      const description = String(skill.manifest.description || '').toLowerCase()
      const intents = Array.isArray(skill.manifest.intents) ? skill.manifest.intents : []
      let score = 0

      for (const intent of intents) {
        const intentNorm = String(intent || '')
          .toLowerCase()
          .trim()
        if (!intentNorm) continue
        if (lower.includes(intentNorm)) score += 3
      }

      for (const token of lower.split(/\s+/)) {
        if (token.length < 3) continue
        if (description.includes(token)) score += 1
      }

      if (score > bestScore) {
        best = skill
        bestScore = score
      }
    }

    if (!best || bestScore <= 0) return null
    return { id: best.id, confidence: Math.min(0.95, bestScore / 3) }
  }

  const weatherSkill = makeSkill(
    'weather',
    [
      'clima',
      'tempo',
      'tempo em',
      'temperatura',
      'previsão do tempo',
      'previsao do tempo',
      'chuva',
      'chover',
      'sol',
      'calor',
      'frio',
      'neve',
      'nublado',
      'umidade',
      'vento'
    ],
    'Previsao do tempo e informacoes meteorologicas'
  )

  const otherSkill = makeSkill(
    'reminders',
    ['lembrete', 'lembrar', 'alarme', 'lembra'],
    'Cria e gerencia lembretes e alarmes'
  )

  const skillSet = [weatherSkill, otherSkill]

  test('descobre weather com "previsao do tempo em SP"', () => {
    const result = discover('previsao do tempo em Sao Paulo', skillSet)
    expect(result).not.toBeNull()
    expect(result.id).toBe('weather')
    expect(result.confidence).toBeGreaterThanOrEqual(0.8)
  })

  test('descobre weather com "vai chover hoje?"', () => {
    const result = discover('vai chover hoje', skillSet)
    expect(result).not.toBeNull()
    expect(result.id).toBe('weather')
  })

  test('descobre weather com "qual a temperatura?"', () => {
    const result = discover('qual a temperatura', skillSet)
    expect(result).not.toBeNull()
    expect(result.id).toBe('weather')
  })

  test('descobre weather com "faz calor no Rio"', () => {
    const result = discover('faz calor no Rio de Janeiro', skillSet)
    expect(result).not.toBeNull()
    expect(result.id).toBe('weather')
  })

  test('descobre weather com "como esta o tempo"', () => {
    const result = discover('como esta o tempo', skillSet)
    expect(result).not.toBeNull()
    expect(result.id).toBe('weather')
  })

  test('descobre weather com "neve em Nova York"', () => {
    const result = discover('neve em Nova York', skillSet)
    expect(result).not.toBeNull()
    expect(result.id).toBe('weather')
  })

  test('descobre weather com "umidade em Manaus"', () => {
    const result = discover('umidade em Manaus', skillSet)
    expect(result).not.toBeNull()
    expect(result.id).toBe('weather')
  })

  test('nao descobre weather para "cria um lembrete"', () => {
    const result = discover('cria um lembrete para amanha', skillSet)
    expect(result).not.toBeNull()
    expect(result.id).toBe('reminders')
  })

  test('retorna null para query irrelevante', () => {
    const result = discover('qual o sentido da vida', skillSet)
    expect(result).toBeNull()
  })

  test('retorna null para string vazia', () => {
    expect(discover('', skillSet)).toBeNull()
  })

  test('weather com "previsao" na query (intent "previsao")', () => {
    const skillWithPrevisao = makeSkill(
      'weather',
      ['previsao', 'clima', 'tempo'],
      'Previsao do tempo'
    )
    const result = discover('qual a previsao para amanha', [skillWithPrevisao, otherSkill])
    expect(result).not.toBeNull()
    expect(result.id).toBe('weather')
  })
})
