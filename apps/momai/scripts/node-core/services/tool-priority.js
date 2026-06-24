function buildToolPriority(skills) {
  if (!Array.isArray(skills)) return ''
  return skills
    .map(s => s?.manifest?.toolPriority)
    .filter(Boolean)
    .map(p => `- ${p.label}: ${p.rule}`)
    .join('\n')
}

module.exports = { buildToolPriority }
