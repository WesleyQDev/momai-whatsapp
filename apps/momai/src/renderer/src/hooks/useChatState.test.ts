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

  it('dispatches SET_MESSAGES to replace messages', () => {
    const { result } = renderHook(() => useChatState())
    const msgs: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' }
    ]

    act(() => {
      result.current.dispatch({ type: 'SET_MESSAGES', messages: msgs })
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'hello' })
    expect(result.current.messages[1]).toEqual({ role: 'assistant', content: 'hi there' })
  })

  it('dispatches APPEND_MESSAGE to add a message', () => {
    const { result } = renderHook(() => useChatState())
    const msg: Message = { role: 'user', content: 'first' }

    act(() => {
      result.current.dispatch({ type: 'APPEND_MESSAGE', message: msg })
    })

    act(() => {
      result.current.dispatch({
        type: 'UPDATE_MESSAGES',
        updater: (prev) => [...prev, { role: 'assistant', content: 'response' }]
      })
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].content).toBe('first')
    expect(result.current.messages[1].content).toBe('response')
  })

  it('dispatches SET_MESSAGES with empty array to clear', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.dispatch({
        type: 'SET_MESSAGES',
        messages: [
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'b' }
        ]
      })
    })

    act(() => {
      result.current.dispatch({ type: 'SET_MESSAGES', messages: [] })
    })

    expect(result.current.messages).toEqual([])
  })

  it('dispatches SET_LOADING changes loading state', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.dispatch({ type: 'SET_LOADING', isLoading: true })
    })
    expect(result.current.isLoading).toBe(true)

    act(() => {
      result.current.dispatch({ type: 'SET_LOADING', isLoading: false })
    })
    expect(result.current.isLoading).toBe(false)
  })

  it('dispatches SET_CALL_MODE toggles isCallMode', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.dispatch({ type: 'SET_CALL_MODE', enabled: true })
    })
    expect(result.current.isCallMode).toBe(true)

    act(() => {
      result.current.dispatch({ type: 'SET_CALL_MODE', enabled: false })
    })
    expect(result.current.isCallMode).toBe(false)
  })

  it('dispatches SET_HISTORY_LOADED toggles isHistoryLoaded', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.dispatch({ type: 'SET_HISTORY_LOADED', loaded: true })
    })
    expect(result.current.isHistoryLoaded).toBe(true)
  })

  it('dispatches SET_SPEAKING updates speakingMessageId', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.dispatch({ type: 'SET_SPEAKING', messageId: 'msg-123' })
    })
    expect(result.current.speakingMessageId).toBe('msg-123')
  })

  it('dispatches SET_VOICE_STATUS updates voiceStatus', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.dispatch({ type: 'SET_VOICE_STATUS', status: 'listening' })
    })
    expect(result.current.voiceStatus).toBe('listening')

    act(() => {
      result.current.dispatch({ type: 'SET_VOICE_STATUS', status: 'processing' })
    })
    expect(result.current.voiceStatus).toBe('processing')

    act(() => {
      result.current.dispatch({ type: 'SET_VOICE_STATUS', status: 'idle' })
    })
    expect(result.current.voiceStatus).toBe('idle')
  })

  it('dispatches SET_VOICE_ENGINE_LOADING updates voiceEngineLoading', () => {
    const { result } = renderHook(() => useChatState())
    const state = { loading: true, pendingAutoTts: false, message: 'loading engine' }

    act(() => {
      result.current.dispatch({ type: 'SET_VOICE_ENGINE_LOADING', data: state })
    })
    expect(result.current.voiceEngineLoading).toEqual(state)

    act(() => {
      result.current.dispatch({ type: 'SET_VOICE_ENGINE_LOADING', data: null })
    })
    expect(result.current.voiceEngineLoading).toBeNull()
  })

  it('dispatches SET_CALL_HISTORY updates callHistory', () => {
    const { result } = renderHook(() => useChatState())
    const entry = { id: '1', role: 'user' as const, content: 'hello' }

    act(() => {
      result.current.dispatch({ type: 'SET_CALL_HISTORY', updater: () => [entry] })
    })
    expect(result.current.callHistory).toHaveLength(1)
    expect(result.current.callHistory[0]).toEqual(entry)
  })

  it('dispatches SET_GRAPH_STATE updates graphState', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.dispatch({
        type: 'SET_GRAPH_STATE',
        state: {
          view: 'center',
          content: 'test',
          options: ['opt1'],
          optionsMap: { opt1: 'Option 1' },
          bypass_wake_word: true
        }
      })
    })

    expect(result.current.graphState.view).toBe('center')
    expect(result.current.graphState.content).toBe('test')
    expect(result.current.graphState.options).toEqual(['opt1'])
    expect(result.current.graphState.bypass_wake_word).toBe(true)
  })

  it('dispatches SET_ANIMATION_FINISHED updates animationFinished', () => {
    const { result } = renderHook(() => useChatState())

    act(() => {
      result.current.dispatch({ type: 'SET_ANIMATION_FINISHED', finished: true })
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
