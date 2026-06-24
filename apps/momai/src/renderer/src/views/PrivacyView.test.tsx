import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import PrivacyView from './PrivacyView'
import { fetchExtensions } from '../services/api'

vi.mock('../i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      if (vars) {
        let text = key
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, String(v))
        }
        return text
      }
      return key
    }
  })
}))

vi.mock('../services/api', () => ({
  fetchExtensions: vi.fn().mockResolvedValue([])
}))

const mockExport = vi.fn()
const mockDeleteAll = vi.fn()

beforeEach(() => {
  mockExport.mockReset()
  mockDeleteAll.mockReset()
  ;(globalThis as any).window = globalThis.window || {}
  ;(globalThis.window as any).momaiAPI = {
    privacy: {
      exportData: mockExport,
      deleteAll: mockDeleteAll
    }
  }
})

describe('PrivacyView', () => {
  it('renders the privacy sections', () => {
    render(<PrivacyView />)
    expect(screen.getByText('privacy.title')).toBeTruthy()
    expect(screen.getByText('privacy.stored.title')).toBeTruthy()
    expect(screen.getByText('privacy.notStored.title')).toBeTruthy()
    expect(screen.getByText('privacy.actions.title')).toBeTruthy()
  })

  it('renders the "what is stored" cards', () => {
    render(<PrivacyView />)
    expect(screen.getByText('privacy.stored.settings.title')).toBeTruthy()
    expect(screen.getByText('privacy.stored.chat.title')).toBeTruthy()
    expect(screen.getByText('privacy.stored.notes.title')).toBeTruthy()
    expect(screen.getByText('privacy.stored.reminders.title')).toBeTruthy()
    expect(screen.getByText('privacy.stored.observability.title')).toBeTruthy()
  })

  it('does NOT render the WhatsApp session card by default (no extension installed)', () => {
    render(<PrivacyView />)
    expect(screen.queryByText('privacy.stored.whatsapp.title')).toBeNull()
  })

  it('renders the "what is NOT stored" cards', () => {
    render(<PrivacyView />)
    expect(screen.getByText('privacy.notStored.telemetry.title')).toBeTruthy()
    expect(screen.getByText('privacy.notStored.accounts.title')).toBeTruthy()
    expect(screen.getByText('privacy.notStored.tracking.title')).toBeTruthy()
  })

  it('renders the privacy policy link', () => {
    render(<PrivacyView />)
    const link = screen.getByText('privacy.policyLink').closest('a')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toContain('politicas-privacidade-momai.html')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('calls privacy.exportData when the export button is clicked', async () => {
    mockExport.mockResolvedValue({ ok: true, filePath: '/tmp/x.zip', size: 1234 })
    render(<PrivacyView />)
    const exportButton = screen.getByText('privacy.export.button').closest('button')!
    expect(exportButton).toBeTruthy()
    await act(async () => {
      fireEvent.click(exportButton)
    })
    expect(mockExport).toHaveBeenCalledTimes(1)
  })

  it('shows a success message after a successful export', async () => {
    mockExport.mockResolvedValue({ ok: true, size: 2048 })
    render(<PrivacyView />)
    const exportButton = screen.getByText('privacy.export.button').closest('button')!
    await act(async () => {
      fireEvent.click(exportButton)
    })
    expect(await screen.findByText(/privacy.export.success/)).toBeTruthy()
  })

  it('shows an error message when export fails', async () => {
    mockExport.mockResolvedValue({ ok: false, error: 'disk full' })
    render(<PrivacyView />)
    const exportButton = screen.getByText('privacy.export.button').closest('button')!
    await act(async () => {
      fireEvent.click(exportButton)
    })
    expect(await screen.findByText(/privacy.export.error/)).toBeTruthy()
  })

  it('opens the ConfirmDialog when "Reset all my data" is clicked', async () => {
    render(<PrivacyView />)
    const resetButton = screen.getByText('settings.privacy.resetAllDataButton').closest('button')!
    await act(async () => {
      fireEvent.click(resetButton)
    })
    expect(screen.getByText('settings.privacy.confirmTitle')).toBeTruthy()
  })

  it('calls deleteAll and reloads on confirm', async () => {
    mockDeleteAll.mockResolvedValue({ ok: true })
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
      configurable: true
    })
    render(<PrivacyView />)
    const resetButton = screen.getByText('settings.privacy.resetAllDataButton').closest('button')!
    await act(async () => {
      fireEvent.click(resetButton)
    })
    const confirmButton = screen.getByText('settings.privacy.confirmButton').closest('button')!
    await act(async () => {
      fireEvent.click(confirmButton)
    })
    expect(mockDeleteAll).toHaveBeenCalledTimes(1)
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('shows error feedback when deleteAll fails', async () => {
    mockDeleteAll.mockResolvedValue({ ok: false, error: 'disk full' })
    render(<PrivacyView />)
    const resetButton = screen.getByText('settings.privacy.resetAllDataButton').closest('button')!
    await act(async () => {
      fireEvent.click(resetButton)
    })
    const confirmButton = screen.getByText('settings.privacy.confirmButton').closest('button')!
    await act(async () => {
      fireEvent.click(confirmButton)
    })
    expect(await screen.findByText(/settings.privacy.resetError/)).toBeTruthy()
  })

  it('shows skill card when extension declares manifest.storage', async () => {
    vi.mocked(fetchExtensions).mockResolvedValueOnce([
      {
        id: 'whatsapp',
        installed: true,
        name: 'WhatsApp',
        description: 'WhatsApp extension',
        category: 'messaging',
        enabled: true,
        icon: '💚',
        storage: {
          description: 'Sessão WhatsApp criptografada',
          locations: ['baileys-auth/', '*.json']
        }
      }
    ])
    render(<PrivacyView />)
    expect(await screen.findByText('WhatsApp')).toBeTruthy()
    expect(await screen.findByText('Sessão WhatsApp criptografada')).toBeTruthy()
    expect(await screen.findByText('baileys-auth/')).toBeTruthy()
  })
})
