import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EconomyTab } from './EconomyTab'

describe('EconomyTab', () => {
  const baseProps = {
    t: (key: string) => {
      const translations: Record<string, string> = {
        'settings.economy.title': 'Economy',
        'settings.economy.badge': 'NEW',
        'settings.economy.subtitle': 'Save resources',
        'settings.economy.monitoringTitle': 'Monitoring',
        'settings.economy.monitoringBody': 'Monitor heavy processes',
        'settings.economy.addTrigger': 'Add trigger',
        'settings.economy.appNamePlaceholder': 'App name',
        'settings.economy.appExePlaceholder': 'App exe',
        'settings.economy.addButton': 'Add',
        'settings.economy.monitoredApps': 'Monitored apps',
        'settings.economy.emptyApps': 'No apps',
        'settings.economy.timeoutAppOpen': 'Timeout (app open)',
        'settings.economy.timeoutMinimized': 'Timeout (minimized)',
        'settings.economy.gamingMode': 'Gaming Mode',
        'settings.economy.gamingModeDesc': 'Auto-detect games',
      }
      return translations[key] || key
    },
    newApp: { name: '', executable: '' },
    setNewApp: () => {},
    handleAddGamingApp: async () => {},
    handleDeleteGamingApp: async () => {},
    gamingApps: [],
    economyConfig: {
      gaming_mode_enabled: false,
      idle_timeout_app_open: 5,
      idle_timeout_minimized: 1,
      auto_detect_known_games: true,
      gaming_apps: [],
    },
    onUpdateConfig: async () => {},
    economyState: { active: false, reason: null, detectedGames: [] },
  }

  it('renders without crashing', () => {
    expect(() => render(<EconomyTab {...baseProps} />)).not.toThrow()
  })

  it('renders title', () => {
    render(<EconomyTab {...baseProps} />)
    expect(screen.getByText(/economy/i)).toBeTruthy()
  })

  it('renders auto-detect toggle', () => {
    render(<EconomyTab {...baseProps} />)
    expect(screen.getByText(/auto-detect/i)).toBeTruthy()
  })

  it('renders add button', () => {
    render(<EconomyTab {...baseProps} />)
    expect(screen.getByText(/add/i)).toBeTruthy()
  })

  it('shows loading catalog state', () => {
    render(<EconomyTab {...baseProps} />)
    expect(screen.getByText(/carregando catálogo/i)).toBeTruthy()
  })

  it('shows agora jogando section when games detected', () => {
    render(
      <EconomyTab
        {...baseProps}
        economyState={{
          active: true,
          reason: null,
          detectedGames: [{ name: 'Game1', processName: 'game1.exe', coverUrl: null }],
        }}
      />
    )
    expect(screen.getByText(/agora jogando/i)).toBeTruthy()
    expect(screen.getByText(/game1/i)).toBeTruthy()
  })
})
