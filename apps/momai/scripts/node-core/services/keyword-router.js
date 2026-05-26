function tokenize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
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

function countContiguousMatch(inputTokens, keywordTokens) {
  if (!keywordTokens.length || keywordTokens.length > inputTokens.length) return 0
  for (let i = 0; i <= inputTokens.length - keywordTokens.length; i++) {
    let ok = true
    for (let j = 0; j < keywordTokens.length; j++) {
      if (inputTokens[i + j] !== keywordTokens[j]) {
        ok = false
        break
      }
    }
    if (ok) return keywordTokens.length
  }
  return 0
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

    // Seed if missing OR currently empty.
    // This recovers old stores that persisted empty arrays and blocked routing forever.
    if (id in _store.skillKeywords) {
      const existing = _store.skillKeywords[id]
      if (Array.isArray(existing) && existing.length > 0) continue
    }

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
  let best = null

  for (const [skillId, words] of Object.entries(keywords)) {
    const skill = skillRegistry.getById(skillId)
    if (!skill || !skill.enabled) continue

    for (const kw of words) {
      const kwTokens = tokenize(kw)
      if (!kwTokens.length) continue
      if (!matchKeyword(inputTokens, kwTokens)) continue

      const contiguous = countContiguousMatch(inputTokens, kwTokens)
      const tokenLen = kwTokens.length
      const charLen = normalizeAccents(kw).length
      const score = contiguous * 10 + tokenLen * 3 + Math.min(8, Math.floor(charLen / 6))

      if (!best || score > best.score) {
        best = { skillId, keyword: kw, score }
      }
    }
  }

  if (!best) return null
  return { skillId: best.skillId, keyword: best.keyword }
}

module.exports = {
  routeByKeyword,
  tokenize,
  matchKeyword,
  setStore,
  seedDefaultKeywords
}
