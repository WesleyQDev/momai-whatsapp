const shared = require('./shared-state')
const communityRegistry = require('./community-registry')
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

async function buildExtensionsPayload(lang = 'pt-BR') {
  const skillRegistry = getSkillRegistry()
  if (!skillRegistry || typeof skillRegistry.getAll !== 'function') return []

  const all = skillRegistry.getAll()
  const community = await communityRegistry.fetchRegistry()

  console.log(`[SkillOrchestrator] Building payload for ${all.length} skills (lang: ${lang})`)

  const starsMap = new Map()
  const BATCH_SIZE = 5
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (skill) => {
        const repo = skill.manifest?.repo || null
        if (repo) {
          const stars = await communityRegistry.getGitHubStars(repo)
          starsMap.set(skill.id, stars)
        }
      })
    )
  }

  const payload = all.map(async (skill) => {
    try {
      const manifest = skill.manifest || {}
      const locales = manifest.locales || {}
      const localized = locales[lang] || {}

      // Determine the best name and description
      const name = localized.name || manifest.name || skill.id
      const description = localized.description || manifest.description || ''

      // Use pre-fetched stars
      const stars = starsMap.get(skill.id) || 0
      const repo = manifest.repo || null

      // Determine the best documentation content based on language
      const readmes =
        typeof manifest.readme === 'object' && manifest.readme !== null ? manifest.readme : {}

      const docContent =
        readmes[lang] || readmes['pt-BR'] || readmes['default'] || manifest.instructions || ''

      return {
        id: manifest.id || skill.id,
        name: name,
        description: description,
        category: skill.kind === 'builtin' ? 'core' : 'extension',
        enabled: skill.enabled && isSkillEnabledByStore(skill),
        intents: manifest.intents || [],
        tags: manifest.tags || [],
        icon: manifest.icon || null,
        author: manifest.author || null,
        repo: repo,
        stars: stars,
        is_official:
          skill.kind === 'builtin' || skill.kind === 'packaged' || manifest.author === 'WesleyQDev',
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
  })

  const installed = (await Promise.all(payload)).filter(Boolean)
  const installedIds = new Set(installed.map((ext) => ext.id))

  // Merge with community items that aren't installed yet
  const communityItems = community
    .filter((item) => !installedIds.has(item.id))
    .map((item) => {
      const raw = { ...item }
      const locales = raw.locales || {}
      const localized = locales[lang] || {}
      return {
        ...raw,
        name: localized.name || raw.name,
        description: localized.description || raw.description,
        category: 'community',
        enabled: false,
        installed: false,
        is_official: false,
        stars: 0,
        readme: localized.description || raw.description
      }
    })

  return [...installed, ...communityItems]
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
