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
  const originalPackaged = process.env.MOMAI_IS_PACKAGED

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
    if (originalPackaged === undefined) delete process.env.MOMAI_IS_PACKAGED
    else process.env.MOMAI_IS_PACKAGED = originalPackaged
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

  it('in packaged builds: scans extensionsDir/<id> even when settings say symlink', () => {
    // Production builds must ignore the dev_mode setting and always load
    // store-installed extensions from extensionsDir/<id>.
    process.env.MOMAI_IS_PACKAGED = '1'
    const cleanup = makeFakeSharedState('symlink')

    const realDir = path.join(dataDir, 'extensions', 'whatsapp')
    writeManifest(realDir, { id: 'whatsapp', name: 'WhatsApp Store', version: '1.0.0' })

    const registry = createSkillRegistry({ dataDir, builtinSkillsDir })

    cleanup()
    return registry.refresh().then(() => {
      const skill = registry.getAll().find((s) => s.id === 'whatsapp')
      expect(skill).toBeTruthy()
      expect(skill.dir).toBe(path.resolve(realDir))
      expect(skill.manifest.name).toBe('WhatsApp Store')
    })
  })
})

describe('createSkillRegistry: strict mode isolation (regression for store/dev conflict)', () => {
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

  it('in symlink mode: extensionsDir/<id> is NOT loaded when there is no .dev/<id> (regression: loja version must not bleed into dev mode)', async () => {
    const cleanup = makeFakeSharedState('symlink')

    const realDir = path.join(dataDir, 'extensions', 'whatsapp')
    writeManifest(realDir, { id: 'whatsapp', name: 'WhatsApp Loja', version: '1.0.0' })

    const registry = createSkillRegistry({ dataDir, builtinSkillsDir })
    await registry.refresh()

    const skill = registry.getAll().find((s) => s.id === 'whatsapp')
    expect(skill).toBeUndefined()

    cleanup()
  })

  it('in store_test mode: a symlink in .dev/<id> is NOT loaded when extensionsDir/<id> is missing (regression: dev symlink must not bleed into store mode)', async () => {
    const cleanup = makeFakeSharedState('store_test')

    const devDir = path.join(dataDir, 'extensions', '.dev', 'whatsapp')
    writeManifest(devDir, { id: 'whatsapp', name: 'WhatsApp Dev', version: '9.9.9' })

    const registry = createSkillRegistry({ dataDir, builtinSkillsDir })
    await registry.refresh()

    const skill = registry.getAll().find((s) => s.id === 'whatsapp')
    expect(skill).toBeUndefined()

    cleanup()
  })

  it('in symlink mode: scan follows a real symlink in .dev/<id> (extension is loaded through the symlink target)', async () => {
    const cleanup = makeFakeSharedState('symlink')

    const target = path.join(dataDir, 'local-source', 'whatsapp')
    const devDir = path.join(dataDir, 'extensions', '.dev', 'whatsapp')
    writeManifest(target, { id: 'whatsapp', name: 'WhatsApp Local', version: '0.0.1' })
    fs.mkdirSync(path.dirname(devDir), { recursive: true })
    try {
      fs.symlinkSync(target, devDir, 'dir')
    } catch (e) {
      // Windows may require admin or developer mode; skip if unsupported
      cleanup()
      return
    }

    const registry = createSkillRegistry({ dataDir, builtinSkillsDir })
    await registry.refresh()

    const skill = registry.getAll().find((s) => s.id === 'whatsapp')
    expect(skill).toBeTruthy()
    expect(skill.manifest.name).toBe('WhatsApp Local')

    cleanup()
  })
})
