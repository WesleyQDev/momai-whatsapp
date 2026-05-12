import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import LateralBar from './LateralBar'

vi.mock('../i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

beforeEach(() => {
  localStorage.clear()
})

describe('LateralBar - observability button', () => {
  it('shows observability button when enabled in localStorage', () => {
    localStorage.setItem('momai_observability_enabled', 'true')
    render(<LateralBar activeRoute="/" onNavigate={vi.fn()} />)
    expect(screen.getByTitle(/Observabilidade/i)).toBeTruthy()
  })

  it('hides observability button when disabled in localStorage', () => {
    localStorage.setItem('momai_observability_enabled', 'false')
    render(<LateralBar activeRoute="/" onNavigate={vi.fn()} />)
    expect(screen.queryByTitle(/Observabilidade/i)).toBeNull()
  })

  it('highlights observability button when route is /observability', () => {
    localStorage.setItem('momai_observability_enabled', 'true')
    render(<LateralBar activeRoute="/observability" onNavigate={vi.fn()} />)
    const btn = screen.getByTitle(/Observabilidade/i)
    expect(btn.className).toContain('text-accent')
  })

  it('syncs when momai_observability_sync event fires', () => {
    localStorage.setItem('momai_observability_enabled', 'false')
    const { rerender } = render(<LateralBar activeRoute="/" onNavigate={vi.fn()} />)
    expect(screen.queryByTitle(/Observabilidade/i)).toBeNull()

    localStorage.setItem('momai_observability_enabled', 'true')
    act(() => {
      window.dispatchEvent(new CustomEvent('momai_observability_sync'))
    })
    rerender(<LateralBar activeRoute="/" onNavigate={vi.fn()} />)
    expect(screen.getByTitle(/Observabilidade/i)).toBeTruthy()
  })
})
