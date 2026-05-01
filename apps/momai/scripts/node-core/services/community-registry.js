const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')

/**
 * CommunityRegistryService
 * Manages fetching and caching the remote extensions registry.
 */

const REGISTRY_URL = 'https://raw.githubusercontent.com/WesleyQDev/MomAI-App/main/community-extensions.json'
const CACHE_FILE = path.join(process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share'), 'MomAI', 'cache', 'community_registry.json')
const CACHE_TTL = 3600 * 1000 // 1 hour

class CommunityRegistryService {
  constructor() {
    this.cache = null
    this.lastFetch = 0
    this.starsCache = new Map()
  }

  async fetchRegistry() {
    const now = Date.now()

    // Use in-memory cache within TTL (avoids excessive remote requests in-session)
    if (this.cache && (now - this.lastFetch < CACHE_TTL)) {
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
        if (now - stats.mtimeMs < CACHE_TTL * 24) { // stale cache ok for 24h
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
        'Accept': 'application/vnd.github.v3+json'
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
    client.get(url, { headers: { 'User-Agent': 'MomAI-App', 'Accept': 'application/vnd.github.v3+json' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          const stars = JSON.parse(data).stargazers_count || 0
          this.starsCache.set(repo, { stars, timestamp: Date.now() })
          console.log(`[CommunityRegistry] Background update: ${repo} has ${stars} stars`)
        } catch {}
      })
    }).on('error', () => {})
  }

  _httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http
      client.get(url, { headers }, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Status Code: ${res.statusCode}`))
        }
        let data = ''
        res.on('data', (chunk) => data += chunk)
        res.on('end', () => resolve(data))
      }).on('error', reject)
    })
  }
}

module.exports = new CommunityRegistryService()
