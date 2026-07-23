const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { createSkillRegistry } = require('../../skills/registry')

describe('registry meta-tools', () => {
  let dataDir
  let builtinDir

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-mt-'))
    builtinDir = path.join(dataDir, 'builtins')
    fs.mkdirSync(builtinDir, { recursive: true })
    const skillDir = path.join(builtinDir, 'weather')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'manifest.json'), JSON.stringify({
      id: 'weather',
      name: 'Weather',
      description: 'Get weather info',
      version: '1.0.0',
      tools: [{
        name: 'get_weather',
        description: 'Get weather for location',
        parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] }
      }]
    }), 'utf8')
  })

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  describe('executeMetaTool', () => {
    it('handles list_skills by running discoverTopN', () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      const result = registry.executeMetaTool('list_skills', { query: 'weather' })
      expect(result).toContain('weather')
    })

    it('handles request_skill by returning skill tools', async () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      await registry.loadBuiltins()
      const result = registry.executeMetaTool('request_skill', { skill_name: 'weather' })
      expect(result).toContain('get_weather')
    })

    it('returns error for nonexistent skill in request_skill', () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      const result = registry.executeMetaTool('request_skill', { skill_name: 'nonexistent' })
      expect(result).toContain('not found')
    })

    it('rejects unknown meta-tool', () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      expect(() => registry.executeMetaTool('unknown', {})).toThrow('Unknown meta-tool')
    })
  })

  describe('toOpenAITools with map', () => {
    it('returns tools array and toolToSkillMap', async () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      await registry.loadBuiltins()
      const result = registry.toOpenAITools(['weather'])
      expect(Array.isArray(result.tools)).toBe(true)
      expect(result.toolToSkillMap instanceof Map).toBe(true)
      expect(result.toolToSkillMap.get('get_weather')).toBe('weather')
    })

    it('does not add Skill: prefix in tool description', async () => {
      const registry = createSkillRegistry({ dataDir, builtinSkillsDir: builtinDir })
      await registry.loadBuiltins()
      const { tools } = registry.toOpenAITools(['weather'])
      const tool = tools.find((t) => t.function?.name === 'get_weather')
      expect(tool.function.description).not.toMatch(/\n\nSkill: /)
    })
  })
})
