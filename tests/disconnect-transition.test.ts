import { describe, it, expect } from 'vitest'
import {
  resolveStatsTransition,
  resolveSocketTransition,
  shouldShowQrPage
} from '../src/services/disconnectTransition'

describe('explicit disconnect goes straight to QR', () => {
  it('forces QR state from stats even when the server still reports saved credentials', () => {
    const result = resolveStatsTransition({
      explicitDisconnect: true,
      isConnected: false,
      serverHasCredentials: true,
      localHasCredentials: true,
      recentlyConnected: false,
      previousStatus: 'connected'
    })

    expect(result.nextStatus).toBe('disconnected')
    expect(result.showQrFallback).toBe(true)
    expect(result.pairingActive).toBe(true)
    expect(result.hasCredentials).toBe(false)
    expect(result.startGraceTimer).toBe(false)
    expect(result.restoreCounts).toBe(false)
  })

  it('forces QR state from stats even when previous state was reconnecting', () => {
    const result = resolveStatsTransition({
      explicitDisconnect: true,
      isConnected: false,
      serverHasCredentials: true,
      localHasCredentials: false,
      recentlyConnected: false,
      previousStatus: 'reconnecting'
    })

    expect(result.nextStatus).toBe('disconnected')
    expect(result.startGraceTimer).toBe(false)
    expect(result.restoreCounts).toBe(false)
  })

  it('keeps the reconnecting grace path only for unexpected drops', () => {
    const result = resolveStatsTransition({
      explicitDisconnect: false,
      isConnected: false,
      serverHasCredentials: true,
      localHasCredentials: true,
      recentlyConnected: false,
      previousStatus: 'connected'
    })

    expect(result.nextStatus).toBe('reconnecting')
    expect(result.startGraceTimer).toBe(true)
  })

  it('ignores late socket disconnected/reconnecting/logged_out events after explicit disconnect', () => {
    for (const eventStatus of ['disconnected', 'reconnecting', 'logged_out'] as const) {
      const result = resolveSocketTransition({ explicitDisconnect: true, eventStatus })
      expect(result?.nextStatus).toBe('disconnected')
      expect(result?.showQrFallback).toBe(true)
      expect(result?.pairingActive).toBe(true)
      expect(result?.startGraceTimer).toBe(false)
    }
  })

  it('lets a real reconnect through after explicit disconnect', () => {
    expect(
      resolveSocketTransition({ explicitDisconnect: true, eventStatus: 'connected' })
    ).toBeNull()
    expect(
      resolveStatsTransition({
        explicitDisconnect: true,
        isConnected: true,
        serverHasCredentials: true,
        localHasCredentials: false,
        recentlyConnected: false,
        previousStatus: 'disconnected'
      }).nextStatus
    ).toBe('connected')
  })

  it('shows the QR page immediately after explicit disconnect', () => {
    expect(
      shouldShowQrPage({
        connected: false,
        hasCredentials: false,
        pairingActive: true,
        showQrFallback: true,
        explicitDisconnect: true
      })
    ).toBe(true)
  })
})
