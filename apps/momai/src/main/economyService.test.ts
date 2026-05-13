import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPsList = vi.hoisted(() => vi.fn())
vi.mock('ps-list', () => ({ default: mockPsList }))

import { EconomyService } from './economyService'

describe('EconomyService', () => {
  let service: EconomyService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new EconomyService()
    service.httpGet = vi.fn().mockResolvedValue({ gaming_mode_enabled: true })
    service.httpPost = vi.fn().mockResolvedValue({ ok: true })
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
    service.setGamingModeEnabled(true)
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
    service.setGamingModeEnabled(true)
    service.setKnownGames([
      { name: 'Fortnite', processNames: ['FortniteClient-Win64-Shipping.exe', 'FortniteLauncher.exe'] },
      { name: 'CS2', processNames: ['cs2.exe'] },
    ])

    mockPsList.mockResolvedValue([
      { name: 'cs2.exe', pid: 456 },
      { name: 'chrome.exe', pid: 123 },
    ])

    const detected = await service.checkForGames()
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('CS2')
  })

  it('matches process names with or without .exe', async () => {
    service.setGamingModeEnabled(true)
    service.setKnownGames([
      { name: 'Fortnite', processNames: ['fortniteclient-win64-shipping'] },
    ])

    mockPsList.mockResolvedValue([
      { name: 'FortniteClient-Win64-Shipping.exe', pid: 789 },
    ])

    const detected = await service.checkForGames()
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('Fortnite')
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

    await service.poll()

    expect(service.httpPost).toHaveBeenCalledWith(
      `${economyHost}/llama/stop`
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

    mockPsList.mockResolvedValue([
      { name: 'FortniteClient-Win64-Shipping.exe', pid: 789 },
    ])
    await service.poll()
    expect(service.getState().active).toBe(true)

    mockPsList.mockResolvedValue([
      { name: 'chrome.exe', pid: 123 },
    ])
    await service.poll()
    expect(service.getState().active).toBe(false)
    expect(service.httpPost).toHaveBeenLastCalledWith(
      `${economyHost}/llama/start`
    )
  })

  it('returns empty when gaming mode is disabled', async () => {
    service.setGamingModeEnabled(false)
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' },
    ])
    mockPsList.mockResolvedValue([
      { name: 'FortniteClient-Win64-Shipping.exe', pid: 789 },
    ])
    const detected = await service.checkForGames()
    expect(detected).toHaveLength(0)
  })
})
