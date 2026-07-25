import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ObservabilityView from './ObservabilityView'
import { getTraces } from '../stores/observabilityStore'

const mockTraces = [
  {
    id: 'trace-1',
    timestamp: Date.now() - 10000,
    type: 'llm_call' as const,
    status: 'success' as const,
    total_duration: 12300,
    pre_llm_duration: 340,
    first_token_duration: 890,
    generation_duration: 11070,
    system_prompt: 'You are a helpful assistant.',
    messages: [
      { role: 'user', content: 'Qual a previsão do tempo em SP?' },
      { role: 'assistant', content: 'Em São Paulo faz 28°C.' }
    ],
    response: 'Em São Paulo faz 28°C.',
    tokens_per_second: 45.2,
    total_tokens: 558,
    estimated_prompt_tokens: 420,
    generated_tokens: 138,
    model: 'llama-3.2',
    tier: 'pro',
    tools_count: 1,
    tool_calls: [
      { tool_name: 'get_weather', args: { city: 'SP' }, result: '28°C', duration_ms: 890 }
    ],
    thread_id: 'default'
  },
  {
    id: 'trace-2',
    timestamp: Date.now() - 60000,
    type: 'skill' as const,
    status: 'success' as const,
    total_duration: 1200,
    tokens_per_second: 0,
    total_tokens: 0,
    model: 'llama-3.2',
    tier: 'pro',
    tools_count: 0,
    thread_id: 'default',
    active_skill: 'weather',
    content: 'Clima: 28°C'
  }
]

describe('ObservabilityView', () => {
  beforeEach(() => {
    while (getTraces().length) getTraces().pop()
  })

  it('renders empty state when no traces', () => {
    render(<ObservabilityView />)
    expect(screen.getByText(/Faça uma pergunta/i)).toBeTruthy()
  })

  it('renders trace list with mock data', () => {
    render(<ObservabilityView initialTraces={mockTraces} />)
    expect(screen.getByText(/Qual a previsão/i)).toBeTruthy()
  })

  it('shows detail when trace is clicked', () => {
    render(<ObservabilityView initialTraces={mockTraces} />)
    const btn = screen.getByText(/Qual a previsão/i).closest('button')
    if (btn) fireEvent.click(btn)
    expect(screen.getByText(/get_weather/i)).toBeTruthy()
  })

  it('syncs with momai_observability_trace events', () => {
    render(<ObservabilityView />)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('momai_observability_trace', {
          detail: mockTraces[0]
        })
      )
    })
    expect(screen.getByText(/Qual a previsão/i)).toBeTruthy()
  })
})
