const dns = require('node:dns/promises')
const realLookup = dns.lookup

const { validateInstallUrl, _setRegistry } = require('../api/routes/extensions.routes.js')

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
    ).resolves.toBeUndefined()
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
