const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')


let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-test-'))
})

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createFakeExtension() {
  fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({
    id: 'test-ext',
    storage: {
      locations: [
        'baileys-auth/',
        '*.json (contacts, history)'
      ]
    }
  }))
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-ext', version: '1.0.0' }))
  fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), JSON.stringify({}))
  fs.writeFileSync(path.join(tmpDir, 'runtime.js'), 'module.exports = {}')
  fs.mkdirSync(path.join(tmpDir, 'baileys-auth'))
  fs.writeFileSync(path.join(tmpDir, 'baileys-auth', 'creds.json.enc'), 'encrypted-creds')
  fs.writeFileSync(path.join(tmpDir, 'baileys-auth', 'worker.lock'), '1234')
  fs.writeFileSync(path.join(tmpDir, 'disabled_contacts.json'), JSON.stringify([]))
  fs.writeFileSync(path.join(tmpDir, 'wa_contacts.json'), JSON.stringify({}))
  fs.writeFileSync(path.join(tmpDir, 'chat_history.json'), JSON.stringify([]))
}

function simulatePreserve(tmpDir) {
  const preservedPaths = []
  const manifestPath = path.join(tmpDir, 'manifest.json')
  const oldManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const storageLocations = oldManifest.storage?.locations || []

  for (const loc of storageLocations) {
    const cleanLoc = String(loc).replace(/\s*\(.*?\)\s*$/, '').trim().replace(/\/+$/, '')
    if (!cleanLoc) continue

    if (cleanLoc.startsWith('*.')) {
      const extGlob = cleanLoc.slice(1)
      const items = fs.readdirSync(tmpDir).filter((f) =>
        f.endsWith(extGlob) &&
        f !== 'package.json' &&
        f !== 'package-lock.json' &&
        f !== 'manifest.json'
      )
      for (const item of items) {
        const src = path.join(tmpDir, item)
        const dst = path.join(tmpDir, `.preserve-test-${item}`)
        fs.renameSync(src, dst)
        preservedPaths.push({ src: dst, dst: path.join(tmpDir, item) })
      }
    } else {
      const src = path.join(tmpDir, cleanLoc)
      if (fs.existsSync(src)) {
        const dst = path.join(tmpDir, `.preserve-test-${path.basename(cleanLoc)}`)
        fs.renameSync(src, dst)
        preservedPaths.push({ src: dst, dst: src })
      }
    }
  }

  return preservedPaths
}

function simulateRestore(preservedPaths) {
  for (const { src, dst } of preservedPaths) {
    if (fs.existsSync(dst)) {
      fs.rmSync(dst, { recursive: true, force: true })
    }
    fs.renameSync(src, dst)
  }
}

describe('storage preservation during extension update', () => {
  it('preserves baileys-auth directory and json data files', () => {
    createFakeExtension()

    const originalFiles = fs.readdirSync(tmpDir)
    expect(originalFiles).toContain('manifest.json')
    expect(originalFiles).toContain('package.json')
    expect(originalFiles).toContain('runtime.js')
    expect(originalFiles).toContain('baileys-auth')
    expect(originalFiles).toContain('disabled_contacts.json')

    const preserved = simulatePreserve(tmpDir)

    const afterPreserve = fs.readdirSync(tmpDir)
    expect(afterPreserve).not.toContain('baileys-auth')
    expect(afterPreserve).not.toContain('disabled_contacts.json')
    expect(afterPreserve).not.toContain('wa_contacts.json')
    expect(afterPreserve).not.toContain('chat_history.json')
    expect(afterPreserve).toContain('manifest.json')
    expect(afterPreserve).toContain('package.json')
    expect(afterPreserve).toContain('runtime.js')

    expect(preserved.length).toBe(4)
    const preservedNames = preserved.map((p) => path.basename(p.dst))
    expect(preservedNames).toContain('baileys-auth')
    expect(preservedNames).toContain('disabled_contacts.json')
    expect(preservedNames).toContain('wa_contacts.json')
    expect(preservedNames).toContain('chat_history.json')

    simulateRestore(preserved)

    const finalFiles = fs.readdirSync(tmpDir)
    expect(finalFiles).toContain('baileys-auth')
    expect(finalFiles).toContain('disabled_contacts.json')
    expect(finalFiles).toContain('wa_contacts.json')
    expect(fs.existsSync(path.join(tmpDir, 'baileys-auth', 'creds.json.enc'))).toBe(true)
  })

  it('does NOT preserve package.json, package-lock.json, manifest.json', () => {
    createFakeExtension()

    const preserved = simulatePreserve(tmpDir)

    const restoredNames = preserved.map((p) => path.basename(p.dst))
    expect(restoredNames).not.toContain('package.json')
    expect(restoredNames).not.toContain('package-lock.json')
    expect(restoredNames).not.toContain('manifest.json')
  })

  it('handles empty storage.locations gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({
      id: 'test-ext',
      storage: { locations: [] }
    }))

    const preserved = simulatePreserve(tmpDir)
    expect(preserved).toEqual([])
  })

  it('handles missing storage field gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({
      id: 'test-ext'
    }))

    const preserved = simulatePreserve(tmpDir)
    expect(preserved).toEqual([])
  })

  it('handles storage locations with inline comments', () => {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({
      id: 'test-ext',
      storage: {
        locations: ['*.json (data files)']
      }
    }))
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({}))

    const preserved = simulatePreserve(tmpDir)
    const names = preserved.map((p) => path.basename(p.dst))
    expect(names).toContain('settings.json')
  })
})
