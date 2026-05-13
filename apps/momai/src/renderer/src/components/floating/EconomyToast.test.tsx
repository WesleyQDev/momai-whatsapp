import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import EconomyToast from './EconomyToast'

describe('EconomyToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders when active with detected game', () => {
    render(
      <EconomyToast
        economyState={{ active: true, reason: 'gaming', detectedGames: [{ name: 'Fortnite', processName: 'FortniteClient.exe' }] }}
      />
    )
    expect(screen.getByText(/economia ativado/i)).toBeTruthy()
    expect(screen.getByText(/fortnite/i)).toBeTruthy()
  })

  it('renders when inactive', () => {
    render(
      <EconomyToast
        economyState={{ active: false, reason: null, detectedGames: [] }}
      />
    )
    expect(screen.getByText(/sistemas restaurados/i)).toBeTruthy()
  })

  it('auto-hides after 5 seconds', () => {
    const { container } = render(
      <EconomyToast
        economyState={{ active: true, reason: 'gaming', detectedGames: [] }}
      />
    )
    expect(container.children.length).toBeGreaterThan(0)
    act(() => { vi.advanceTimersByTime(5001) })
    expect(container.children.length).toBe(0)
  })

  it('dismisses on close button click', () => {
    render(
      <EconomyToast
        economyState={{ active: true, reason: 'gaming', detectedGames: [] }}
      />
    )
    const closeBtn = screen.getByRole('button')
    act(() => { closeBtn.click() })
    expect(screen.queryByText(/economia ativado/i)).toBeNull()
  })
})
