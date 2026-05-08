import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatState } from './useChatState'
import { Message } from '../services/api'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useChatState', () => {
  it('initializes with default state', () => {
    const { result } = renderHook(() => useChatState())

    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isCallMode).toBe(false)
    expect(result.current.isHistoryLoaded).toBe(false)
    expect(result.current.speakingMessageId).toBeNull()
    expect(result.current.voiceStatus).toBe('idle')
    expect(result.current.voiceEngineLoading).toBeNull()
    expect(result.current.callHistory).toEqual([])
    expect(result.current.graphState).toEqual({
      view: null,
      content: '',
      options: [],
      optionsMap: {},
      bypass_wake_word: false
    })
    expect(result.current.animationFinished).toBe(false)
  })

  it('threadId initializes with a session-like string', () => {
    const { result } = renderHook(() => useChatState())
    expect(result.current.threadId).toMatch(/^sessao_\d{13,}$/)
  })

  it('setMessages replaces messages', () => {
    const { result } = renderHook(() => useChatState())
    const msgs: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' }
    ]

    act(() => {
      result.current.setMessages(msgs)
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'hello' })
    expect(result.current.messages[1]).toEqual({ role: 'assistant', content: 'hi there' })
  })

  it('adds a message via setMessages callback', () => {
    const { result } = renderHook(() => useChatState())
    const msg: Message = { role: 'user', content: 'first' }

    act(() => {
      result.current.setMessages([msg])
    })

    act(() => {
      result.current.setMessages((prev) => [...prev, { role: 'assistant', content: 'response' }])
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].content).toBe('first')
    expect(result.current.messages[1].content).toBe('response')
  })

  it('clearMessages empties messages', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.setMessages([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' }
      ])
    })

    act(() => {
      result.current.setMessages([])
    })

    expect(result.current.messages).toEqual([])
  })

  it('setLoading changes loading state', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.setIsLoading(true)
    })
    expect(result.current.isLoading).toBe(true)

    act(() => {
      result.current.setIsLoading(false)
    })
    expect(result.current.isLoading).toBe(false)
  })

  it('toggles isCallMode', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.setIsCallMode(true)
    })
    expect(result.current.isCallMode).toBe(true)

    act(() => {
      result.current.setIsCallMode(false)
    })
    expect(result.current.isCallMode).toBe(false)
  })

  it('toggles isHistoryLoaded', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.setIsHistoryLoaded(true)
    })
    expect(result.current.isHistoryLoaded).toBe(true)
  })

  it('updates speakingMessageId', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.setSpeakingMessageId('msg-123')
    })
    expect(result.current.speakingMessageId).toBe('msg-123')
  })

  it('updates voiceStatus', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.setVoiceStatus('listening')
    })
    expect(result.current.voiceStatus).toBe('listening')

    act(() => {
      result.current.setVoiceStatus('processing')
    })
    expect(result.current.voiceStatus).toBe('processing')

    act(() => {
      result.current.setVoiceStatus('idle')
    })
    expect(result.current.voiceStatus).toBe('idle')
  })

  it('updates voiceEngineLoading', () => {
    const { result } = renderHook(() => useChatState())
    const state = { loading: true, pendingAutoTts: false, message: 'loading engine' }

    act(() => {
      result.current.setVoiceEngineLoading(state)
    })
    expect(result.current.voiceEngineLoading).toEqual(state)

    act(() => {
      result.current.setVoiceEngineLoading(null)
    })
    expect(result.current.voiceEngineLoading).toBeNull()
  })

  it('updates callHistory', () => {
    const { result } = renderHook(() => useChatState())
    const entry = { id: '1', role: 'user' as const, content: 'hello' }

    act(() => {
      result.current.setCallHistory([entry])
    })
    expect(result.current.callHistory).toHaveLength(1)
    expect(result.current.callHistory[0]).toEqual(entry)
  })

  it('updates graphState', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.setGraphState({
        view: 'center',
        content: 'test',
        options: ['opt1'],
        optionsMap: { opt1: 'Option 1' },
        bypass_wake_word: true
      })
    })

    expect(result.current.graphState.view).toBe('center')
    expect(result.current.graphState.content).toBe('test')
    expect(result.current.graphState.options).toEqual(['opt1'])
    expect(result.current.graphState.bypass_wake_word).toBe(true)
  })

  it('updates animationFinished', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.setAnimationFinished(true)
    })
    expect(result.current.animationFinished).toBe(true)
  })

  it('refs are stable across renders', () => {
    const { result, rerender } = renderHook(() => useChatState())

    const msgRef = result.current.messagesRef
    const threadRef = result.current.currentThreadRef
    const callModeRef = result.current.isCallModeRef
    const graphOptsRef = result.current.currentGraphOptionsRef
    const graphOpenRef = result.current.isGraphOpenRef

    rerender()

    expect(result.current.messagesRef).toBe(msgRef)
    expect(result.current.currentThreadRef).toBe(threadRef)
    expect(result.current.isCallModeRef).toBe(callModeRef)
    expect(result.current.currentGraphOptionsRef).toBe(graphOptsRef)
    expect(result.current.isGraphOpenRef).toBe(graphOpenRef)
  })
})
