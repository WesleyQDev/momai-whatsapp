const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createPromptRegistry } = require('../../prompt-registry')

describe('prompt-registry (refactored)', () => {
  let promptsDir
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-registry-test-'))
    promptsDir = path.join(tmpDir, 'prompts')
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(path.join(promptsDir, 'prompts.json'), JSON.stringify({
      version: 'test',
      default_persona: 'You are MomAI test.',
      default_style: 'balanced',
      system_template: '{{stable_tier}}\n\n{{context_tier}}\n\n{{volatile_tier}}',
      tiers: {
        pro: {
          response_style: 'balanced',
          tier_instructions: 'Be direct.'
        }
      },
      fallback_replies: {
        default: 'Fallback: {{summary}}.'
      }
    }), 'utf8')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('buildStableTier', () => {
    it('returns stable prompt with persona and rules', () => {
      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildStableTier({
        userName: 'TestUser',
        persona: 'You are MomAI custom.',
        responseStyle: 'balanced',
        tier: 'pro'
      })
      expect(result).toContain('You are MomAI')
      expect(result).toContain('TestUser')
      expect(result).toContain('Be direct')
      expect(result).not.toContain('<')
      expect(result).not.toContain('max_sentences')
      expect(result).not.toContain('Greet')
    })
  })

  describe('buildContextTier', () => {
    it('returns empty when no memories directory', () => {
      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildContextTier({ memoriesDir: path.join(tmpDir, 'nonexistent') })
      expect(result.trim()).toBe('')
    })

    it('formats memory files with bullets', () => {
      const memoriesDir = path.join(tmpDir, 'memories')
      fs.mkdirSync(memoriesDir, { recursive: true })
      fs.writeFileSync(path.join(memoriesDir, 'usuario.md'), 'gosta de tecnologia\n§\nprefere resposta curta', 'utf8')
      fs.writeFileSync(path.join(memoriesDir, 'persona.md'), 'MomAI é assistente pessoal', 'utf8')
      fs.writeFileSync(path.join(memoriesDir, 'conhecimento.md'), 'Python é usado para IA', 'utf8')

      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildContextTier({ memoriesDir })
      expect(result).toContain('-- User Profile --')
      expect(result).toContain('- gosta de tecnologia')
      expect(result).toContain('- prefere resposta curta')
      expect(result).toContain('-- Known Facts --')
      expect(result).toContain('Python é usado para IA')
      expect(result).not.toContain('§')
    })
  })

  describe('buildVolatileTier', () => {
    it('returns greeting for new conversation', () => {
      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildVolatileTier({
        threadId: 'test-123',
        modelName: 'Qwen3.5-4B',
        tier: 'pro',
        locale: 'pt-BR',
        hasHistory: false
      })
      expect(result).toContain('greet naturally')
    })

    it('returns empty for ongoing conversation', () => {
      const reg = createPromptRegistry({ promptsDir })
      const result = reg.buildVolatileTier({
        threadId: 'test-456',
        modelName: 'Qwen3.5-4B',
        tier: 'pro',
        locale: 'pt-BR',
        hasHistory: true
      })
      expect(result).toBe('')
    })
  })

  describe('buildSystemPrompt cache', () => {
    it('caches stable+context across calls with same sessionKey', () => {
      const reg = createPromptRegistry({ promptsDir })
      const input = {
        tier: 'pro',
        userName: 'User',
        persona: 'You are MomAI.',
        memoryContext: '',
        toolInstruction: '',
        responseStyle: 'balanced',
        responseLanguage: 'pt-BR',
        hasHistory: false
      }
      const r1 = reg.buildSystemPrompt(input)
      const r2 = reg.buildSystemPrompt(input)
      // Both have full content including volatile/clock
      expect(r1).toContain('# RUNTIME CLOCK')
      expect(r2).toContain('# RUNTIME CLOCK')
      expect(r1).toContain('greet naturally')
      expect(r1).not.toBe(r2)
    })

    it('loads custom persona from persona.md in memoriesDir and invalidates cache when updated', () => {
      const memoriesDir = path.join(tmpDir, 'memories')
      fs.mkdirSync(memoriesDir, { recursive: true })
      fs.writeFileSync(path.join(memoriesDir, 'persona.md'), 'Assistente especialista em código e humor.', 'utf8')

      const reg = createPromptRegistry({ promptsDir })
      const input = {
        tier: 'pro',
        userName: 'User',
        memoriesDir,
        hasHistory: true
      }
      const r1 = reg.buildSystemPrompt(input)
      expect(r1).toContain('Assistente especialista em código e humor.')

      // Update persona.md
      fs.writeFileSync(path.join(memoriesDir, 'persona.md'), 'Assistente de culinária e receitas.', 'utf8')

      const r2 = reg.buildSystemPrompt(input)
      expect(r2).toContain('Assistente de culinária e receitas.')
      expect(r2).not.toContain('Assistente especialista em código e humor.')
    })

    it('includes toolInstruction in buildSystemPrompt output', () => {
      const reg = createPromptRegistry({ promptsDir })
      const input = {
        tier: 'pro',
        userName: 'User',
        toolInstruction: 'Skills ativas:\n- SmartHome: Controle de dispositivos',
        hasHistory: true
      }
      const prompt = reg.buildSystemPrompt(input)
      expect(prompt).toContain('Skills ativas:')
      expect(prompt).toContain('SmartHome: Controle de dispositivos')
      expect(prompt).toContain('MANDATORY ACTION RULE')
    })
  })
})

