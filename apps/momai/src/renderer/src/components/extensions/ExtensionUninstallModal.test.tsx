import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'

import ExtensionUninstallModal from './ExtensionUninstallModal'

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (vars) {
        let text = key
        for (const [varKey, varValue] of Object.entries(vars)) {
          text = text.replaceAll(`{${varKey}}`, String(varValue))
        }
        return text
      }
      return key
    },
    locale: 'pt-BR',
    setLocale: vi.fn(),
    formatDate: vi.fn(),
    formatTime: vi.fn(),
    formatDateTime: vi.fn()
  })
}))

describe('ExtensionUninstallModal', () => {
  const baseProps = {
    ext: { id: 'whatsapp', name: 'WhatsApp' },
    onConfirm: vi.fn(),
    onCancel: vi.fn()
  }

  beforeEach(() => {
    baseProps.onConfirm = vi.fn()
    baseProps.onCancel = vi.fn()
  })

  it('renders title with extension name interpolated', () => {
    const { container } = render(
      <ExtensionUninstallModal
        ext={baseProps.ext}
        onConfirm={baseProps.onConfirm}
        onCancel={baseProps.onCancel}
      />
    )
    expect(container.textContent).toContain('WhatsApp')
    expect(container.textContent).toContain('Desinstalar WhatsApp?')
  })

  it('calls onConfirm when confirm button clicked', () => {
    const { getByRole } = render(
      <ExtensionUninstallModal
        ext={baseProps.ext}
        onConfirm={baseProps.onConfirm}
        onCancel={baseProps.onCancel}
      />
    )
    fireEvent.click(getByRole('button', { name: /Desinstalar/i }))
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1)
    expect(baseProps.onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel when cancel button clicked', () => {
    const { getByRole } = render(
      <ExtensionUninstallModal
        ext={baseProps.ext}
        onConfirm={baseProps.onConfirm}
        onCancel={baseProps.onCancel}
      />
    )
    fireEvent.click(getByRole('button', { name: /Cancelar/i }))
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1)
    expect(baseProps.onConfirm).not.toHaveBeenCalled()
  })

  it('calls onCancel when Escape key pressed', () => {
    render(
      <ExtensionUninstallModal
        ext={baseProps.ext}
        onConfirm={baseProps.onConfirm}
        onCancel={baseProps.onCancel}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when backdrop clicked', () => {
    const { container } = render(
      <ExtensionUninstallModal
        ext={baseProps.ext}
        onConfirm={baseProps.onConfirm}
        onCancel={baseProps.onCancel}
      />
    )
    const backdrop = container.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders dialog with accessible attributes', () => {
    const { getByRole } = render(
      <ExtensionUninstallModal
        ext={baseProps.ext}
        onConfirm={baseProps.onConfirm}
        onCancel={baseProps.onCancel}
      />
    )
    const dialog = getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'extension-uninstall-modal-title')
  })
})
