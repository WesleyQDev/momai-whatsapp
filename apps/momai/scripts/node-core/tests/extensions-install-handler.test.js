// Stubs dns.lookup so validateInstallUrl never hits the network for the
// github.com host (the SSRF guard only resolves non-trusted hosts, but we
// stub defensively in case the registry entry is modified to use one).
const dns = require('node:dns/promises')
const realLookup = dns.lookup
dns.lookup = async () => ({ address: '140.82.112.4' })
afterAll(() => {
  dns.lookup = realLookup
})

const {
  createExtensionsRoutes,
  _setRegistry,
  _setCommunityRegistryForTests
} = require('../api/routes/extensions.routes')

// Capture every `res.write(data)` NDJSON chunk and expose them as parsed
// `lines`. Records whether `end()` was called so we can assert that an
// error path terminates the stream cleanly.
function makeNdjsonRes() {
  const chunks = []
  let ended = false
  const res = {
    statusCode: 200,
    headers: {},
    writeHead(statusCode, headers) {
      res.statusCode = statusCode
      res.headers = { ...res.headers, ...headers }
      return res
    },
    write(data) {
      chunks.push(String(data))
      return true
    },
    end() {
      ended = true
      return res
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(data) {
      chunks.push(JSON.stringify(data))
      return res
    }
  }
  return {
    res,
    get ended() { return ended },
    ndjsonLines() {
      const joined = chunks.join('')
      return joined
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => {
          try { return JSON.parse(l) } catch { return l }
        })
    }
  }
}

// Match the catalog entry for SSRF validation inside `validateInstallUrl`.
const INSTALL_REGISTRY = {
  extensions: [
    {
      id: 'test-ext',
      download_url:
        'https://github.com/WesleyQDev/momai-test-ext/releases/download/v0.3.0/test-ext-0.3.0.zip',
      repo: 'WesleyQDev/momai-test-ext'
    }
  ]
}

const REPO = 'WesleyQDev/momai-test-ext'
const COMPATIBLE_RELEASE = {
  version: '0.3.0',
  tag: 'v0.3.0',
  download_url:
    'https://github.com/WesleyQDev/momai-test-ext/releases/download/v0.3.0/test-ext-0.3.0.zip',
  changelog: 'test 0.3.0',
  date: '2026-06-01',
  prerelease: false,
  momai_compat: '>=1.4.0 <2.0.0'
}
const INCOMPATIBLE_RELEASE = {
  version: '0.4.0',
  tag: 'v0.4.0',
  download_url:
    'https://github.com/WesleyQDev/momai-test-ext/releases/download/v0.4.0/test-ext-0.4.0.zip',
  changelog: 'test 0.4.0',
  date: '2026-06-15',
  prerelease: false,
  momai_compat: '>=99.0.0'
}

function makeMockCommunityRegistry({ releases }) {
  return {
    fetchRegistry: async () => ({
      extensions: [
        {
          id: 'test-ext',
          repo: REPO,
          download_url: COMPATIBLE_RELEASE.download_url
        }
      ]
    }),
    fetchReleases: async () => releases,
    fetchManifest: async () => null
  }
}

function makeCtx(overrides = {}) {
  return {
    skillRegistry: {
      refresh: async () => {},
      extensionsDir: '/tmp/exts-install-handler',
      getById: () => null,
      getAll: () => [],
      loadExtensions: async () => {},
      executeHook: async () => {}
    },
    buildExtensionsPayload: async () => ({ installed: [], registry: [] }),
    sendJson: () => {},
    readJsonBody: async () => ({}),
    store: { extensions: [], settings: {} },
    saveStore: () => {},
    ensureDir: () => {},
    llamaState: { process: null },
    semanticState: { embedding: { process: null } },
    extensionHostManager: {
      sendToPersistent: async () => ({ ok: false, error: 'not_available' }),
      startPersistent: async () => ({})
    },
    ...overrides
  }
}

describe('POST /extensions/install — multi-stage NDJSON error paths', () => {
  beforeEach(() => {
    _setRegistry(INSTALL_REGISTRY)
    _setCommunityRegistryForTests(
      makeMockCommunityRegistry({ releases: [COMPATIBLE_RELEASE] })
    )
  })
  afterAll(() => {
    _setCommunityRegistryForTests(null)
  })

  it('emits an incompatible_version error NDJSON chunk when the requested version is incompatible', async () => {
    _setCommunityRegistryForTests(
      makeMockCommunityRegistry({ releases: [INCOMPATIBLE_RELEASE] })
    )

    const ctx = makeCtx({
      readJsonBody: async () => ({ id: 'test-ext', version: '0.4.0' })
    })
    const handler = createExtensionsRoutes(ctx)
    const recorder = makeNdjsonRes()

    const handled = await handler(
      { method: 'POST' },
      recorder.res,
      '/extensions/install',
      { searchParams: new URLSearchParams() }
    )

    expect(handled).toBe(true)
    expect(recorder.ended).toBe(true)
    const lines = recorder.ndjsonLines()
    const errorChunk = lines.find((l) => l && l.ok === false)
    expect(errorChunk).toBeDefined()
    expect(errorChunk.error).toBe('incompatible_version')
    expect(errorChunk.status).toBe(409)
    expect(errorChunk.required_range).toBe('>=99.0.0')
    expect(errorChunk.release_version).toBe('0.4.0')
    // No progress stage chunk should precede an early error termination.
    expect(lines.some((l) => l && l.stage === 'downloading')).toBe(false)
  })

  it('emits a no_installable_release error NDJSON chunk when fetchReleases returns empty AND the catalog has no download_url fallback', async () => {
    const catEntry = { id: 'test-ext', repo: REPO }
    _setCommunityRegistryForTests({
      fetchRegistry: async () => ({ extensions: [catEntry] }),
      fetchReleases: async () => [],
      fetchManifest: async () => null
    })
    // Ensure the install registry has no download_url for this id so the
    // catalog-fallback path is also empty.
    _setRegistry({ extensions: [catEntry] })

    const ctx = makeCtx({
      readJsonBody: async () => ({ id: 'test-ext' })
    })
    const handler = createExtensionsRoutes(ctx)
    const recorder = makeNdjsonRes()

    const handled = await handler(
      { method: 'POST' },
      recorder.res,
      '/extensions/install',
      { searchParams: new URLSearchParams() }
    )

    expect(handled).toBe(true)
    expect(recorder.ended).toBe(true)
    const lines = recorder.ndjsonLines()
    const errorChunk = lines.find((l) => l && l.ok === false)
    expect(errorChunk).toBeDefined()
    expect(errorChunk.error).toBe('no_installable_release')
    expect(errorChunk.status).toBe(409)
    // No progress stage chunk should precede the early termination.
    expect(lines.some((l) => l && l.stage === 'downloading')).toBe(false)
  })

})
