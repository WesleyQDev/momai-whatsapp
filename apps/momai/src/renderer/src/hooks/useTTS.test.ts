import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockTtsService = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(),
  setEngine: vi.fn(),
  setVoice: vi.fn(),
  setSpeed: vi.fn(),
  setEnabled: vi.fn(),
  getVoices: vi.fn(),
  getEngines: vi.fn(),
  getEngineInfo: vi.fn(),
  getConfig: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}))

vi.mock('../services/ttsService', () => ({
  getTTSServiceRenderer: vi.fn(() => mockTtsService),
}))

import { useTTS } from './useTTS'

beforeEach(() => {
  vi.clearAllMocks()

  mockTtsService.getConfig.mockResolvedValue({
    success: true,
    data: { engine: 'kokoro', voice: 'default', speed: 1, enabled: true },
  })
  mockTtsService.getVoices.mockResolvedValue({ success: true, data: [] })
  mockTtsService.speak.mockResolvedValue({ success: true })
  mockTtsService.stop.mockResolvedValue({ success: true })
  mockTtsService.setEngine.mockResolvedValue({ success: true })
  mockTtsService.setVoice.mockResolvedValue({ success: true })
  mockTtsService.setSpeed.mockResolvedValue({ success: true })
  mockTtsService.setEnabled.mockResolvedValue({ success: true })
  mockTtsService.getEngines.mockResolvedValue({
    success: true,
    data: ['kokoro', 'edge-tts', 'say'],
  })
  mockTtsService.getEngineInfo.mockResolvedValue({
    success: true,
    data: { name: 'Kokoro', description: '', requiresPython: true },
  })
})

describe('useTTS', () => {
  it('speakText calls TTS service', async () => {
    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      const success = await result.current.speak('hello')
      expect(success).toBe(true)
    })

    expect(mockTtsService.speak).toHaveBeenCalledWith('hello', undefined)
  })

  it('stopSpeaking stops TTS', async () => {
    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      await result.current.stop()
    })

    expect(mockTtsService.stop).toHaveBeenCalled()
  })

  it('loads config on mount', async () => {
    const { result } = renderHook(() => useTTS())
    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })

    expect(mockTtsService.getConfig).toHaveBeenCalledTimes(1)
    expect(result.current.currentEngine).toBe('kokoro')
    expect(result.current.config).toEqual({
      engine: 'kokoro',
      voice: 'default',
      speed: 1,
      enabled: true,
    })
  })

  it('engine switching updates voice list', async () => {
    mockTtsService.getVoices.mockResolvedValue({
      success: true,
      data: [{ id: 'v1', name: 'English US', language: 'en' }],
    })

    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      await result.current.setEngine('edge-tts')
    })

    expect(mockTtsService.setEngine).toHaveBeenCalledWith('edge-tts')
    expect(mockTtsService.getVoices).toHaveBeenCalledWith('edge-tts')
    expect(result.current.currentEngine).toBe('edge-tts')
    expect(result.current.availableVoices).toEqual([
      { id: 'v1', name: 'English US', language: 'en' },
    ])
  })

  it('handles speak errors gracefully', async () => {
    mockTtsService.speak.mockResolvedValue({
      success: false,
      error: 'TTS failed',
    })

    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      const success = await result.current.speak('hello')
      expect(success).toBe(false)
    })

    expect(result.current.error).toBe('TTS failed')
  })

  it('handles speak rejection gracefully', async () => {
    mockTtsService.speak.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      const success = await result.current.speak('hello')
      expect(success).toBe(false)
    })

    expect(result.current.error).toBe('Error: network error')
  })

  it('registers event listeners on mount', async () => {
    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    expect(mockTtsService.on).toHaveBeenCalledWith(
      'speaking-start',
      expect.any(Function),
    )
    expect(mockTtsService.on).toHaveBeenCalledWith(
      'speaking-end',
      expect.any(Function),
    )
    expect(mockTtsService.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(mockTtsService.on).toHaveBeenCalledWith(
      'engine-changed',
      expect.any(Function),
    )
  })

  it('cleans up event listeners on unmount', async () => {
    const { result, unmount } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))
    unmount()

    expect(mockTtsService.off).toHaveBeenCalledWith(
      'speaking-start',
      expect.any(Function),
    )
    expect(mockTtsService.off).toHaveBeenCalledWith(
      'speaking-end',
      expect.any(Function),
    )
    expect(mockTtsService.off).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    )
    expect(mockTtsService.off).toHaveBeenCalledWith(
      'engine-changed',
      expect.any(Function),
    )
  })

  it('clearError resets error state', async () => {
    mockTtsService.speak.mockResolvedValue({
      success: false,
      error: 'some error',
    })

    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      await result.current.speak('hello')
    })
    expect(result.current.error).toBe('some error')

    act(() => {
      result.current.clearError()
    })
    expect(result.current.error).toBeNull()
  })

  it('refreshVoices loads voices for current engine', async () => {
    mockTtsService.getVoices.mockResolvedValue({
      success: true,
      data: [{ id: 'v1', name: 'Voice 1', language: 'en' }],
    })

    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))
    mockTtsService.getVoices.mockClear()

    await act(async () => {
      await result.current.refreshVoices()
    })

    expect(mockTtsService.getVoices).toHaveBeenCalledWith('kokoro')
    expect(result.current.availableVoices).toEqual([
      { id: 'v1', name: 'Voice 1', language: 'en' },
    ])
  })

  it('setVoice updates config', async () => {
    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      await result.current.setVoice('pt-BR')
    })

    expect(mockTtsService.setVoice).toHaveBeenCalledWith('pt-BR')
    expect(result.current.config?.voice).toBe('pt-BR')
  })

  it('setSpeed updates config', async () => {
    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      await result.current.setSpeed(1.5)
    })

    expect(mockTtsService.setSpeed).toHaveBeenCalledWith(1.5)
    expect(result.current.config?.speed).toBe(1.5)
  })

  it('setEnabled updates config', async () => {
    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      await result.current.setEnabled(false)
    })

    expect(mockTtsService.setEnabled).toHaveBeenCalledWith(false)
    expect(result.current.config?.enabled).toBe(false)
  })

  it('getEngines returns engine list', async () => {
    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    let engines: string[] = []
    await act(async () => {
      engines = await result.current.getEngines()
    })

    expect(engines).toEqual(['kokoro', 'edge-tts', 'say'])
  })

  it('getEngineInfo returns engine info', async () => {
    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    let info: any = null
    await act(async () => {
      info = await result.current.getEngineInfo('kokoro')
    })

    expect(info).toEqual({
      name: 'Kokoro',
      description: '',
      requiresPython: true,
    })
  })

  it('handles engine-changed event by loading voices', async () => {
    let engineChangedCb: Function = () => {}
    mockTtsService.on.mockImplementation(
      (_event: string, cb: Function) => {
        if (_event === 'engine-changed') engineChangedCb = cb
      },
    )

    mockTtsService.getVoices.mockResolvedValue({
      success: true,
      data: [{ id: 'v2', name: 'Edge Voice', language: 'en' }],
    })

    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))
    mockTtsService.getVoices.mockClear()

    act(() => {
      engineChangedCb('edge-tts')
    })

    await waitFor(() => {
      expect(mockTtsService.getVoices).toHaveBeenCalledWith('edge-tts')
    })
    await waitFor(() => {
      expect(result.current.availableVoices).toEqual([
        { id: 'v2', name: 'Edge Voice', language: 'en' },
      ])
    })
  })

  it('handles getConfig failure on mount', async () => {
    mockTtsService.getConfig.mockResolvedValue({
      success: false,
      error: 'config not found',
    })

    const { result } = renderHook(() => useTTS())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    expect(result.current.config).toBeNull()
    expect(result.current.currentEngine).toBe('kokoro')
  })
})
