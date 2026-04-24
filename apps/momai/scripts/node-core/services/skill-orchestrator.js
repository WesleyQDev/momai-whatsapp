const shared = require('./shared-state')
const store = shared.store

function getSkillRegistry() {
  return shared.skillRegistry
}

function isSkillEnabledByStore(skill) {
  if (!skill || skill.kind === 'builtin') return true
  const entry = store.extensions.find((e) => e.id === skill.id)
  if (!entry) return true
  return entry.enabled !== false
}

function getEnabledSkills() {
  const skillRegistry = getSkillRegistry()
  if (!skillRegistry || typeof skillRegistry.getAll !== 'function') return []
  return skillRegistry.getAll().filter((s) => s.enabled && isSkillEnabledByStore(s))
}

function getEnabledSkillManifests() {
  return getEnabledSkills().map((s) => s.manifest)
}

function buildExtensionsPayload() {
  const skillRegistry = getSkillRegistry()
  if (!skillRegistry || typeof skillRegistry.getAll !== 'function') return []
  return skillRegistry.getAll().map((skill) => ({
    id: skill.manifest.id,
    name: skill.manifest.name,
    description: skill.manifest.description,
    category: skill.kind,
    enabled: skill.enabled && isSkillEnabledByStore(skill),
    intents: skill.manifest.intents || [],
    tools: (skill.manifest.tools || []).map((t) => t.name),
    features: {
      sidebar: skill.manifest.sidebar === true,
      agent_name: skill.manifest.id
    }
  }))
}

function getToolCatalogRows() {
  const out = []
  for (const skill of getEnabledSkillManifests()) {
    for (const tool of skill.tools) {
      out.push({
        id: `${skill.id}:${tool.name}`,
        skill_id: skill.id,
        name: tool.name,
        description: tool.description,
        text: `${tool.name}. ${tool.description}. Skill: ${skill.name}.`
      })
    }
  }
  return out
}

function getSkillCatalogRows() {
  return getEnabledSkillManifests().map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    text: `${skill.name}. ${skill.description}. Intents: ${skill.intents.join(', ')}.`
  }))
}

module.exports = {
  isSkillEnabledByStore,
  getEnabledSkills,
  getEnabledSkillManifests,
  buildExtensionsPayload,
  getToolCatalogRows,
  getSkillCatalogRows
}
