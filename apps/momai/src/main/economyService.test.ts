import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { EconomyService, parseProcessList } from './economyService'

describe('EconomyService', () => {
  let service: EconomyService

  const MOCK_PROCS = ['chrome.exe', 'FortniteClient-Win64-Shipping.exe']

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

    const detected = await service.checkForGames(MOCK_PROCS)
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('Fortnite')
  })

  it('detects a known game from process list', async () => {
    service.setGamingModeEnabled(true)
    service.setKnownGames([
      { name: 'Fortnite', processNames: ['FortniteClient-Win64-Shipping.exe', 'FortniteLauncher.exe'] },
      { name: 'CS2', processNames: ['cs2.exe'] },
    ])

    const detected = await service.checkForGames(MOCK_PROCS)
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('Fortnite')
  })

  it('matches process names with or without .exe', async () => {
    service.setGamingModeEnabled(true)
    service.setKnownGames([
      { name: 'Fortnite', processNames: ['fortniteclient-win64-shipping'] },
    ])

    const detected = await service.checkForGames(MOCK_PROCS)
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('Fortnite')
  })

  it('includes steamGridId from known games', async () => {
    service.setGamingModeEnabled(true)
    service.setKnownGames([
      { name: 'CS2', processNames: ['cs2.exe'], steamGridId: 730 },
    ])

    const detected = await service.checkForGames(['cs2.exe'])
    expect(detected).toHaveLength(1)
    expect(detected[0].steamGridId).toBe(730)
  })

  it('activates economy when a game is detected', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' },
    ])

    await service.poll(MOCK_PROCS)

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

    await service.poll(MOCK_PROCS)
    expect(service.getState().active).toBe(true)

    await service.poll(['chrome.exe'])
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
    const detected = await service.checkForGames(MOCK_PROCS)
    expect(detected).toHaveLength(0)
  })

  it('parseProcessList parses Windows tasklist output', () => {
    const csv = [
      '"chrome.exe","123","Console","1","5.000 K"',
      '"FortniteClient-Win64-Shipping.exe","456","Console","1","10.000 K"',
    ].join('\n')
    const result = parseProcessList(csv)
    console.log('[TEST] parseProcessList result:', JSON.stringify(result))
    expect(result).toEqual(['chrome.exe', 'FortniteClient-Win64-Shipping.exe'])
  })
})
