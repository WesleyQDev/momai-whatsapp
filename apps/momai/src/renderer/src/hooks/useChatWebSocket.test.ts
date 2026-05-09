import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatWebSocket } from './useChatWebSocket'
import { WS_URL } from '../constants'

describe('useChatWebSocket', () => {
  let wsConstructorSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    wsConstructorSpy = vi.fn()
    class TestWS {
      onopen: (() => void) | null = null
      onclose: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: ((event: any) => void) | null = null
      readyState = 0
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      send = vi.fn()
      close = vi.fn()
      constructor(url: string) {
        ;(wsConstructorSpy as any)(url)
        setTimeout(() => {
          this.readyState = 1
          this.onopen?.()
        }, 0)
      }
    }
    vi.stubGlobal('WebSocket', TestWS)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('connects WebSocket on mount', () => {
    const handleWsMessage = vi.fn()
    renderHook(() => useChatWebSocket({ threadId: 'test-thread', handleWsMessage }))

    expect(wsConstructorSpy).toHaveBeenCalledTimes(1)
    expect(wsConstructorSpy).toHaveBeenCalledWith(WS_URL)
  })

  it('calls onMessage when message received', async () => {
    const handleWsMessage = vi.fn()
    const { result } = renderHook(() => useChatWebSocket({ threadId: 'test', handleWsMessage }))

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    act(() => {
      ;(result.current.wsRef.current!.onmessage as any)({
        data: JSON.stringify({ type: 'test', content: 'hello' })
      })
    })

    expect(handleWsMessage).toHaveBeenCalledWith({ type: 'test', content: 'hello' })
  })

  it('reconnects on disconnect', async () => {
    const handleWsMessage = vi.fn()
    const { result } = renderHook(() => useChatWebSocket({ threadId: 'test', handleWsMessage }))

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    act(() => {
      ;(result.current.wsRef.current!.onclose as any)()
    })

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(wsConstructorSpy).toHaveBeenCalledTimes(2)
  })

  it('cleans up on unmount', () => {
    const handleWsMessage = vi.fn()
    const { result, unmount } = renderHook(() =>
      useChatWebSocket({ threadId: 'test', handleWsMessage })
    )

    const closeSpy = result.current.wsRef.current!.close as ReturnType<typeof vi.fn>

    unmount()

    expect(closeSpy).toHaveBeenCalled()
  })

  it('handles multiple JSON messages', async () => {
    const handleWsMessage = vi.fn()
    const { result } = renderHook(() => useChatWebSocket({ threadId: 'test', handleWsMessage }))

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    const ws = result.current.wsRef.current!

    act(() => {
      ;(ws.onmessage as any)({ data: JSON.stringify({ type: 'msg1' }) })
      ;(ws.onmessage as any)({ data: JSON.stringify({ type: 'msg2' }) })
      ;(ws.onmessage as any)({ data: JSON.stringify({ type: 'msg3' }) })
    })

    expect(handleWsMessage).toHaveBeenCalledTimes(3)
    expect(handleWsMessage).toHaveBeenNthCalledWith(1, { type: 'msg1' })
    expect(handleWsMessage).toHaveBeenNthCalledWith(2, { type: 'msg2' })
    expect(handleWsMessage).toHaveBeenNthCalledWith(3, { type: 'msg3' })
  })
})
