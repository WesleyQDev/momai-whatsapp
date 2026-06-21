import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { EconomyService, parseProcessList } from './economyService'

describe('EconomyService', () => {
  let service: EconomyService

  const MOCK_PROCS = ['chrome.exe', 'FortniteClient-Win64-Shipping.exe']

  beforeEach(() => {
    vi.clearAllMocks()
    service = new EconomyService()
    service.httpGet = vi.fn().mockResolvedValue({
      gaming_mode_enabled: true,
      idle_timeout_app_open: 5,
      idle_timeout_minimized: 1
    })
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
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' }
    ])

    const detected = await service.checkForGames(MOCK_PROCS)
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('Fortnite')
  })

  it('detects a known game from process list', async () => {
    service.setGamingModeEnabled(true)
    service.setKnownGames([
      {
        name: 'Fortnite',
        processNames: ['FortniteClient-Win64-Shipping.exe', 'FortniteLauncher.exe']
      },
      { name: 'CS2', processNames: ['cs2.exe'] }
    ])

    const detected = await service.checkForGames(MOCK_PROCS)
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('Fortnite')
  })

  it('matches process names with or without .exe', async () => {
    service.setGamingModeEnabled(true)
    service.setKnownGames([{ name: 'Fortnite', processNames: ['fortniteclient-win64-shipping'] }])

    const detected = await service.checkForGames(MOCK_PROCS)
    expect(detected).toHaveLength(1)
    expect(detected[0].name).toBe('Fortnite')
  })

  it('includes steamGridId from known games', async () => {
    service.setGamingModeEnabled(true)
    service.setKnownGames([{ name: 'CS2', processNames: ['cs2.exe'], steamGridId: 730 }])

    const detected = await service.checkForGames(['cs2.exe'])
    expect(detected).toHaveLength(1)
    expect(detected[0].steamGridId).toBe(730)
  })

  it('activates economy when a game is detected', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' }
    ])

    await service.poll(MOCK_PROCS)

    expect(service.httpPost).toHaveBeenCalledWith(`${economyHost}/llama/stop`)
    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('gaming')
  })

  it('deactivates economy when game closes', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' }
    ])

    await service.poll(MOCK_PROCS)
    expect(service.getState().active).toBe(true)

    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(false)
    expect(service.httpPost).toHaveBeenLastCalledWith(`${economyHost}/llama/start`)
  })

  it('returns empty when gaming mode is disabled', async () => {
    service.setGamingModeEnabled(false)
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' }
    ])
    const detected = await service.checkForGames(MOCK_PROCS)
    expect(detected).toHaveLength(0)
  })

  it('parseProcessList parses Windows tasklist output', () => {
    const csv = [
      '"chrome.exe","123","Console","1","5.000 K"',
      '"FortniteClient-Win64-Shipping.exe","456","Console","1","10.000 K"'
    ].join('\n')
    const result = parseProcessList(csv)
    console.log('[TEST] parseProcessList result:', JSON.stringify(result))
    expect(result).toEqual(['chrome.exe', 'FortniteClient-Win64-Shipping.exe'])
  })

  it('activates economy when idle timeout reached (app open)', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(false)
    service.setGetSystemIdleTime(() => 301) // 5min + 1s of system idle
    service.setIsWindowMinimized(() => false)

    await service.poll(['chrome.exe'])

    expect(service.httpPost).toHaveBeenCalledWith(`${economyHost}/llama/stop`)
    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('idle')
  })

  it('activates economy faster when window is minimized', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(false)
    service.setGetSystemIdleTime(() => 90) // 1min30s
    service.setIsWindowMinimized(() => true)
    service.setWindowMinimizedSeconds(() => 61) // 1min+ para timeout minimizado

    await service.poll(['chrome.exe'])

    expect(service.httpPost).toHaveBeenCalledWith(`${economyHost}/llama/stop`)
    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('idle')
  })

  it('deactivates economy when user becomes active again', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(false)
    service.setGetSystemIdleTime(() => 310)
    service.setIsWindowMinimized(() => false)

    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(true)

    service.setGetSystemIdleTime(() => 1) // user just typed/moved mouse
    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(false)
    expect(service.httpPost).toHaveBeenLastCalledWith(`${economyHost}/llama/start`)
  })

  it('does not activate when idle timeout is set to 0 (disabled)', async () => {
    service.httpGet = vi.fn().mockResolvedValue({
      gaming_mode_enabled: false,
      idle_timeout_app_open: 0,
      idle_timeout_minimized: 0
    })
    service.setGetSystemIdleTime(() => 9999)
    service.setIsWindowMinimized(() => false)

    await service.poll(['chrome.exe'])

    expect(service.getState().active).toBe(false)
  })

  it('activates economy using system idle time when app is focused but user is AFK', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(false)
    // App is focused and not minimized, but user has been AFK for 5min+
    service.setGetSystemIdleTime(() => 301) // 5min + 1s of system idle
    service.setIsWindowMinimized(() => false)

    await service.poll(['chrome.exe'])

    expect(service.httpPost).toHaveBeenCalledWith(`${economyHost}/llama/stop`)
    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('idle')
  })

  it('gaming mode takes priority over idle', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(true)
    service.setGamingApps([
      { id: 1, name: 'Fortnite', executable: 'FortniteClient-Win64-Shipping.exe' }
    ])
    // Idle conditions are met, but gaming should win
    service.setGetSystemIdleTime(() => 9999)
    service.setIsWindowMinimized(() => false)

    await service.poll(['chrome.exe', 'FortniteClient-Win64-Shipping.exe'])

    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('gaming')
    expect(service.getState().detectedGames[0].name).toBe('Fortnite')
  })

  it('does not reactivate idle soneca after dismiss while user remains idle', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(false)
    service.setGetSystemIdleTime(() => 310)
    service.setIsWindowMinimized(() => false)

    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('idle')

    // User sends a message during soneca — dismisses and restarts llama
    await service.dismiss()
    expect(service.getState().active).toBe(false)

    // Next poll: user is still idle, but dismissal must prevent re-activation
    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(false)

    // Subsequent polls while still idle: still no re-activation
    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(false)
  })

  it('reactivates idle soneca after dismiss once user becomes active again', async () => {
    const economyHost = 'http://localhost:12345'
    service.setEconomyHost(economyHost)
    service.setGamingModeEnabled(false)
    service.setGetSystemIdleTime(() => 310)
    service.setIsWindowMinimized(() => false)

    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(true)

    await service.dismiss()
    expect(service.getState().active).toBe(false)

    // User becomes active (types/moves mouse) — dismissed flag should clear
    service.setGetSystemIdleTime(() => 1)
    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(false)

    // User goes idle again — soneca should now activate (dismissed was cleared)
    service.setGetSystemIdleTime(() => 310)
    await service.poll(['chrome.exe'])
    expect(service.getState().active).toBe(true)
    expect(service.getState().reason).toBe('idle')
  })
})
