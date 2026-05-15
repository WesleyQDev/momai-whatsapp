import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStatus } from './useStatus'

const { mockFetchStatus, mockFetchInitStatus } = vi.hoisted(() => ({
  mockFetchStatus: vi.fn(),
  mockFetchInitStatus: vi.fn().mockResolvedValue({
    stage: 'loading',
    message: 'Loading...',
    progress: 30
  })
}))

vi.mock('../services/api', () => ({
  fetchStatus: mockFetchStatus,
  fetchInitStatus: mockFetchInitStatus,
  updateMode: vi.fn()
}))

describe('useStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initial state shows connecting', () => {
    const { result } = renderHook(() => useStatus())

    expect(result.current.isOnline).toBe(false)
    expect(result.current.isBooting).toBe(true)
    expect(result.current.initProgress).toBe(0)
    expect(result.current.isStalled).toBe(false)
    expect(result.current.isReady).toBe(false)
    expect(result.current.localMode).toBe('waiting')
    expect(result.current.initMessage).toBe('Iniciando...')
  })

  it('transitions to connected on successful poll', async () => {
    mockFetchStatus.mockResolvedValue({
      status: 'ok',
      mode: 'default',
      brain_ready: true,
      is_loading: false,
      setup: { local_installed: true, installed_version: '1.0', latest_version: '1.0' },
      ai_tier: null
    })

    const { result } = renderHook(() => useStatus())

    // Flush initial checkStatus resolve + state update
    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    // Flush effect re-run with backendOnline=true (second checkStatus)
    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    expect(result.current.isOnline).toBe(true)
    expect(result.current.isBooting).toBe(false)
    expect(result.current.initProgress).toBe(100)
    expect(result.current.isReady).toBe(true)
  })

  it('sets stalled state after watchdog timeout', async () => {
    mockFetchStatus.mockResolvedValue({
      status: 'ok',
      mode: 'default',
      brain_ready: false,
      is_loading: true,
      setup: { local_installed: true },
      ai_tier: null
    })

    const { result } = renderHook(() => useStatus())

    // Let initial checkStatus resolve (backendOnline becomes true, still booting)
    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    // Advance to exactly the stall threshold (STALLED_TIMEOUT_MS = 20000).
    // Watchdog fires every 5000ms; at 120000ms timeSinceLastProgress >= 120000.
    // Stop at 120000ms (not 121000ms) to avoid the init polling (1500ms interval)
    // from overwriting the stalled message at 121000ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000)
    })

    expect(result.current.isStalled).toBe(true)
    expect(result.current.initMessage).toBe('Isso está demorando mais que o normal...')
  })

  it('cleans up timers on unmount', async () => {
    mockFetchStatus.mockResolvedValue({
      status: 'ok',
      mode: 'default',
      brain_ready: true,
      is_loading: false,
      setup: { local_installed: true, installed_version: '1.0', latest_version: '1.0' },
      ai_tier: null
    })

    const { unmount } = renderHook(() => useStatus())

    // Let state settle with backend online
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    const callsBefore = mockFetchStatus.mock.calls.length

    unmount()

    // Advance time — no interval should fire after unmount
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })

    expect(mockFetchStatus.mock.calls.length).toBe(callsBefore)
  })

  it('tracks init progress via custom event', () => {
    const { result } = renderHook(() => useStatus())

    act(() => {
      window.dispatchEvent(
        new CustomEvent('momai_init_progress', {
          detail: { message: 'Downloading model (50%)', progress: 50 }
        })
      )
    })

    expect(result.current.initProgress).toBe(50)
    expect(result.current.initMessage).toBe('Baixando modelo (50%)')

    act(() => {
      window.dispatchEvent(
        new CustomEvent('momai_init_progress', {
          detail: { message: 'System ready.', progress: 100 }
        })
      )
    })

    expect(result.current.initProgress).toBe(100)
    expect(result.current.initMessage).toBe('Sistema pronto.')
  })

  it('handles connection error', async () => {
    mockFetchStatus.mockRejectedValue(new Error('Connection refused'))

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    expect(result.current.isOnline).toBe(false)
    expect(result.current.statusInfo).toBeNull()
  })

  it('recovers after error via IPC backendOnline signal', async () => {
    mockFetchStatus.mockRejectedValueOnce(new Error('Connection refused'))

    const { result } = renderHook(() => useStatus())

    // First checkStatus fails
    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    expect(result.current.isOnline).toBe(false)

    // Prepare success for recovery
    mockFetchStatus.mockResolvedValue({
      status: 'ok',
      mode: 'default',
      brain_ready: true,
      is_loading: false,
      setup: { local_installed: true, installed_version: '1.0', latest_version: '1.0' },
      ai_tier: null
    })

    // Trigger the callback that was registered with window.api.onBackendOnline
    const onlineCb = (window as any).api.onBackendOnline.mock.calls[0][0]
    act(() => {
      onlineCb()
    })

    // State update triggers polling effect → checkStatus succeeds
    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    expect(result.current.isOnline).toBe(true)
    expect(result.current.isBooting).toBe(false)
    expect(result.current.initProgress).toBe(100)
  })
})
