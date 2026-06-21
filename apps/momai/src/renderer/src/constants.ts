// API URLs come from the main process via preload (see preload/index.ts).
// The variant config (dev=8050, nsis=8100, etc.) determines the port so
// multiple build variants can run on the same machine without conflicts.
// Falls back to the legacy 8000 port if preload didn't inject the values
// (e.g., running the renderer in isolation for tests).
const _api = (typeof window !== 'undefined' && (window as any).api) || {}
const API_URL: string = _api.getApiBaseUrl?.() ?? 'http://127.0.0.1:8000'
const WS_URL: string = _api.getWsBaseUrl?.() ?? 'ws://127.0.0.1:8000/ws'

// Legacy exports kept for backwards compatibility.
export const API_HOST = '127.0.0.1'
export const API_PORT = API_URL ? Number(new URL(API_URL).port) || 8000 : 8000

export { API_URL, WS_URL }
