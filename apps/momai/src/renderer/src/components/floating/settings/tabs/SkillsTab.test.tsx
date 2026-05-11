import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SkillsTab } from './SkillsTab'

const mockExtensions = [
  { id: 'launcher', name: 'Launcher', category: 'core', enabled: true },
  { id: 'whatsapp', name: 'WhatsApp', category: 'extension', enabled: false }
]

const mockKeywords = {
  launcher: ['abre', 'abrir'],
  whatsapp: ['mensagem']
}

vi.mock('../../../../services/api', () => ({
  api: {
    fetchExtensions: vi.fn(() => Promise.resolve(mockExtensions)),
    fetchSkillKeywords: vi.fn(() => Promise.resolve(mockKeywords)),
    updateSkillKeywords: vi.fn(() => Promise.resolve())
  }
}))

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'settings.skills.title': 'Skills',
        'settings.skills.subtitle': 'Configure custom voice triggers',
        'settings.skills.noKeywords': 'No custom keywords',
        'settings.skills.edit': 'Edit',
        'settings.skills.addKeyword': 'Add word',
        'settings.skills.save': 'Save',
        'settings.skills.cancel': 'Cancel',
        'settings.skills.keywordsInUse': 'This word is already in use by:',
        'settings.tabs.skills': 'Skills'
      })[key] || key
  })
}))

describe('SkillsTab', () => {
  it('renders skills with their keywords', async () => {
    render(<SkillsTab />)

    await waitFor(() => {
      expect(screen.getByText('Launcher')).toBeTruthy()
      expect(screen.getByText('WhatsApp')).toBeTruthy()
    })

    expect(screen.getByText('abre')).toBeTruthy()
    expect(screen.getByText('abrir')).toBeTruthy()
    expect(screen.getByText('mensagem')).toBeTruthy()
    expect(screen.getByText('off')).toBeTruthy()
  })
})
