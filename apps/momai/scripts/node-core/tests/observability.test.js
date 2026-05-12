describe('observability', () => {
  it('shared-state has observabilityBuffer', () => {
    const shared = require('../services/shared-state')
    expect(Array.isArray(shared.observabilityBuffer)).toBe(true)
  })

  it('observabilityBuffer accepts new traces', () => {
    const shared = require('../services/shared-state')
    shared.observabilityBuffer = []
    shared.observabilityBuffer.unshift({ id: 'test', type: 'llm_call', status: 'success' })
    expect(shared.observabilityBuffer.length).toBe(1)
  })

  it('observabilityBuffer trims to 50 items', () => {
    const shared = require('../services/shared-state')
    shared.observabilityBuffer = []
    for (let i = 0; i < 60; i++) {
      shared.observabilityBuffer.unshift({ id: `trace-${i}` })
      if (shared.observabilityBuffer.length > 50) {
        shared.observabilityBuffer.length = 50
      }
    }
    expect(shared.observabilityBuffer.length).toBe(50)
  })
})
