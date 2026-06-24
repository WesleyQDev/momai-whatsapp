function collectStoredData(skills) {
  const out = []
  for (const skill of skills) {
    const s = skill?.manifest?.storage
    if (!s) continue
    out.push({
      skillId: skill.id,
      skillName: skill.manifest.name,
      description: s.description || '',
      locations: Array.isArray(s.locations) ? s.locations : []
    })
  }
  return out
}

module.exports = { collectStoredData }
