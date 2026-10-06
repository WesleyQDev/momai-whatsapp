export type DisconnectConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

export interface StatsTransitionInput {
  explicitDisconnect: boolean
  isConnected: boolean
  serverHasCredentials: boolean
  /** Local UI cache (localStorage/state); never overrides the server flag. */
  localHasCredentials: boolean
  recentlyConnected: boolean
  previousStatus: DisconnectConnectionStatus
}

export interface StatsTransitionResult {
  nextStatus: DisconnectConnectionStatus
  showQrFallback: boolean
  pairingActive: boolean
  hasCredentials: boolean
  startGraceTimer: boolean
  restoreCounts: boolean
}

export function resolveStatsTransition(input: StatsTransitionInput): StatsTransitionResult {
  const {
    explicitDisconnect,
    isConnected,
    serverHasCredentials,
    recentlyConnected,
    previousStatus
  } = input

  if (isConnected) {
    return {
      nextStatus: 'connected',
      showQrFallback: false,
      pairingActive: false,
      hasCredentials: true,
      startGraceTimer: false,
      restoreCounts: true
    }
  }

  if (explicitDisconnect) {
    return {
      nextStatus: 'disconnected',
      showQrFallback: true,
      pairingActive: true,
      hasCredentials: false,
      startGraceTimer: false,
      restoreCounts: false
    }
  }

  if (recentlyConnected) {
    return {
      nextStatus: previousStatus,
      showQrFallback: false,
      pairingActive: false,
      hasCredentials: true,
      startGraceTimer: false,
      restoreCounts: true
    }
  }

  // The server is the source of truth for session validity. A local cache hit
  // (e.g. stale localStorage after a phone-side logout) must never keep a dead
  // session inside the reconnect grace window: without server credentials the
  // only valid next step is pairing again.
  if (serverHasCredentials) {
    return {
      nextStatus: previousStatus === 'connected' ? 'reconnecting' : previousStatus,
      showQrFallback: false,
      pairingActive: false,
      hasCredentials: true,
      startGraceTimer: true,
      restoreCounts: true
    }
  }

  return {
    nextStatus: 'disconnected',
    showQrFallback: true,
    pairingActive: false,
    hasCredentials: false,
    startGraceTimer: false,
    restoreCounts: true
  }
}

export type SocketEventStatus = 'connected' | 'reconnecting' | 'disconnected' | 'logged_out' | 'other'

export interface SocketTransitionInput {
  explicitDisconnect: boolean
  eventStatus: SocketEventStatus
}

export interface SocketTransitionResult {
  nextStatus: DisconnectConnectionStatus
  showQrFallback: boolean
  pairingActive: boolean
  startGraceTimer: boolean
}

export function resolveSocketTransition(input: SocketTransitionInput): SocketTransitionResult | null {
  const { explicitDisconnect, eventStatus } = input

  if (eventStatus === 'connected') {
    return null
  }

  if (explicitDisconnect) {
    return {
      nextStatus: 'disconnected',
      showQrFallback: true,
      pairingActive: true,
      startGraceTimer: false
    }
  }

  return null
}

export function shouldShowQrPage(input: {
  connected: boolean
  hasCredentials: boolean
  pairingActive: boolean
  showQrFallback: boolean
  explicitDisconnect: boolean
}): boolean {
  if (input.explicitDisconnect) return true
  if (input.connected) return false
  if (input.hasCredentials && !input.pairingActive && !input.showQrFallback) return false
  return true
}
