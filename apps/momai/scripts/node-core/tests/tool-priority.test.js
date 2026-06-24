const { buildToolPriority } = require('../services/tool-priority')

describe('buildToolPriority', () => {
  it('renders one bullet per skill that declares toolPriority', () => {
    const skills = [
      { manifest: { toolPriority: { label: 'OPEN/ABRIR', rule: 'use launcher tools' } } },
      { manifest: { toolPriority: { label: 'WEATHER', rule: 'call get_weather' } } },
      { manifest: { name: 'no priority' } }
    ]
    const out = buildToolPriority(skills)
    expect(out).toBe('- OPEN/ABRIR: use launcher tools\n- WEATHER: call get_weather')
  })

  it('returns empty string when no skill has toolPriority', () => {
    expect(buildToolPriority([{ manifest: {} }])).toBe('')
  })
})
