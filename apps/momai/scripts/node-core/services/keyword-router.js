function tokenize(text) {
  return text.toLowerCase().trim().split(/\s+/).filter(Boolean)
}

function matchKeyword(inputTokens, keywordTokens) {
  let inputIdx = 0
  for (const kt of keywordTokens) {
    while (inputIdx < inputTokens.length && inputTokens[inputIdx] !== kt) {
      inputIdx++
    }
    if (inputIdx >= inputTokens.length) return false
    inputIdx++
  }
  return true
}

const shared = require('./shared-state')

function getKeywords() {
  return shared.store.skillKeywords || {}
}

// Seed default keywords for packaged extensions
function seedDefaultKeywords(skillRegistry) {
  if (!shared.store.skillKeywords) shared.store.skillKeywords = {}
  const skills = skillRegistry.getAll ? skillRegistry.getAll() : []
  for (const skill of skills) {
    const id = skill.manifest?.id || skill.id
    if (!id) continue
    const newKeywords = (skill.manifest?.intents || skill.manifest?.triggers || []).filter(Boolean)
    if (newKeywords.length === 0) continue

    const existing = shared.store.skillKeywords[id] || []
    const merged = [...new Set([...existing, ...newKeywords])]
    if (merged.length !== existing.length) {
      shared.store.skillKeywords[id] = merged
      console.log(`[keywords] Updated ${id}: ${existing.length} -> ${merged.length} keywords`)
    }
  }
}

module.exports = { routeByKeyword, tokenize, matchKeyword, seedDefaultKeywords }

function routeByKeyword(text, skillRegistry) {
  const normalized = text.toLowerCase().trim()
  if (!normalized) return null

  const inputTokens = tokenize(normalized)
  const keywords = getKeywords()

  for (const [skillId, words] of Object.entries(keywords)) {
    const skill = skillRegistry.getById(skillId)
    if (!skill || !skill.enabled) continue

    for (const kw of words) {
      const kwTokens = tokenize(kw)
      if (matchKeyword(inputTokens, kwTokens)) {
        return { skillId, keyword: kw }
      }
    }
  }

  return null
}

module.exports = { routeByKeyword, tokenize, matchKeyword }
