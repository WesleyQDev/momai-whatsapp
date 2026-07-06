const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const { createSkillRegistry } = require('../../skills/registry')

function makeTmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'momai-registry-'))
}

function makeFakeSharedState(devMode) {
  const mod = require('../../node-core/services/shared-state')
  mod.store = { settings: { dev_mode: devMode } }
  return () => {
    delete mod.store
  }
}

function writeManifest(dir, manifest) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${manifest.id}\ndescription: ${manifest.description || 'test skill'}\nversion: ${manifest.version || '1.0.0'}\n---\n# ${manifest.name}\n`
  )
}

describe('createSkillRegistry: dev mode (.dev folder) isolation', () => {
  let dataDir
  let builtinSkillsDir

  beforeEach(() => {
    dataDir = makeTmpDataDir()
    const extensionsDir = path.join(dataDir, 'extensions')
    fs.mkdirSync(extensionsDir, { recursive: true })
    builtinSkillsDir = path.join(dataDir, 'builtins')
    fs.mkdirSync(builtinSkillsDir, { recursive: true })
  })

  afterEach(() => {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true })
    } catch {}
  })

  it('in symlink mode: loads extension from .dev/<id> when it exists', async () => {
    const cleanup = makeFakeSharedState('symlink')

    const devDir = path.join(dataDir, 'extensions', '.dev', 'my-ext')
    writeManifest(devDir, { id: 'my-ext', name: 'Dev', version: '9.9.9' })

    const registry = createSkillRegistry({ dataDir, builtinSkillsDir })
    await registry.refresh()

    const all = registry.getAll()
    const skill = all.find((s) => s.id === 'my-ext')
    expect(skill).toBeTruthy()
    expect(skill.dir).toBe(path.resolve(devDir))

    cleanup()
  })

  it('in symlink mode: .dev/<id> takes precedence over extensionsDir/<id> with same id', async () => {
    const cleanup = makeFakeSharedState('symlink')

    const devDir = path.join(dataDir, 'extensions', '.dev', 'my-ext')
    const realDir = path.join(dataDir, 'extensions', 'my-ext')
    writeManifest(devDir, { id: 'my-ext', name: 'Dev', version: '9.9.9' })
    writeManifest(realDir, { id: 'my-ext', name: 'Real', version: '1.0.0' })

    const registry = createSkillRegistry({ dataDir, builtinSkillsDir })
    await registry.refresh()

    const skill = registry.getAll().find((s) => s.id === 'my-ext')
    expect(skill).toBeTruthy()
    expect(skill.dir).toBe(path.resolve(devDir))
    expect(skill.manifest.name).toBe('Dev')

    cleanup()
  })

  it('in store_test mode: .dev/<id> is ignored (only extensionsDir is scanned)', async () => {
    const cleanup = makeFakeSharedState('store_test')

    const devDir = path.join(dataDir, 'extensions', '.dev', 'my-ext')
    const realDir = path.join(dataDir, 'extensions', 'my-ext')
    writeManifest(devDir, { id: 'my-ext', name: 'Dev', version: '9.9.9' })
    writeManifest(realDir, { id: 'my-ext', name: 'Real', version: '1.0.0' })

    const registry = createSkillRegistry({ dataDir, builtinSkillsDir })
    await registry.refresh()

    const skill = registry.getAll().find((s) => s.id === 'my-ext')
    expect(skill).toBeTruthy()
    expect(skill.dir).toBe(path.resolve(realDir))
    expect(skill.manifest.name).toBe('Real')

    cleanup()
  })

  it('exposes extensionsDevDir as <extensionsDir>/.dev', () => {
    const cleanup = makeFakeSharedState('symlink')
    const registry = createSkillRegistry({ dataDir, builtinSkillsDir })
    expect(registry.extensionsDevDir).toBe(path.join(dataDir, 'extensions', '.dev'))
    cleanup()
  })
})
