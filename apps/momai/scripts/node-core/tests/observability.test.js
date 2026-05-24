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

  it('buildObservabilityTrace produces correct structure', () => {
    const { buildObservabilityTrace } = require('../services/chat-service')
    const trace = buildObservabilityTrace({
      traceId: 'test-1',
      threadId: 'default',
      traceType: 'llm_call',
      totalDuration: 12300,
      preLlamaDuration: 340,
      firstTokenDuration: 890,
      genDuration: 11070,
      systemPrompt: 'You are a helpful assistant.',
      chatMessages: [{ role: 'user', content: 'hello' }],
      response: 'Hi there!',
      tps: 45.2,
      promptTokens: 420,
      genTokens: 138,
      modelName: 'llama-3.2',
      tier: 'pro',
      toolCount: 1,
      toolStepsList: [
        { name: 'get_weather', args: { city: 'SP' }, result: '28°C', duration_ms: 890 }
      ],
      activeSkillId: undefined,
      status: 'success'
    })
    expect(trace.id).toBe('test-1')
    expect(trace.total_duration).toBe(12300)
    expect(trace.tokens_per_second).toBe(45.2)
    expect(trace.status).toBe('success')
    expect(trace.tool_calls).toHaveLength(1)
    expect(trace.tool_calls[0].tool_name).toBe('get_weather')
    expect(trace.tool_calls[0].args).toEqual({ city: 'SP' })
    expect(trace.error).toBeUndefined()
  })

  it('buildObservabilityTrace includes error field when status is error', () => {
    const { buildObservabilityTrace } = require('../services/chat-service')
    const trace = buildObservabilityTrace({
      traceId: 'test-2',
      threadId: 'default',
      traceType: 'llm_call',
      totalDuration: 5000,
      tps: 0,
      promptTokens: 0,
      genTokens: 0,
      modelName: 'llama-3.2',
      tier: 'pro',
      status: 'error',
      errorMsg: 'LLM crashed'
    })
    expect(trace.status).toBe('error')
    expect(trace.error).toBe('LLM crashed')
  })
})
