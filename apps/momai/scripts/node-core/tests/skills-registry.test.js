const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createSkillRegistry } = require('../../skills/registry')

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'momai-skill-registry-test-'))
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8')
}

function writeFile(p, content) {
  fs.writeFileSync(p, content, 'utf8')
}

describe('createSkillRegistry.loadExtensions', () => {
  let workDir
  let builtinDir

  beforeEach(() => {
    workDir = makeTempDir()
    builtinDir = path.join(workDir, 'builtins')
    fs.mkdirSync(builtinDir, { recursive: true })
  })

  afterEach(() => {
    try {
      fs.rmSync(workDir, { recursive: true, force: true })
    } catch {}
  })

  it('loads an extension that has manifest.json + background-worker.js (no SKILL.md)', async () => {
    const extDir = path.join(workDir, 'data', 'extensions', 'whatsapp')
    fs.mkdirSync(extDir, { recursive: true })
    writeJson(path.join(extDir, 'manifest.json'), {
      id: 'whatsapp',
      name: 'WhatsApp',
      description: 'Monitor and reply to WhatsApp messages',
      version: '0.3.30',
      author: 'WesleyQDev',
      sidebar: true,
      background: true,
      backgroundScript: 'background-worker.js',
      permissions: ['network:persistent', 'storage:persistent'],
      eventTypes: ['whatsapp_message'],
      ui: { page: 'dist/page.js', pageType: 'whatsapp-page' },
      voiceHooks: { reply: { tool: 'get_history' } }
    })
    writeFile(
      path.join(extDir, 'background-worker.js'),
      'module.exports = { hooks: { onInstall: () => {} } }'
    )
    writeFile(path.join(extDir, 'LICENSE'), 'MIT')
    fs.mkdirSync(path.join(extDir, 'dist'), { recursive: true })
    writeFile(path.join(extDir, 'dist', 'page.js'), 'export default {}')

    const reg = createSkillRegistry({
      dataDir: path.join(workDir, 'data'),
      builtinSkillsDir: builtinDir
    })
    await reg.loadExtensions()
    const all = reg.getAll()
    expect(all).toHaveLength(1)
    const sk = all[0]
    expect(sk.id).toBe('whatsapp')
    expect(sk.kind).toBe('extension')
    expect(sk.manifest.name).toBe('WhatsApp')
    expect(sk.manifest.description).toBe('Monitor and reply to WhatsApp messages')
    expect(sk.manifest.eventTypes).toEqual(['whatsapp_message'])
    expect(sk.manifest.ui.page).toBe('dist/page.js')
    expect(sk.manifest.permissions).toBeTruthy()
    expect(JSON.stringify(sk.manifest.permissions)).toContain('network:persistent')
    expect(JSON.stringify(sk.manifest.permissions)).toContain('storage:persistent')
    expect(typeof sk.execute || sk.hooks || sk.manifest).toBe('object')
  })

  it('rejects an extension directory with no SKILL.md and no manifest.json', async () => {
    const extDir = path.join(workDir, 'data', 'extensions', 'state-only')
    fs.mkdirSync(extDir, { recursive: true })
    writeFile(path.join(extDir, 'state.json'), '{}')
    writeFile(path.join(extDir, 'cache.db'), 'binary')

    const reg = createSkillRegistry({
      dataDir: path.join(workDir, 'data'),
      builtinSkillsDir: builtinDir
    })
    await reg.loadExtensions()
    expect(reg.getAll()).toEqual([])
  })

  it('still loads legacy SKILL.md extensions as before', async () => {
    const extDir = path.join(workDir, 'data', 'extensions', 'legacy')
    fs.mkdirSync(extDir, { recursive: true })
    writeFile(
      path.join(extDir, 'SKILL.md'),
      '---\nname: legacy\ndescription: A legacy skill\n---\n\n# Body\n'
    )

    const reg = createSkillRegistry({
      dataDir: path.join(workDir, 'data'),
      builtinSkillsDir: builtinDir
    })
    await reg.loadExtensions()
    const all = reg.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('legacy')
    expect(all[0].manifest.name).toBe('legacy')
  })

  it('loads tools from manifest.json when runtime is not imported (extension discovery read-only)', async () => {
    const extDir = path.join(workDir, 'data', 'extensions', 'manifest-tools')
    fs.mkdirSync(extDir, { recursive: true })
    writeJson(path.join(extDir, 'manifest.json'), {
      id: 'manifest-tools',
      name: 'Manifest Tools Extension',
      description: 'Extension that declares tools exclusively in manifest.json',
      tools: [
        { name: 'tool_a', description: 'Tool A from manifest', parameters: { type: 'object', properties: {} } },
        { name: 'tool_b', description: 'Tool B from manifest', parameters: { type: 'object', properties: { query: { type: 'string' } } } }
      ]
    })

    const reg = createSkillRegistry({
      dataDir: path.join(workDir, 'data'),
      builtinSkillsDir: builtinDir
    })
    await reg.loadExtensions()
    const all = reg.getAll()
    expect(all).toHaveLength(1)
    const sk = all[0]
    expect(sk.id).toBe('manifest-tools')
    expect(sk.kind).toBe('extension')
    expect(sk.manifest.tools).toHaveLength(2)
    expect(sk.manifest.tools[0].name).toBe('tool_a')
    expect(sk.manifest.tools[0].description).toBe('Tool A from manifest')
    expect(sk.manifest.tools[1].name).toBe('tool_b')
  })
})
