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

let _store = null

function setStore(storeRef) {
  _store = storeRef
}

function getKeywords() {
  return (_store && _store.skillKeywords) || {}
}

function seedDefaultKeywords(skillRegistry) {
  if (!_store || !skillRegistry || typeof skillRegistry.getAll !== 'function') return
  if (!_store.skillKeywords) _store.skillKeywords = {}
  const skills = skillRegistry.getAll()
  for (const skill of skills) {
    const id = skill.manifest?.id || skill.id
    if (!id) continue

    // If the skill already has an entry in skillKeywords (even if empty),
    // we do NOT auto-seed. This respects user manual additions/deletions.
    if (id in _store.skillKeywords) continue

    const newKeywords = (skill.manifest?.intents || skill.manifest?.triggers || []).filter(Boolean)
    if (newKeywords.length === 0) continue

    // Seed only for new skills missing from the map
    _store.skillKeywords[id] = [...new Set(newKeywords)]
    console.log(`[keywords] Initialized ${id} with ${newKeywords.length} default keywords`)
  }
}

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

module.exports = { routeByKeyword, tokenize, matchKeyword, setStore, seedDefaultKeywords }
