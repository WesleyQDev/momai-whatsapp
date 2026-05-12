import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DeveloperTab from './DeveloperTab'

function renderTab(isDevMode = true) {
  localStorage.setItem('momai_dev_mode', String(isDevMode))
  localStorage.removeItem('momai_observability_enabled')
  const handleDevMode = vi.fn()
  return render(<DeveloperTab t={(key: string) => key} handleDevMode={handleDevMode} />)
}

describe('DeveloperTab - Observability toggle', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows observability toggle when dev mode is active', () => {
    renderTab(true)
    expect(screen.getByText('Observabilidade de IA')).toBeTruthy()
  })

  it('hides observability toggle when dev mode is inactive', () => {
    renderTab(false)
    expect(screen.queryByTestId('observability-toggle')).toBeNull()
  })

  it('toggles observability on click and saves to localStorage', () => {
    renderTab(true)
    const toggle = screen.getByTestId('observability-toggle')
    fireEvent.click(toggle)
    expect(localStorage.getItem('momai_observability_enabled')).toBe('true')

    fireEvent.click(toggle)
    expect(localStorage.getItem('momai_observability_enabled')).toBe('false')
  })

  it('dispatches observability sync event on toggle', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    renderTab(true)
    const toggle = screen.getByTestId('observability-toggle')
    fireEvent.click(toggle)

    const calls = dispatchSpy.mock.calls.filter(
      ([e]) => e.type === 'momai_observability_sync'
    )
    expect(calls.length).toBe(1)
    expect((calls[0][0] as CustomEvent).detail).toBe(true)
  })
})
