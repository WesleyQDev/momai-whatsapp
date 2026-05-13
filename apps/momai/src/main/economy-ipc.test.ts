import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  process.resourcesPath = '/mock/resources'
})

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
}))

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('./constants', () => ({
  API_BASE_URL: 'http://localhost:8000',
}))

vi.mock('./coreManager', () => ({
  restartCoreBackend: vi.fn(),
}))

import { state } from './state'
import { broadcastEconomyState } from './windowManager'

describe('economy IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('broadcasts economy state via mainWindow webContents', () => {
    const mockWin = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn(),
      },
    }
    state.mainWindow = mockWin as any

    const testState = {
      active: true,
      reason: 'gaming' as const,
      detectedGames: [{ name: 'Fortnite', processName: 'FortniteClient-Win64-Shipping.exe' }],
    }

    broadcastEconomyState(testState)

    expect(mockWin.webContents.send).toHaveBeenCalledWith('economy:state-change', testState)
  })
})
