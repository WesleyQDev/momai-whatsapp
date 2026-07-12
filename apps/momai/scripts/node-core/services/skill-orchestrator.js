const fs = require('node:fs')
const path = require('node:path')
const shared = require('./shared-state')
const communityRegistry = require('./community-registry')
const { usesLocalInstallRegistry, loadInstallRegistry } = require('../utils/install-registry')
const { compareVersions, satisfiesRange, findBestCompatibleRelease } = require('../utils/semver-compat')
const store = shared.store

function getAppVersion() {
  try {
    const pkg = require(path.resolve(__dirname, '..', '..', '..', 'package.json'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function computeCompatStatus(appVersion, momaiCompat) {
  if (!momaiCompat) return 'unknown'
  return satisfiesRange(appVersion, momaiCompat) ? 'compatible' : 'incompatible'
}

function getSkillRegistry() {
  return shared.skillRegistry
}

function isSkillEnabledByStore(skill) {
  // Read the live shared store rather than the module-scope snapshot so
  // tests (and any runtime store swaps) see the current value.
  const currentStore = shared.store || store
  // Single mode-stable key per extension. The install route always writes
  // `extensions[].id === skill.id`; older entries may still use the
  // `<id>_dev` suffix from before the fix — fall back to that for
  // back-compat reads, but never write to it.
  const extensions = (currentStore && currentStore.extensions) || []
  const entry =
    extensions.find((e) => e.id === skill.id) ||
    extensions.find((e) => e.id === `${skill.id}_dev`)
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

  const appVersion = getAppVersion()

  const all = skillRegistry.getAll()
  const community = await communityRegistry.fetchRegistry()

  console.log(`[SkillOrchestrator] Building payload for ${all.length} skills (lang: ${lang})`)

  const starsMap = new Map()
  const BATCH_SIZE = 5
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (skill) => {
        let repo = skill.manifest?.repo || null
        if (!repo) {
          const regItem = community.find((c) => c.id === skill.id)
          if (regItem) repo = regItem.repo || null
        }
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

      // Resolve repo with fallback to community registry
      let repo = manifest.repo || null
      if (!repo) {
        const regItem = community.find((c) => c.id === (manifest.id || skill.id))
        if (regItem) repo = regItem.repo || null
      }

      // Use pre-fetched stars
      const stars = starsMap.get(skill.id) || 0

      // Determine the best documentation content based on language
      const readmes =
        typeof manifest.readme === 'object' && manifest.readme !== null ? manifest.readme : {}

      let docContent = readmes[lang] || readmes['pt-BR'] || readmes['default'] || ''
      if (!docContent) {
        const regItem = community.find((c) => c.id === (manifest.id || skill.id))
        if (regItem) {
          docContent = regItem.readme || regItem.description || ''
        }
      }

      let isSymlink = false
      let symlinkPath = null
      if (skill.dir) {
        try {
          const stats = fs.lstatSync(skill.dir)
          if (stats.isSymbolicLink()) {
            isSymlink = true
            symlinkPath = fs.readlinkSync(skill.dir)
          }
        } catch {}
      }

      // Source is the install mode the extension was registered under.
      // Used by the UI to render a Loja / Dev badge so the user can tell
      // which copy of an extension is currently active.
      const sourceEntry =
        (store.extensions || []).find((e) => e.id === (manifest.id || skill.id)) ||
        (store.extensions || []).find((e) => e.id === `${manifest.id || skill.id}_dev`)
      const source = sourceEntry && sourceEntry.source ? sourceEntry.source : null

      return {
        id: manifest.id || skill.id,
        name: name,
        description: description,
        category: skill.kind === 'builtin' ? 'core' : 'extension',
        enabled: skill.enabled && isSkillEnabledByStore(skill),
        isSymlink,
        symlinkPath,
        source,
        intents: manifest.intents || [],
        tags: manifest.tags || [],
        icon: manifest.icon || (community.find((c) => c.id === (manifest.id || skill.id))?.icon) || null,
        icon_url: manifest.icon_url || (community.find((c) => c.id === (manifest.id || skill.id))?.icon_url) || null,
        icon_bg: manifest.icon_bg || (community.find((c) => c.id === (manifest.id || skill.id))?.icon_bg) || null,
        author: manifest.author || null,
        repo: repo,
        stars: stars,
        is_official:
          skill.kind === 'builtin' || skill.kind === 'packaged' || manifest.author === 'WesleyQDev',
        version: manifest.version || null,
        momai_compat: manifest.momai_compat || null,
        compat_status: computeCompatStatus(appVersion, manifest.momai_compat),
        tools: (manifest.tools || []).map((t) => t.name),

        permissions: manifest.permissions || null,
        permissionSummary: manifest._permSummary || [],
        riskLevel: manifest._riskLevel || 'low',
        instructions: docContent.trim(),
        readme: docContent.trim(),
        features: {
          sidebar: manifest.sidebar === true,
          sidebarPanel: manifest.sidebarPanel || null,
          agent_name: manifest.id
        },
        keywords: store.skillKeywords?.[manifest.id || skill.id] || [],

        // Self-contained UI fields. Promoted from manifest to top level so the
        // renderer can read them via skill.ui / skill.eventTypes / etc.
        // (The Extension type in the renderer expects them flat.)
        ui: manifest.ui || null,
        eventTypes: manifest.eventTypes || [],
        routes: manifest.routes || [],
        storage: manifest.storage || null,
        voiceHooks: manifest.voiceHooks || null,
        persistOnQuit: manifest.persistOnQuit || null,
        theme: manifest.theme || null,
        toolPriority: manifest.toolPriority || null
      }
    } catch (err) {
      console.error(`[SkillOrchestrator] Error mapping skill ${skill?.id}:`, err)
      return null
    }
  })

  const installed = (await Promise.all(payload)).filter(Boolean)
  const installedIds = new Set(installed.map((ext) => ext.id))

  // Dev only: local dev-extensions.json overrides community catalog URLs and adds local-only entries.
  let localExtensions = []
  if (usesLocalInstallRegistry()) {
    try {
      const localRegistry = await loadInstallRegistry()
      localExtensions = localRegistry.extensions || []
    } catch (err) {
      console.error('[SkillOrchestrator] Error reading local dev-extensions.json:', err.message)
    }
  }

  // Fetch stars for community extensions that have a repo
  const communityStarsMap = new Map()
  const communityWithRepo = community.filter(
    (item) => !installedIds.has(item.id) && item.repo
  )
  for (let i = 0; i < communityWithRepo.length; i += BATCH_SIZE) {
    const batch = communityWithRepo.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (item) => {
        const stars = await communityRegistry.getGitHubStars(item.repo)
        communityStarsMap.set(item.id, stars)
      })
    )
  }

  // Merge with community items that aren't installed yet
  const communityItems = community
    .filter((item) => !installedIds.has(item.id))
    .map((item) => {
      const raw = { ...item }
      const locales = raw.locales || {}
      const localized = locales[lang] || {}

      // Find if this extension is in the local registry to match its download_url exactly
      const matchedLocal = localExtensions.find((e) => e.id === raw.id)
      if (matchedLocal) {
        raw.download_url = matchedLocal.download_url
        raw.is_official = matchedLocal.is_official !== false
        if (matchedLocal.version) raw.version = matchedLocal.version
      }

      return {
        ...raw,
        name: localized.name || raw.name,
        description: localized.description || raw.description,
        category: 'community',
        enabled: false,
        installed: false,
        is_official: raw.is_official || false,
        stars: communityStarsMap.get(raw.id) || 0,
        repo: raw.repo || null,
        readme: localized.description || raw.description
      }
    })

  // Append any local registry extensions that aren't in community or installed
  for (const ext of localExtensions) {
    if (!installedIds.has(ext.id) && !communityItems.some((item) => item.id === ext.id)) {
      const matchedComm = community.find((c) => c.id === ext.id)
      communityItems.push({
        id: ext.id,
        name: ext.name,
        description: ext.description,
        category: 'community',
        enabled: false,
        installed: false,
        is_official: ext.is_official !== false,
        download_url: ext.download_url,
        version: ext.version || null,
        author: ext.author || null,
        repo: ext.repo || (matchedComm ? matchedComm.repo : null),
        stars: communityStarsMap.get(ext.id) || 0,
        readme: ext.description,
        icon: matchedComm ? matchedComm.icon : ext.icon || null,
        icon_url: matchedComm ? matchedComm.icon_url : ext.icon_url || null,
        icon_bg: matchedComm ? matchedComm.icon_bg : ext.icon_bg || null
      })
    }
  }

  for (const ext of installed) {
    let regItem = community.find((c) => c.id === ext.id)
    if (!regItem && localExtensions.length > 0) {
      regItem = localExtensions.find((e) => e.id === ext.id)
    }

    if (regItem) {
      const repo = ext.repo || regItem.repo || null
      let latestCompatible = null
      if (repo) {
        try {
          const releases = await communityRegistry.fetchReleases(repo)
          const best = findBestCompatibleRelease(releases, appVersion)
          if (best) {
            latestCompatible = best.version
          }
        } catch (e) {
          console.warn(`[SkillOrchestrator] Failed to fetch releases for update check on ${ext.id}:`, e.message)
        }
      }

      const targetVersion = latestCompatible || regItem.version
      if (targetVersion) {
        const cmp = compareVersions(targetVersion, ext.version || '0.0.0')
        if (cmp > 0) {
          const compat = latestCompatible ? true : satisfiesRange(appVersion, regItem.momai_compat)
          if (compat) {
            ext.updateAvailable = true
            ext.latestCompatibleVersion = targetVersion
          } else {
            ext.hasNewerIncompatible = true
          }
        }
      }
    }
  }

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
  getSkillCatalogRows,
  computeCompatStatus
}
