const shared = require('./shared-state')
const store = shared.store

function getSkillRegistry() {
  return shared.skillRegistry
}

function isSkillEnabledByStore(skill) {
  const entry = store.extensions.find((e) => e.id === skill.id)
  if (!entry) {
    // Default state: builtins/packaged start enabled, extensions start disabled unless explicitly enabled
    if (skill.kind === 'builtin' || skill.kind === 'packaged') return true
    return false
  }
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

function buildExtensionsPayload(lang = 'pt-BR') {
  const skillRegistry = getSkillRegistry()
  if (!skillRegistry || typeof skillRegistry.getAll !== 'function') return []
  
  const all = skillRegistry.getAll()
  console.log(`[SkillOrchestrator] Building payload for ${all.length} skills (lang: ${lang})`)

  return all.map((skill) => {
    try {
      const manifest = skill.manifest || {}
      const locales = manifest.locales || {}
      const localized = locales[lang] || {}

      // Determine the best name and description
      const name = localized.name || manifest.name || skill.id
      const description = localized.description || manifest.description || ''

      // Determine the best documentation content based on language
      const readmes = (typeof manifest.readme === 'object' && manifest.readme !== null) 
        ? manifest.readme 
        : {}
      
      const docContent = readmes[lang] || readmes['pt-BR'] || readmes['default'] || manifest.instructions || ''

      return {
        id: manifest.id || skill.id,
        name: name,
        description: description,
        category: skill.kind,
        enabled: skill.enabled && isSkillEnabledByStore(skill),
        intents: manifest.intents || [],
        tags: manifest.tags || [],
        icon: manifest.icon || null,
        author: manifest.author || null,
        version: manifest.version || null,
        tools: (manifest.tools || []).map((t) => t.name),

        permissions: manifest.permissions || null,
        permissionSummary: manifest._permSummary || [],
        riskLevel: manifest._riskLevel || 'low',
        instructions: docContent.trim(),
        readme: docContent.trim(),
        features: {
          sidebar: manifest.sidebar === true,
          agent_name: manifest.id
        }
      }
    } catch (err) {
      console.error(`[SkillOrchestrator] Error mapping skill ${skill?.id}:`, err)
      return null
    }
  }).filter(Boolean)
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
