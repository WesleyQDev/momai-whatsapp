import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ObservabilityView from './ObservabilityView'

const mockTraces = [
  {
    id: 'trace-1',
    timestamp: Date.now() - 10000,
    type: 'llm_call',
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
    thread_id: 'default',
    status: 'success'
  },
  {
    id: 'trace-2',
    timestamp: Date.now() - 60000,
    type: 'skill',
    total_duration: 1200,
    tokens_per_second: 0,
    total_tokens: 0,
    model: 'llama-3.2',
    tier: 'pro',
    tools_count: 0,
    thread_id: 'default',
    status: 'success',
    active_skill: 'weather'
  }
]

describe('ObservabilityView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders empty state when no traces', () => {
    render(<ObservabilityView />)
    expect(screen.getByText(/Nenhum trace/i)).toBeTruthy()
  })

  it('renders trace list with mock data', () => {
    render(<ObservabilityView initialTraces={mockTraces} />)
    expect(screen.getByText('45.2')).toBeTruthy()
    expect(screen.getByText('12.3s')).toBeTruthy()
  })

  it('expands trace on click to show details', () => {
    render(<ObservabilityView initialTraces={mockTraces} />)
    const expandBtns = screen.getAllByRole('button')
    const traceBtn = expandBtns.find(b => b.getAttribute('aria-expanded') === 'false')
    if (traceBtn) fireEvent.click(traceBtn)
    expect(screen.getByText(/Pre-LLM/i)).toBeTruthy()
    expect(screen.getByText(/get_weather/i)).toBeTruthy()
  })

  it('filters traces by type', () => {
    render(<ObservabilityView initialTraces={mockTraces} />)
    fireEvent.click(screen.getByText(/Skills/i))
    expect(screen.queryByText('45.2')).toBeNull()
    fireEvent.click(screen.getByText(/Todas/i))
    expect(screen.getByText('45.2')).toBeTruthy()
  })

  it('syncs with momai_observability_trace events', () => {
    render(<ObservabilityView />)
    act(() => {
      window.dispatchEvent(new CustomEvent('momai_observability_trace', {
        detail: mockTraces[0]
      }))
    })
    expect(screen.getByText('45.2')).toBeTruthy()
  })
})
