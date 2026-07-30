import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatHandlers } from './useChatHandlers'
import { Message } from '../services/api'

const mockTTS = { stopCurrentAudio: vi.fn(), stop: vi.fn() }
vi.mock('../services/ttsService', () => ({
  getTTSServiceRenderer: () => mockTTS
}))

function setupHook(initialMessages: Message[] = []) {
  let messages = [...initialMessages]

  const messagesRef = { current: messages }
  const toolTraceRef = {
    current: {
      activeMsgId: null as string | null,
      byToolId: {} as Record<string, { msgId: string; stepIndex: number }>
    }
  }
  const isCallModeRef = { current: false }
  const isGraphOpenRef = { current: false }
  const currentGraphOptionsRef = { current: [] as string[] }

  const dispatch = vi.fn((action: any) => {
    if (action.type === 'UPDATE_MESSAGES' && typeof action.updater === 'function') {
      messages = action.updater(messages)
      messagesRef.current = messages
    } else if (action.type === 'SET_MESSAGES') {
      messages = action.messages
      messagesRef.current = messages
    }
  })

  const handleGraphOption = vi.fn()

  const { result } = renderHook(() =>
    useChatHandlers({
      messagesRef,
      dispatch,
      toolTraceRef,
      isCallModeRef,
      isGraphOpenRef,
      currentGraphOptionsRef,
      handleGraphOption
    })
  )

  return {
    handleWsMessage: result.current.handleWsMessage,
    getMessages: () => messages,
    dispatch,
    messagesRef,
    toolTraceRef,
    isCallModeRef,
    isGraphOpenRef,
    currentGraphOptionsRef,
    handleGraphOption
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useChatHandlers', () => {
  describe('voice messages', () => {
    it('handles tts_start with activeMsgId', () => {
      const hook = setupHook()
      hook.toolTraceRef.current.activeMsgId = 'active-trace-id'

      act(() => {
        hook.handleWsMessage({ type: 'tts_start' })
      })

      expect(hook.dispatch).toHaveBeenCalledWith({
        type: 'SET_SPEAKING',
        messageId: 'active-trace-id'
      })
    })

    it('handles tts_start without activeMsgId - uses last assistant id', () => {
      const hook = setupHook([
        { role: 'user', content: 'hello' },
        { id: 'assistant-1', role: 'assistant', content: 'hi' }
      ])

      act(() => {
        hook.handleWsMessage({ type: 'tts_start' })
      })

      expect(hook.dispatch).toHaveBeenCalledWith({ type: 'SET_SPEAKING', messageId: 'assistant-1' })
    })

    it('handles tts_stop', () => {
      const hook = setupHook()
      act(() => {
        hook.handleWsMessage({ type: 'tts_stop' })
      })
      expect(hook.dispatch).toHaveBeenCalledWith({ type: 'SET_SPEAKING', messageId: null })
    })

    it('handles voice_status', () => {
      const hook = setupHook()
      act(() => {
        hook.handleWsMessage({ type: 'voice_status', status: 'listening' })
      })
      expect(hook.dispatch).toHaveBeenCalledWith({ type: 'SET_VOICE_STATUS', status: 'listening' })
    })

    it('handles voice_engine_loading', () => {
      vi.useFakeTimers()
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({
          type: 'voice_engine_loading',
          data: { loading: true, pending_auto_tts: true, message: 'carregando...' }
        })
      })

      expect(hook.dispatch).toHaveBeenCalledWith({
        type: 'SET_VOICE_ENGINE_LOADING',
        data: {
          loading: true,
          pendingAutoTts: true,
          message: 'carregando...'
        }
      })

      vi.useRealTimers()
    })

    it('handles voice_engine_loading completes - clears after timeout', () => {
      vi.useFakeTimers()
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({
          type: 'voice_engine_loading',
          data: { loading: false, pending_auto_tts: false, message: '' }
        })
      })

      expect(hook.dispatch).toHaveBeenNthCalledWith(1, {
        type: 'SET_VOICE_ENGINE_LOADING',
        data: {
          loading: false,
          pendingAutoTts: false,
          message:
            'Motor de voz carregando... vou reproduzir automaticamente quando estiver pronto.'
        }
      })

      act(() => {
        vi.advanceTimersByTime(3500)
      })

      expect(hook.dispatch).toHaveBeenNthCalledWith(2, {
        type: 'SET_VOICE_ENGINE_LOADING',
        data: null
      })

      vi.useRealTimers()
    })
  })

  describe('tool trace messages', () => {
    it('handles tool_start and tool_result full cycle', () => {
      const hook = setupHook([
        { role: 'user', content: 'search web' },
        { id: 'msg-1', role: 'assistant', content: '...' }
      ])

      act(() => {
        hook.handleWsMessage({
          type: 'tool_start',
          data: { id: 'tool-1', name: 'web_search', args: { query: 'test query' } }
        })
      })

      let messages = hook.getMessages()
      expect(messages).toHaveLength(2)
      expect(messages[1].content).toContain('TOOL_TRACE::')
      expect(messages[1].content).toContain('"status":"running"')
      expect(hook.toolTraceRef.current.activeMsgId).toBe('msg-1')
      expect(hook.toolTraceRef.current.byToolId['tool-1']).toBeDefined()

      act(() => {
        hook.handleWsMessage({
          type: 'tool_result',
          data: { id: 'tool-1', name: 'web_search', status: 'done', result: 'search results here' }
        })
      })

      messages = hook.getMessages()
      expect(messages[1].content).toContain('"status":"done"')
      expect(messages[1].content).toContain('search results here')
    })

    it('handles tool_result with error status', () => {
      const hook = setupHook([
        { role: 'user', content: 'do something' },
        { id: 'msg-1', role: 'assistant', content: '...' }
      ])

      act(() => {
        hook.handleWsMessage({
          type: 'tool_start',
          data: { id: 'tool-err', name: 'error_tool', args: {} }
        })
      })

      act(() => {
        hook.handleWsMessage({
          type: 'tool_result',
          data: {
            id: 'tool-err',
            status: 'error',
            result: { status: 'error', error: { message: 'Failed' } }
          }
        })
      })

      const messages = hook.getMessages()
      expect(messages[1].content).toContain('"status":"error"')
      expect(messages[1].content).toContain('Failed')
    })

    it('handles tool_start when no assistant exists - creates placeholder', () => {
      const hook = setupHook([{ role: 'user', content: 'hello' }])

      act(() => {
        hook.handleWsMessage({
          type: 'tool_start',
          data: { id: 't1', name: 'test_tool', args: {} }
        })
      })

      const messages = hook.getMessages()
      expect(messages).toHaveLength(2)
      expect(messages[1].role).toBe('assistant')
      expect(messages[1].content).toContain('TOOL_TRACE::')
    })
  })

  describe('assistant messages - token streaming', () => {
    it('accumulates tokens into the last assistant message', () => {
      const hook = setupHook([
        { role: 'user', content: 'hello' },
        { id: 'a1', role: 'assistant', content: '...' }
      ])

      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { token: 'Hello' } })
      })
      expect(hook.getMessages()[1].content).toBe('Hello')

      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { token: ' world' } })
      })
      expect(hook.getMessages()[1].content).toBe('Hello world')

      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { token: '!' } })
      })
      expect(hook.getMessages()[1].content).toBe('Hello world!')
    })

    it('accumulates tokens into tool trace text part', () => {
      const hook = setupHook([
        { role: 'user', content: 'search' },
        { id: 'a1', role: 'assistant', content: '...' }
      ])

      act(() => {
        hook.handleWsMessage({
          type: 'tool_start',
          data: { id: 't1', name: 'search', args: { query: 'x' } }
        })
      })

      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { token: 'Found: ' } })
      })
      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { token: 'result A' } })
      })

      const messages = hook.getMessages()
      expect(messages[1].content).toContain('TOOL_TEXT::')
      expect(messages[1].content).toContain('Found: result A')
    })
  })

  describe('assistant messages - metadata', () => {
    it('handles assistant done - sets isLoading false', () => {
      const hook = setupHook()
      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { done: true } })
      })
      expect(hook.dispatch).toHaveBeenCalledWith({ type: 'SET_LOADING', isLoading: false })
    })

    it('handles assistant with active_skill', () => {
      const hook = setupHook([
        { role: 'user', content: 'hello' },
        { id: 'a1', role: 'assistant', content: '...' }
      ])

      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { active_skill: 'web_search' } })
      })
      expect(hook.getMessages()[1].activeSkill).toBe('web_search')
    })

    it('handles assistant with structured_response', () => {
      const hook = setupHook([
        { role: 'user', content: 'weather' },
        { id: 'a1', role: 'assistant', content: '...' }
      ])

      act(() => {
        hook.handleWsMessage({
          type: 'assistant',
          data: { structured_response: { type: 'weather', data: { temp: 25, condition: 'sunny' } } }
        })
      })

      expect(hook.getMessages()[1].structuredResponses).toEqual([
        {
          type: 'weather',
          data: { temp: 25, condition: 'sunny' }
        }
      ])
    })

    it('handles assistant with tool_steps', () => {
      const hook = setupHook([
        { role: 'user', content: 'hello' },
        { id: 'a1', role: 'assistant', content: '...' }
      ])

      act(() => {
        hook.handleWsMessage({
          type: 'assistant',
          data: { tool_steps: [{ name: 'step1' }, { name: 'step2' }] }
        })
      })

      expect(hook.getMessages()[1].toolSteps).toEqual([{ name: 'step1' }, { name: 'step2' }])
    })

    it('handles assistant with status thinking - adds activity', () => {
      const hook = setupHook([
        { role: 'user', content: 'hello' },
        { id: 'a1', role: 'assistant', content: '...' }
      ])

      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { status: 'thinking' } })
      })
      expect(hook.getMessages()[1].activities).toContain('Analisando...')
    })

    it('deduplicates status activities', () => {
      const hook = setupHook([
        { role: 'user', content: 'hello' },
        { id: 'a1', role: 'assistant', content: '...' }
      ])

      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { status: 'thinking' } })
      })
      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { status: 'thinking' } })
      })

      expect(hook.getMessages()[1].activities).toHaveLength(1)
    })
  })

  describe('user messages', () => {
    it('adds user message and assistant placeholder', () => {
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({ type: 'user', content: 'hello world' })
      })

      const messages = hook.getMessages()
      expect(messages).toHaveLength(2)
      expect(messages[0]).toEqual({ role: 'user', content: 'hello world' })
      expect(messages[1].role).toBe('assistant')
      expect(messages[1].content).toBe('...')
      expect(hook.dispatch).toHaveBeenCalledWith({ type: 'SET_LOADING', isLoading: true })
    })

    it('sets activeMsgId for subsequent token streaming', () => {
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({ type: 'user', content: 'hi' })
      })
      const msgId = hook.toolTraceRef.current.activeMsgId
      expect(msgId).toBeTruthy()
      expect(typeof msgId).toBe('string')

      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { token: 'Hello back' } })
      })

      const messages = hook.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      expect(assistantMsg?.content).toContain('Hello back')
    })

    it('updates call history in call mode', () => {
      const hook = setupHook()
      hook.isCallModeRef.current = true

      act(() => {
        hook.handleWsMessage({ type: 'user', content: 'hello in call' })
      })

      expect(hook.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SET_CALL_HISTORY' })
      )
    })
  })

  describe('graph messages', () => {
    it('handles graph_open with center view', () => {
      const hook = setupHook([
        { role: 'user', content: 'hello' },
        { id: 'a1', role: 'assistant', content: 'thinking...' }
      ])

      act(() => {
        hook.handleWsMessage({
          type: 'graph_open',
          data: {
            view: 'center',
            content: 'graph content',
            options: ['opt1'],
            options_map: { opt1: 'Option 1' },
            ui_schema: null
          }
        })
      })

      expect(hook.dispatch).toHaveBeenCalledWith({
        type: 'SET_GRAPH_STATE',
        state: {
          view: 'center',
          content: 'graph content',
          options: ['opt1'],
          optionsMap: { opt1: 'Option 1' },
          uiSchema: null
        }
      })

      const messages = hook.getMessages()
      expect(messages[1].isGraph).toBe(true)
    })

    it('handles graph_open with null view - clears graph state', () => {
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({
          type: 'graph_open',
          data: { view: 'chat', content: '', options: [], ui_schema: null }
        })
      })

      expect(hook.dispatch).toHaveBeenCalledWith({
        type: 'SET_GRAPH_STATE',
        state: {
          view: null,
          content: '',
          options: [],
          optionsMap: {},
          bypass_wake_word: false
        }
      })
    })

    it('handles graph_close', () => {
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({ type: 'graph_close' })
      })

      expect(hook.dispatch).toHaveBeenCalledWith({
        type: 'SET_GRAPH_STATE',
        state: { view: null }
      })
    })
  })

  describe('voice_partial messages', () => {
    it('updates call history in call mode', () => {
      const hook = setupHook()
      hook.isCallModeRef.current = true

      act(() => {
        hook.handleWsMessage({ type: 'voice_partial', text: 'partial speech' })
      })

      expect(hook.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SET_CALL_HISTORY' })
      )
    })

    it('ignores voice_partial outside call mode', () => {
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({ type: 'voice_partial', text: 'partial speech' })
      })

      expect(hook.dispatch).not.toHaveBeenCalled()
    })
  })

  describe('window event dispatching messages', () => {
    it('handles init_progress without crashing', () => {
      const hook = setupHook()
      expect(() => {
        act(() => {
          hook.handleWsMessage({ type: 'init_progress', data: { stage: 'loading', progress: 50 } })
        })
      }).not.toThrow()
    })

    it('handles model_changed without crashing', () => {
      const hook = setupHook()
      expect(() => {
        act(() => {
          hook.handleWsMessage({ type: 'model_changed', data: { new_mode: 'fast' } })
        })
      }).not.toThrow()
    })
  })

  describe('observability_trace handling', () => {
    it('dispatches momai_observability_trace event with trace data', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const hook = setupHook()

      const traceData = {
        id: 'trace-1',
        type: 'llm_call',
        total_duration: 12300,
        tokens_per_second: 45.2,
        total_tokens: 558,
        messages: [{ role: 'user', content: 'hello' }],
        response: 'Hi there!',
        tool_calls: [],
        status: 'success'
      }

      act(() => {
        hook.handleWsMessage({ type: 'observability_trace', data: traceData })
      })

      const events = dispatchSpy.mock.calls.filter(([e]) => e.type === 'momai_observability_trace')
      expect(events.length).toBe(1)
      expect((events[0][0] as CustomEvent).detail).toEqual(traceData)
    })

    it('ignores non-observability messages', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({ type: 'init_progress', data: { progress: 50 } })
      })

      const events = dispatchSpy.mock.calls.filter(([e]) => e.type === 'momai_observability_trace')
      expect(events.length).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('handles unknown message types gracefully', () => {
      const hook = setupHook()
      expect(() => {
        act(() => {
          hook.handleWsMessage({ type: 'unknown_type', data: { foo: 'bar' } })
        })
      }).not.toThrow()
    })

    it('handles assistant token when no assistant message exists', () => {
      const hook = setupHook([{ role: 'user', content: 'hello' }])

      act(() => {
        hook.handleWsMessage({ type: 'assistant', data: { token: 'orphan token' } })
      })

      const messages = hook.getMessages()
      expect(messages).toHaveLength(1)
    })

    it('handles tool_result when no prior tool_start exists', () => {
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({
          type: 'tool_result',
          data: { id: 'orphan-tool', name: 'orphan', status: 'done', result: 'orphan result' }
        })
      })

      const messages = hook.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('assistant')
      expect(messages[0].content).toContain('TOOL_TRACE::')
    })

    it('handles tool_result with no id in data', () => {
      const hook = setupHook()

      act(() => {
        hook.handleWsMessage({
          type: 'tool_result',
          data: { status: 'done', result: 'no id result' }
        })
      })

      expect(() => hook.getMessages()).not.toThrow()
    })
  })
})
