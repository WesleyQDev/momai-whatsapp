const dns = require('node:dns/promises')
const realLookup = dns.lookup

const {
  validateInstallUrl,
  validateRedirectUrl,
  MAX_DOWNLOAD_SIZE,
  MAX_REDIRECTS,
  resolveInstallVersion,
  _setRegistry
} = require('../api/routes/extensions.routes.js')

const mockLookup = vi.fn()
dns.lookup = mockLookup

afterAll(() => {
  dns.lookup = realLookup
})

const REGISTRY = {
  extensions: [
    {
      id: 'whatsapp',
      download_url: 'https://registry.example.com/whatsapp.zip'
    }
  ]
}

describe('validateInstallUrl', () => {
  beforeEach(() => {
    _setRegistry(REGISTRY)
    mockLookup.mockReset()
  })

  it('accepts a URL in the registry with matching download_url', async () => {
    mockLookup.mockResolvedValue({ address: '1.2.3.4' })
    await expect(
      validateInstallUrl('whatsapp', 'https://registry.example.com/whatsapp.zip')
    ).resolves.toMatchObject({ id: 'whatsapp' })
  })

  it('rejects an id not in the registry', async () => {
    await expect(
      validateInstallUrl('unknown-ext', 'https://anywhere.com/x.zip')
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects a download_url that does not match the registry', async () => {
    await expect(
      validateInstallUrl('whatsapp', 'https://attacker.com/malicious.zip')
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects http (non-https) URLs', async () => {
    await expect(
      validateInstallUrl('whatsapp', 'http://registry.example.com/whatsapp.zip')
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects URLs that resolve to private IPs', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1' })
    await expect(
      validateInstallUrl('whatsapp', 'https://registry.example.com/whatsapp.zip')
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('validateRedirectUrl', () => {
  beforeEach(() => {
    mockLookup.mockReset()
  })

  it('accepts a valid HTTPS URL from GitHub', async () => {
    await expect(
      validateRedirectUrl('https://github.com/user/repo/releases/download/v1.0/ext.zip')
    ).resolves.toBeUndefined()
  })

  it('accepts a valid HTTPS URL from non-GitHub host (with public IP)', async () => {
    mockLookup.mockResolvedValue({ address: '1.2.3.4' })
    await expect(
      validateRedirectUrl('https://cdn.example.com/extension.zip')
    ).resolves.toBeUndefined()
  })

  it('rejects HTTP redirect (scheme downgrade)', async () => {
    await expect(
      validateRedirectUrl('http://cdn.example.com/extension.zip')
    ).rejects.toThrow(/redirect downgraded/)
  })

  it('rejects redirect URL resolving to private IP', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1' })
    await expect(
      validateRedirectUrl('https://internal.example.com/extension.zip')
    ).rejects.toThrow(/private IP/)
  })

  it('rejects invalid URL strings', async () => {
    await expect(
      validateRedirectUrl('not-a-url')
    ).rejects.toThrow(/invalid redirect URL/)
  })
})

describe('download constraints', () => {
  it('MAX_DOWNLOAD_SIZE is 50 MB', () => {
    expect(MAX_DOWNLOAD_SIZE).toBe(50 * 1024 * 1024)
  })

  it('MAX_REDIRECTS is 5', () => {
    expect(MAX_REDIRECTS).toBe(5)
  })
})

/* ── resolveInstallVersion ── */

function makeMockRegistry({ catalog, releases, manifest }) {
  return {
    fetchRegistry: async () => catalog,
    fetchReleases: async (repo) => releases[repo] || [],
    fetchManifest: async (repo) => (manifest && manifest[repo]) || null
  }
}

function makeMockLoadRegistry({ catalog, throwError = false }) {
  if (throwError)
    return async () => {
      throw new Error('loadInstallRegistry failed')
    }
  return async () => catalog
}

const CAT_ENTRY = {
  id: 'whatsapp',
  repo: 'WesleyQDev/momai-whatsapp-extension',
  download_url:
    'https://github.com/WesleyQDev/momai-whatsapp-extension/releases/download/v0.3.30/whatsapp-0.3.30.zip'
}

const RELEASES = [
  {
    version: '0.3.30',
    tag: 'v0.3.30',
    download_url:
      'https://github.com/WesleyQDev/momai-whatsapp-extension/releases/download/v0.3.30/whatsapp-0.3.30.zip',
    changelog: 'whatsapp 0.3.30',
    date: '2026-06-01',
    prerelease: false,
    momai_compat: '>=1.4.0 <2.0.0'
  },
  {
    version: '0.3.0',
    tag: 'v0.3.0',
    download_url:
      'https://github.com/WesleyQDev/momai-whatsapp-extension/releases/download/v0.3.0/whatsapp-0.3.0.zip',
    changelog: 'whatsapp 0.3.0',
    date: '2026-05-20',
    prerelease: false,
    momai_compat: '>=1.4.0 <2.0.0'
  },
  {
    version: '0.4.0',
    tag: 'v0.4.0',
    download_url:
      'https://github.com/WesleyQDev/momai-whatsapp-extension/releases/download/v0.4.0/whatsapp-0.4.0.zip',
    changelog: 'whatsapp 0.4.0',
    date: '2026-06-15',
    prerelease: false,
    momai_compat: '>=2.0.0'
  },
  {
    version: '0.2.0',
    tag: 'v0.2.0',
    download_url:
      'https://github.com/WesleyQDev/momai-whatsapp-extension/releases/download/v0.2.0/whatsapp-0.2.0.zip',
    changelog: 'whatsapp 0.2.0',
    date: '2026-05-01',
    prerelease: false,
    momai_compat: '>=1.0.0 <1.4.0'
  }
]

describe('resolveInstallVersion', () => {
  it('default payload uses findBestCompatibleRelease', async () => {
    const registry = makeMockRegistry({
      catalog: { extensions: [CAT_ENTRY] },
      releases: { [CAT_ENTRY.repo]: RELEASES }
    })
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: {},
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [CAT_ENTRY] } }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(true)
    expect(result.release.version).toBe('0.3.30')
  })

  it('explicit payload.version selects matching release', async () => {
    const registry = makeMockRegistry({
      catalog: { extensions: [CAT_ENTRY] },
      releases: { [CAT_ENTRY.repo]: RELEASES }
    })
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: { version: '0.3.30' },
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [CAT_ENTRY] } }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(true)
    expect(result.release.version).toBe('0.3.30')
  })

  it('explicit payload.version with leading v selects matching release', async () => {
    const registry = makeMockRegistry({
      catalog: { extensions: [CAT_ENTRY] },
      releases: { [CAT_ENTRY.repo]: RELEASES }
    })
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: { version: 'v0.3.0' },
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [CAT_ENTRY] } }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(true)
    expect(result.release.version).toBe('0.3.0')
  })

  it('payload.version not found returns release_not_found_by_version', async () => {
    const registry = makeMockRegistry({
      catalog: { extensions: [CAT_ENTRY] },
      releases: { [CAT_ENTRY.repo]: RELEASES }
    })
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: { version: '9.9.9' },
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [CAT_ENTRY] } }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
    expect(result.error).toBe('release_not_found_by_version')
  })

  it('explicit payload.download_url matches a release', async () => {
    const registry = makeMockRegistry({
      catalog: { extensions: [CAT_ENTRY] },
      releases: { [CAT_ENTRY.repo]: RELEASES }
    })
    const url = RELEASES[0].download_url
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: { download_url: url },
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [CAT_ENTRY] } }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(true)
    expect(result.release.download_url).toBe(url)
  })

  it('explicit payload.download_url with HEAD failing returns release_asset_missing', async () => {
    const registry = makeMockRegistry({
      catalog: { extensions: [CAT_ENTRY] },
      releases: { [CAT_ENTRY.repo]: RELEASES }
    })
    const url = RELEASES[0].download_url
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: { download_url: url },
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [CAT_ENTRY] } }),
      appVersion: '1.5.2',
      fetchHeadStatus: async () => 404
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
    expect(result.error).toBe('release_asset_missing')
  })

  it('incompatible payload.version returns incompatible_version', async () => {
    const registry = makeMockRegistry({
      catalog: { extensions: [CAT_ENTRY] },
      releases: { [CAT_ENTRY.repo]: RELEASES }
    })
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: { version: '0.4.0' },
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [CAT_ENTRY] } }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
    expect(result.error).toBe('incompatible_version')
    expect(result.required_range).toBe('>=2.0.0')
    expect(result.release_version).toBe('0.4.0')
  })

  it('unknown_extension when id not in catalog', async () => {
    const registry = makeMockRegistry({
      catalog: { extensions: [CAT_ENTRY] },
      releases: { [CAT_ENTRY.repo]: RELEASES }
    })
    const result = await resolveInstallVersion({
      id: 'nonexistent',
      payload: {},
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [CAT_ENTRY] } }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
    expect(result.error).toBe('unknown_extension')
    expect(result.id).toBe('nonexistent')
  })

  it('fetchReleases network failure falls back to catalog download_url when available', async () => {
    // Packed builds without GITHUB_TOKEN may hit GitHub API rate limits.
    // In that case fetchReleases throws and resolveInstallVersion should
    // fall back to the catalog entry's pinned download_url/version.
    const registry = {
      fetchRegistry: async () => ({ extensions: [CAT_ENTRY] }),
      fetchReleases: async () => {
        throw new Error('network down')
      },
      fetchManifest: async () => null
    }
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: {},
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [CAT_ENTRY] } }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(true)
    expect(result.release.download_url).toBe(CAT_ENTRY.download_url)
    expect(result.headCheckRequired !== false).toBe(true)
  })

  it('fetchReleases network failure returns no_installable_release when catalog has no download_url', async () => {
    // Genuine unrecoverable case: releases failed AND the catalog entry
    // ships no pinned download_url.
    const catEntry = { id: 'whatsapp', repo: CAT_ENTRY.repo }
    const registry = {
      fetchRegistry: async () => ({ extensions: [catEntry] }),
      fetchReleases: async () => {
        throw new Error('network down')
      },
      fetchManifest: async () => null
    }
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: {},
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: { extensions: [catEntry] } }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
    expect(result.error).toBe('no_installable_release')
  })

  it('picks up entries from loadInstallRegistry that are missing in communityRegistry', async () => {
    // Simulates the dev workflow: an extension declared ONLY in
    // dev-extensions.json does not show up in communityRegistry.fetchRegistry(),
    // so resolveInstallVersion MUST consult loadInstallRegistry() to find it.
    const communityOnlyCatalog = { extensions: [] }
    const mergedCatalog = {
      extensions: [
        {
          id: 'system_info',
          repo: 'WesleyQDev/momai-system-info',
          download_url: 'https://example/system-info.zip',
          version: '0.1.0'
        }
      ]
    }
    const registry = makeMockRegistry({
      catalog: communityOnlyCatalog,
      releases: {
        'WesleyQDev/momai-system-info': [
          {
            version: '0.1.0',
            tag: 'v0.1.0',
            download_url: 'https://example/system-info.zip',
            changelog: '',
            date: null,
            prerelease: false,
            momai_compat: null
          }
        ]
      }
    })
    const result = await resolveInstallVersion({
      id: 'system_info',
      payload: {},
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ catalog: mergedCatalog }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(true)
    expect(result.release.download_url).toBe('https://example/system-info.zip')
  })

  it('falls back to communityRegistry when loadInstallRegistry throws', async () => {
    // If the load-install-registry hook itself fails, we should still be able
    // to resolve from the community registry (preserve previous behavior).
    const registry = makeMockRegistry({
      catalog: { extensions: [CAT_ENTRY] },
      releases: { [CAT_ENTRY.repo]: RELEASES }
    })
    const result = await resolveInstallVersion({
      id: 'whatsapp',
      payload: { version: '0.3.30' },
      communityRegistry: registry,
      loadInstallRegistry: makeMockLoadRegistry({ throwError: true }),
      appVersion: '1.5.2'
    })
    expect(result.ok).toBe(true)
    expect(result.release.version).toBe('0.3.30')
  })
})
