import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPsList = vi.hoisted(() => vi.fn())
vi.mock('ps-list', () => ({ default: mockPsList }))

import { EconomyService } from './economyService'

describe('EconomyService', () => {
  let service: EconomyService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new EconomyService()
  })

  afterEach(async () => {
    await service.stop()
  })

  it('starts and stops without error', async () => {
    vi.useFakeTimers()
    mockPsList.mockResolvedValue([])
    await service.start()
    expect(service.isRunning()).toBe(true)
    await service.stop()
    expect(service.isRunning()).toBe(false)
    vi.useRealTimers()
  })

  it('detects a gaming app from process list', async () => {
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' },
    ])

    mockPsList.mockResolvedValue([
      { name: 'chrome.exe', pid: 123 },
      { name: 'FortniteClient-Win64-Shipping.exe', pid: 789 },
    ])

    const detected = await service.checkForGames()
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('Fortnite')
  })

  it('detects a known game from process list', async () => {
    service.setKnownGames([
      { name: 'Fortnite', processNames: ['FortniteClient-Win64-Shipping.exe', 'FortniteLauncher.exe'], steamGridId: null },
      { name: 'CS2', processNames: ['cs2.exe'], steamGridId: null },
    ])

    mockPsList.mockResolvedValue([
      { name: 'cs2.exe', pid: 456 },
      { name: 'chrome.exe', pid: 123 },
    ])

    const detected = await service.checkForGames()
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('CS2')
  })

  it('activates economy when a game is detected', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' },
    ])

    mockPsList.mockResolvedValue([
      { name: 'FortniteClient-Win64-Shipping.exe', pid: 789 },
    ])

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stopped: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await service.poll()

    expect(mockFetch).toHaveBeenCalledWith(
      `${economyHost}/llama/stop`,
      expect.objectContaining({ method: 'POST' })
    )
    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('gaming')
  })

  it('deactivates economy when game closes', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' },
    ])

    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    // First poll: game detected
    mockPsList.mockResolvedValueOnce([
      { name: 'FortniteClient-Win64-Shipping.exe', pid: 789 },
    ])
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ stopped: true }) })
    await service.poll()
    expect(service.getState().active).toBe(true)

    // Second poll: game gone
    mockPsList.mockResolvedValueOnce([
      { name: 'chrome.exe', pid: 123 },
    ])
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true }) })
    await service.poll()
    expect(service.getState().active).toBe(false)
    expect(mockFetch).toHaveBeenLastCalledWith(
      `${economyHost}/llama/start`,
      expect.objectContaining({ method: 'POST' })
    )
  })
})
