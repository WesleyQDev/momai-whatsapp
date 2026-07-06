const { enrichReleasesWithCompat, parseReleaseCompat } = require('../services/community-registry')

describe('enrichReleasesWithCompat', () => {
  it('extracts momai_compat from YAML front-matter in release body', () => {
    const raw = [
      {
        tag_name: 'v0.3.30',
        body: '---\nmomai_compat: ">=1.4.0 <2.0.0"\n---\nChangelog',
        assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext.zip' }],
        draft: false
      }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result[0].momai_compat).toBe('>=1.4.0 <2.0.0')
    expect(result[0].version).toBe('0.3.30')
  })

  it('falls back to manifestCompat when body has no momai_compat', () => {
    const raw = [
      {
        tag_name: 'v0.4.0',
        body: 'Changelog only',
        assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext2.zip' }],
        draft: false
      }
    ]
    const result = enrichReleasesWithCompat(raw, '>=1.5.0 <3.0.0')
    expect(result[0].momai_compat).toBe('>=1.5.0 <3.0.0')
    expect(result[0].version).toBe('0.4.0')
  })

  it('returns null momai_compat when no compat info anywhere', () => {
    const raw = [
      {
        tag_name: 'v0.1.0',
        body: '',
        assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext3.zip' }],
        draft: false
      }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result[0].momai_compat).toBeNull()
  })

  it('filters out releases without zip asset', () => {
    const raw = [{ tag_name: 'v0.1.0', body: '', assets: [], draft: false }]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result).toHaveLength(0)
  })

  it('does not fall back to GitHub zipball_url', () => {
    const raw = [
      {
        tag_name: 'v0.3.31',
        body: '',
        assets: [],
        zipball_url: 'https://api.github.com/repos/x/y/zipball/v0.3.31',
        draft: false
      }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result).toHaveLength(0)
  })

  it('keeps earlier zip releases when a newer release lacks zip asset', () => {
    const raw = [
      {
        tag_name: 'v0.3.31',
        body: '',
        assets: [],
        zipball_url: 'https://api.github.com/repos/x/y/zipball/v0.3.31',
        draft: false
      },
      {
        tag_name: 'v0.3.30',
        body: '',
        assets: [
          {
            name: 'momai-whatsapp-extension-v0.3.30.zip',
            browser_download_url: 'https://github.com/x/y/releases/download/v0.3.30/zip.zip'
          }
        ],
        draft: false
      }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe('0.3.30')
  })

  it('filters out draft releases', () => {
    const raw = [
      {
        tag_name: 'v0.1.0',
        body: '',
        assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext.zip' }],
        draft: true
      }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result).toHaveLength(0)
  })

  it('sets version stripping leading v', () => {
    const raw = [
      {
        tag_name: 'v1.2.3',
        body: '',
        assets: [{ name: 'ext.zip', browser_download_url: 'https://ex.com/ext.zip' }],
        draft: false
      }
    ]
    const result = enrichReleasesWithCompat(raw, null)
    expect(result[0].version).toBe('1.2.3')
  })
})

describe('parseReleaseCompat', () => {
  it('extracts from YAML front-matter', () => {
    expect(
      parseReleaseCompat({ body: '---\nmomai_compat: ">=1.4.0 <2.0.0"\n---\nchangelog' })
    ).toBe('>=1.4.0 <2.0.0')
  })
  it('extracts from NOTE block fallback', () => {
    expect(
      parseReleaseCompat({ body: 'Some release\n> [!NOTE] momai_compat: >=1.5.0 <2.0.0\nDone' })
    ).toBe('>=1.5.0 <2.0.0')
  })
  it('returns null when body has no momai_compat', () => {
    expect(parseReleaseCompat({ body: 'just changelog' })).toBeNull()
  })
  it('returns null when release is null/undefined or body is falsy', () => {
    expect(parseReleaseCompat(null)).toBeNull()
    expect(parseReleaseCompat({})).toBeNull()
    expect(parseReleaseCompat({ body: '' })).toBeNull()
  })
})
