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

describe('LateralBar - extension panels and New badge', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows New badge for a newly active panel extension, then hides it when clicked', () => {
    const onOpenPanel = vi.fn()
    render(<LateralBar activeRoute="/" onNavigate={vi.fn()} onOpenPanel={onOpenPanel} />)

    const extensions = [
      {
        id: 'whatsapp',
        name: 'WhatsApp',
        enabled: true,
        features: {
          sidebarPanel: {
            icon: '💚',
            label: 'WhatsApp',
            panelEndpoint: '/extensions/whatsapp/panel'
          }
        }
      }
    ]

    act(() => {
      window.dispatchEvent(new CustomEvent('momai_extensions_sync', { detail: extensions }))
    })

    // Verify button with title "WhatsApp" is rendered
    const button = screen.getByTitle('WhatsApp')
    expect(button).toBeTruthy()

    // Verify "New" badge is rendered inside/alongside the button
    expect(screen.getByText('New')).toBeTruthy()

    // Click the button
    act(() => {
      button.click()
    })

    // Verify click handler called
    expect(onOpenPanel).toHaveBeenCalledWith('whatsapp')

    // Verify "New" badge is gone
    expect(screen.queryByText('New')).toBeNull()

    // Verify it is stored in localStorage
    const stored = localStorage.getItem('momai_seen_panels')
    expect(stored).toContain('whatsapp')
  })

  it('resets New badge when extension is disabled and then re-enabled', () => {
    const onOpenPanel = vi.fn()
    render(<LateralBar activeRoute="/" onNavigate={vi.fn()} onOpenPanel={onOpenPanel} />)

    const extensions = [
      {
        id: 'whatsapp',
        name: 'WhatsApp',
        enabled: true,
        features: {
          sidebarPanel: {
            icon: '💚',
            label: 'WhatsApp',
            panelEndpoint: '/extensions/whatsapp/panel'
          }
        }
      }
    ]

    // 1. Sync enabled extension
    act(() => {
      window.dispatchEvent(new CustomEvent('momai_extensions_sync', { detail: extensions }))
    })

    const button = screen.getByTitle('WhatsApp')
    expect(screen.getByText('New')).toBeTruthy()

    // 2. Click to make it seen
    act(() => {
      button.click()
    })
    expect(screen.queryByText('New')).toBeNull()

    // 3. Disable extension
    const disabledExtensions = [
      {
        ...extensions[0],
        enabled: false
      }
    ]
    act(() => {
      window.dispatchEvent(new CustomEvent('momai_extensions_sync', { detail: disabledExtensions }))
    })

    // 4. Re-enable extension
    act(() => {
      window.dispatchEvent(new CustomEvent('momai_extensions_sync', { detail: extensions }))
    })

    // 5. Verify the "New" badge is back!
    expect(screen.getByText('New')).toBeTruthy()
  })
})
