function shouldExposeSkillTools(userText, selectedSkills, skillRegistry) {
  return Array.isArray(selectedSkills) && selectedSkills.length > 0
}

function normalizeDiscoveryText(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return ''
  return text.replace(/^\[INSTRUCAO:[^\]]+\]\s*/i, '').trim()
}

function buildToolResultPreview(result) {
  try {
    if (Array.isArray(result?.webSources) && result.webSources.length > 0) {
      return result.webSources
        .slice(0, 3)
        .map((s) => String(s?.title || '').trim())
        .filter(Boolean)
        .join(' | ')
    }
    const instruction = String(result?.instruction || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (instruction) return instruction.slice(0, 220)
  } catch {}
  return ''
}

function pickToolSkillIds({ discoveredSkillIds, routedSkillId, topScores, maxSkills = 2 }) {
  const ranked = [...new Set(discoveredSkillIds)]
    .map((id) => ({ id, score: Number(topScores?.[id] || 0) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.id)

  if (!routedSkillId) return ranked.slice(0, maxSkills)

  const out = [routedSkillId]
  for (const id of ranked) {
    if (id === routedSkillId) continue
    out.push(id)
    if (out.length >= maxSkills) break
  }
  return out
}

module.exports = {
  shouldExposeSkillTools,
  normalizeDiscoveryText,
  buildToolResultPreview,
  pickToolSkillIds
}
