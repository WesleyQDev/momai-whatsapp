const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')

/**
 * CommunityRegistryService
 * Manages fetching and caching the remote extensions registry.
 */

/**
 * Parse `momai_compat` from a GitHub release body string.
 *
 * Supports two formats:
 *  1. YAML front-matter at the top:
 *       ---\n momai_compat: ">=1.4.0 <2.0.0"\n ---\n Changelog
 *  2. Inline `>[!NOTE]` block or any line containing `momai_compat:`
 *
 * Returns the captured value (quotes/spaces trimmed) or `null` if the
 * release/body is falsy or no `momai_compat` key is found.
 */
const FRONTMATTER_RE = /^\s*-{3,}\s*\n[^]*?momai_compat\s*:\s*["']?([^"'\n]+)["']?/m
const NOTE_RE = /momai_compat\s*:\s*["']?([^"'\n]+)["']?/

function parseReleaseCompat(release) {
  if (!release || !release.body) return null
  const body = release.body
  const fm = body.match(FRONTMATTER_RE)
  const note = body.match(NOTE_RE)
  const value = (fm && fm[1]) || (note && note[1])
  return value ? value.trim().replace(/^["']|["']$/g, '') : null
}

/**
 * Normalize raw GitHub releases into the install pipeline shape, adding a
 * `momai_compat` field to each release. Pure (no HTTP).
 *
 * Filter rules:
 *  - drafts are dropped
 *  - releases without a `.zip` asset AND without a `zipball_url` fallback
 *    are dropped (handled by the final `download_url` filter)
 *  - releases without a parseable `version` are dropped
 *
 * `manifestCompat` is used as a fallback when a release body has no
 * `momai_compat` info.
 */
function enrichReleasesWithCompat(rawReleases, manifestCompat) {
  if (!Array.isArray(rawReleases)) return []
  return rawReleases
    .filter((r) => !r.draft)
    .map((r) => {
      const version = (r.tag_name || '').replace(/^v/i, '').trim()
      // Only count a release as installable when there is an actual ZIP asset
      // attached. Falling back to GitHub's `zipball_url` (a tarball source
      // archive, not a packaged extension) would install garbage: extracting
      // it yields the repo layout instead of an extension package, silently
      // succeeds, and leaves the destination unusable.
      const zipAsset = (r.assets || []).find((a) => a.name && a.name.endsWith('.zip'))
      const download_url = zipAsset ? zipAsset.browser_download_url : null
      const compatFromBody = parseReleaseCompat(r)
      return {
        version,
        tag: r.tag_name,
        download_url,
        changelog: r.body || '',
        date: r.published_at || r.created_at || null,
        prerelease: r.prerelease || false,
        momai_compat: compatFromBody || manifestCompat || null
      }
    })
    .filter((r) => r.version && r.download_url)
}

const REGISTRY_URL =
  'https://raw.githubusercontent.com/WesleyQDev/MomAI-App/main/community-extensions.json'
const CACHE_FILE = path.join(
  process.env.APPDATA ||
    (process.platform === 'darwin'
      ? process.env.HOME + '/Library/Preferences'
      : process.env.HOME + '/.local/share'),
  'MomAI',
  'cache',
  'community_registry.json'
)
const CACHE_TTL = 3600 * 1000 // 1 hour
const RELEASES_CACHE_TTL = 15 * 60 * 1000 // 15 minutes

class CommunityRegistryService {
  constructor() {
    this.cache = null
    this.lastFetch = 0
    this.starsCache = new Map()
    this.releasesCache = new Map()
  }

  async fetchRegistry() {
    const now = Date.now()

    // Use in-memory cache within TTL (avoids excessive remote requests in-session)
    if (this.cache && now - this.lastFetch < CACHE_TTL) {
      return this.cache
    }

    // Always try remote first (stale-while-revalidate pattern)
    try {
      console.log('[CommunityRegistry] Fetching remote registry...')
      const data = await this._httpGet(REGISTRY_URL)
      this.cache = JSON.parse(data)
      this.lastFetch = now

      // Update disk cache
      const cacheDir = path.dirname(CACHE_FILE)
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache), 'utf8')

      return this.cache
    } catch (e) {
      console.error('[CommunityRegistry] Failed to fetch remote registry:', e.message)
    }

    // Fallback: load from disk cache if remote failed
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const stats = fs.statSync(CACHE_FILE)
        if (now - stats.mtimeMs < CACHE_TTL * 24) {
          // stale cache ok for 24h
          this.cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
          this.lastFetch = now
          console.log('[CommunityRegistry] Using disk cache fallback')
          return this.cache
        }
      }
    } catch (e) {
      console.warn('[CommunityRegistry] Error reading cache file:', e.message)
    }

    return this.cache || []
  }

  async getGitHubStars(repo) {
    if (this.starsCache.has(repo)) {
      const { stars, timestamp } = this.starsCache.get(repo)
      if (Date.now() - timestamp < CACHE_TTL) return stars
    }

    const cached = this.starsCache.get(repo)
    if (cached) {
      this._fetchStarsInBackground(repo)
      return cached.stars
    }

    try {
      const url = `https://api.github.com/repos/${repo}`
      console.log(`[CommunityRegistry] Fetching stars for ${repo}...`)
      const response = await this._httpGet(url, {
        'User-Agent': 'MomAI-App',
        Accept: 'application/vnd.github.v3+json'
      })
      const data = JSON.parse(response)
      const stars = data.stargazers_count || 0
      console.log(`[CommunityRegistry] Repo ${repo} has ${stars} stars`)
      this.starsCache.set(repo, { stars, timestamp: Date.now() })
      return stars
    } catch (e) {
      console.warn(`[CommunityRegistry] Failed to fetch stars for ${repo}:`, e.message)
      return 0
    }
  }

  _fetchStarsInBackground(repo) {
    const url = `https://api.github.com/repos/${repo}`
    const client = url.startsWith('https') ? https : http
    client
      .get(
        url,
        { headers: { 'User-Agent': 'MomAI-App', Accept: 'application/vnd.github.v3+json' } },
        (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            try {
              const stars = JSON.parse(data).stargazers_count || 0
              this.starsCache.set(repo, { stars, timestamp: Date.now() })
              console.log(`[CommunityRegistry] Background update: ${repo} has ${stars} stars`)
            } catch {}
          })
        }
      )
      .on('error', () => {})
  }

  async fetchManifest(repo) {
    const url = `https://raw.githubusercontent.com/${repo}/main/manifest.json`
    try {
      console.log(`[CommunityRegistry] Fetching manifest for ${repo}...`)
      const data = await this._httpGet(url)
      return JSON.parse(data)
    } catch (e) {
      console.warn(`[CommunityRegistry] Failed to fetch manifest for ${repo}:`, e.message)
      return null
    }
  }

  async fetchReleases(repo) {
    if (!repo) return []

    const cached = this.releasesCache.get(repo)
    if (cached && Date.now() - cached.timestamp < RELEASES_CACHE_TTL) {
      return cached.releases
    }

    try {
      const url = `https://api.github.com/repos/${repo}/releases?per_page=15`
      console.log(`[CommunityRegistry] Fetching releases for ${repo}...`)
      const data = await this._httpGet(url, {
        'User-Agent': 'MomAI-App',
        Accept: 'application/vnd.github.v3+json'
      })
      const ghReleases = JSON.parse(data)
      if (!Array.isArray(ghReleases)) return []

      const releases = enrichReleasesWithCompat(ghReleases, null)

      this.releasesCache.set(repo, { releases, timestamp: Date.now() })
      console.log(`[CommunityRegistry] Found ${releases.length} releases for ${repo}`)
      return releases
    } catch (e) {
      console.warn(`[CommunityRegistry] Failed to fetch releases for ${repo}:`, e.message)
      return cached ? cached.releases : []
    }
  }

  _httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http
      client
        .get(url, { headers }, (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Status Code: ${res.statusCode}`))
          }
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => resolve(data))
        })
        .on('error', reject)
    })
  }
}

module.exports = new CommunityRegistryService()
module.exports.enrichReleasesWithCompat = enrichReleasesWithCompat
module.exports.parseReleaseCompat = parseReleaseCompat
