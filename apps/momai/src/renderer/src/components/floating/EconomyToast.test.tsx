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

  it('renders when active with detected game and cover', () => {
    render(
      <EconomyToast
        economyState={{ active: true, reason: 'gaming', detectedGames: [{ name: 'Fortnite', processName: 'FortniteClient.exe', coverUrl: 'https://example.com/cover.jpg' }] }}
      />
    )
    expect(screen.getByText(/fortnite/i)).toBeTruthy()
    expect(screen.getByText(/economia de recursos/i)).toBeTruthy()
  })

  it('renders when inactive', () => {
    render(
      <EconomyToast
        economyState={{ active: false, reason: null, detectedGames: [] }}
      />
    )
    expect(screen.getByText(/sistemas restaurados/i)).toBeTruthy()
  })

  it('stays visible until dismissed', () => {
    const { container } = render(
      <EconomyToast
        economyState={{ active: true, reason: 'gaming', detectedGames: [{ name: 'Fortnite', processName: 'FortniteClient.exe' }] }}
      />
    )
    expect(container.children.length).toBeGreaterThan(0)
    act(() => { vi.advanceTimersByTime(10000) })
    expect(container.children.length).toBeGreaterThan(0)
  })

  it('dismisses on close button click', () => {
    render(
      <EconomyToast
        economyState={{ active: true, reason: 'gaming', detectedGames: [] }}
      />
    )
    const closeBtn = screen.getByRole('button')
    act(() => { closeBtn.click() })
    expect(screen.queryByText(/modo economia ativado/i)).toBeNull()
  })
})
