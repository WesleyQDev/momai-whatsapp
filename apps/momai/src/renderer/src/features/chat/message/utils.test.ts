import {
  cleanUIMetadata,
  humanizeToolName,
  minimizeText,
  humanizeActivity,
  processThinkTags,
  createUnifiedSteps
} from './utils'

describe('cleanUIMetadata', () => {
  it('removes markdown characters (# * ` _ ~ > [ ] ( ))', () => {
    expect(cleanUIMetadata('# Hello *world* `code` _italic_ ~strike~ >quote')).toBe(
      'Hello world code italic strike quote'
    )
  })

  it('removes "Nota:" prefix', () => {
    expect(cleanUIMetadata('Nota: something important')).toBe('something important')
    expect(cleanUIMetadata('nota: lowercase')).toBe('lowercase')
  })

  it('compacts whitespace', () => {
    expect(cleanUIMetadata('hello    world   test')).toBe('hello world test')
  })

  it('returns empty for empty input', () => {
    expect(cleanUIMetadata('')).toBe('')
  })
})

describe('humanizeToolName', () => {
  it('translates duckduckgo_search to "Busca na web"', () => {
    expect(humanizeToolName('duckduckgo_search')).toBe('Busca na web')
  })

  it('translates web_search to "Busca na web"', () => {
    expect(humanizeToolName('web_search')).toBe('Busca na web')
  })

  it('translates create_reminder to "Lembretes"', () => {
    expect(humanizeToolName('create_reminder')).toBe('Lembretes')
  })

  it('translates interface to "Interface"', () => {
    expect(humanizeToolName('interface')).toBe('Interface')
  })

  it('capitalizes fallback name', () => {
    expect(humanizeToolName('custom_tool')).toBe('Custom_tool')
  })

  it('returns "Ferramenta" for empty string', () => {
    expect(humanizeToolName('')).toBe('Ferramenta')
  })
})

describe('minimizeText', () => {
  it('returns text when under max', () => {
    const text = 'short'
    expect(minimizeText(text, 180)).toBe('short')
  })

  it('truncates with ellipsis when over', () => {
    const text = 'a'.repeat(50)
    expect(minimizeText(text, 10)).toBe('a'.repeat(10) + '...')
  })

  it('compacts whitespace', () => {
    expect(minimizeText('hello    world', 180)).toBe('hello world')
  })

  it('returns empty string for null', () => {
    expect(minimizeText(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(minimizeText(undefined)).toBe('')
  })
})

describe('humanizeActivity', () => {
  it('strips "especialista: executando " prefix', () => {
    expect(humanizeActivity('especialista: executando buscar na web')).toBe('buscar na web')
  })

  it('strips "manager: delegando para especialista" prefix', () => {
    expect(humanizeActivity('manager: delegando para especialista (buscar na web)')).toBe(
      'buscar na web'
    )
  })

  it('strips "manager: chamando ferramenta" prefix', () => {
    expect(humanizeActivity('manager: chamando ferramenta buscar na web')).toBe('buscar na web')
  })

  it('returns empty string for unrecognized activity', () => {
    expect(humanizeActivity('unknown activity')).toBe('')
  })
})

describe('processThinkTags', () => {
  it('strips <think> blocks entirely', () => {
    const result = processThinkTags('Hello <think>inner thought</think> world')
    expect(result.cleanText).toBe('Hello  world')
  })

  it('returns empty thoughts array', () => {
    const result = processThinkTags('no think tags')
    expect(result.thoughts).toEqual([])
  })

  it('handles text without think tags', () => {
    const result = processThinkTags('just regular text')
    expect(result.cleanText).toBe('just regular text')
  })
})

describe('createUnifiedSteps', () => {
  it('groups memory activities separately', () => {
    const activities = ['memória: remembering something...', 'memória: storing data...']
    const steps = createUnifiedSteps(activities, [], (n) => n)
    expect(steps).toHaveLength(2)
    expect(steps[0].isMemory).toBe(true)
    expect(steps[0].name).toBe('remembering something')
    expect(steps[1].isMemory).toBe(true)
    expect(steps[1].name).toBe('storing data')
  })

  it('deduplicates consecutive tool steps with same name and segment', () => {
    const toolSteps = [
      { name: 'duckduckgo_search', segment: 0, status: 'done' },
      { name: 'duckduckgo_search', segment: 0, status: 'done' }
    ]
    const steps = createUnifiedSteps([], toolSteps, (n) => n)
    expect(steps).toHaveLength(1)
    expect(steps[0].count).toBe(2)
  })

  it('separates different tool steps', () => {
    const toolSteps = [
      { name: 'duckduckgo_search', segment: 0, status: 'done' },
      { name: 'web_search', segment: 0, status: 'done' }
    ]
    const steps = createUnifiedSteps([], toolSteps, (n) => n)
    expect(steps).toHaveLength(2)
  })

  it('handles activate_skill steps correctly', () => {
    const toolSteps = [
      { name: 'activate_skill', query: '{"skill_id":"test-skill"}', segment: 0, status: 'done' }
    ]
    const steps = createUnifiedSteps([], toolSteps, (n) => n)
    expect(steps).toHaveLength(1)
    expect(steps[0].isSkill).toBe(true)
    expect(steps[0].name).toBe('Lendo habilidade de test-skill')
  })
})
