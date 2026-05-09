import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Mock } from 'vitest'

vi.mock('../services/api', () => ({
  sendChatMessage: vi.fn(),
  searchMemory: vi.fn(),
  clearChatHistory: vi.fn(),
  stopVoice: vi.fn(),
  stopGeneration: vi.fn(),
  deleteMessage: vi.fn(),
  speakText: vi.fn(),
  setCallMode: vi.fn(),
  generateSessionTitle: vi.fn()
}))

vi.mock('../utils/chatUtils', () => ({
  createAssistantMessageId: vi.fn(),
  isToolTraceMessage: vi.fn(),
  splitToolTraceContent: vi.fn(),
  buildToolTraceContent: vi.fn()
}))

vi.mock('../utils/text', () => ({
  cleanMomaiActions: vi.fn()
}))

import { useChatActions } from './useChatActions'
import {
  sendChatMessage,
  searchMemory,
  clearChatHistory,
  stopVoice,
  stopGeneration,
  generateSessionTitle
} from '../services/api'
import { createAssistantMessageId, isToolTraceMessage } from '../utils/chatUtils'
import { cleanMomaiActions } from '../utils/text'
import type { Message } from '../services/api'

function createMockRef<T>(initial: T) {
  return { current: initial }
}

function createDefaultProps() {
  return {
    threadId: 'test-thread-id',
    currentThreadRef: createMockRef('test-thread-id'),
    messagesRef: createMockRef<Message[]>([]),
    dispatch: vi.fn(),
    toolTraceRef: createMockRef({ activeMsgId: null, byToolId: {} }),
    isCallMode: false,
    isCallModeRef: createMockRef(false),
    setText: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(createAssistantMessageId as Mock).mockReturnValue('assistant-mock-id')
  ;(isToolTraceMessage as Mock).mockReturnValue(false)
  ;(searchMemory as Mock).mockResolvedValue([])
  ;(sendChatMessage as Mock).mockImplementation(
    async (_content: string, _threadId: string, callbacks: Record<string, any>) => {
      callbacks.onDone()
    }
  )
  ;(generateSessionTitle as Mock).mockResolvedValue('')
  ;(clearChatHistory as Mock).mockResolvedValue(undefined)
  ;(stopVoice as Mock).mockResolvedValue(undefined)
  ;(stopGeneration as Mock).mockResolvedValue(undefined)
  ;(cleanMomaiActions as Mock).mockImplementation((s: string) => s)
})

describe('useChatActions', () => {
  describe('sendMessage', () => {
    it('adds user message and calls API', async () => {
      const props = createDefaultProps()
      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('hello')
      })

      expect(props.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'UPDATE_MESSAGES' })
      )
      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_LOADING', isLoading: true })
      expect(props.setText).toHaveBeenCalledWith('')
      expect(sendChatMessage).toHaveBeenCalled()
      expect(createAssistantMessageId).toHaveBeenCalled()
    })

    it('passes content and threadId to sendChatMessage', async () => {
      const props = createDefaultProps()
      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('test message')
      })

      expect(sendChatMessage).toHaveBeenCalledWith(
        'test message',
        'test-thread-id',
        expect.any(Object),
        expect.any(Object)
      )
    })

    it('does not send empty messages', async () => {
      const props = createDefaultProps()
      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('   ')
      })

      expect(sendChatMessage).not.toHaveBeenCalled()
    })

    it('injects memory context when searchMemory returns results', async () => {
      const props = createDefaultProps()

      ;(searchMemory as Mock).mockResolvedValue([
        {
          note_id: 'note1',
          chunk_id: 'chunk1',
          title: 'Test Note',
          path: '/test',
          text: 'Relevant content about the query',
          score: 0.95
        }
      ])

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('tell me about my notes')
      })

      expect(searchMemory).toHaveBeenCalledWith('tell me about my notes', 6)
      expect(sendChatMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          memory_context: expect.stringContaining('CONHECIMENTO (NOTAS LOCAIS)')
        })
      )
    })

    it('deduplicates and limits memory sources to 4', async () => {
      const props = createDefaultProps()
      const hits = Array.from({ length: 6 }, (_, i) => ({
        note_id: `note${i % 3}`,
        chunk_id: `chunk${i}`,
        title: `Note ${i % 3}`,
        path: '/test',
        text: `Content ${i}`,
        score: 0.9 - i * 0.1
      }))

      ;(searchMemory as Mock).mockResolvedValue(hits)

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('test dedup')
      })

      const callArgs = (sendChatMessage as Mock).mock.calls[0]
      const options = callArgs[3]
      expect(options.memory_context).toBeDefined()
      const noteCount = (options.memory_context.match(/TITULO DA NOTA/g) || []).length
      expect(noteCount).toBeLessThanOrEqual(4)
    })

    it('handles memory injection gracefully when searchMemory throws', async () => {
      const props = createDefaultProps()
      ;(searchMemory as Mock).mockRejectedValue(new Error('db error'))

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('hello')
      })

      expect(sendChatMessage).toHaveBeenCalled()
    })

    it('skips user message when skipUserMessage is true', async () => {
      const props = createDefaultProps()
      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('hello', false, true)
      })

      const dispatchCalls = (props.dispatch as Mock).mock.calls
      const addUserMessageCall = dispatchCalls.find((args: any[]) => {
        const action = args[0]
        if (action.type === 'UPDATE_MESSAGES' && typeof action.updater === 'function') {
          const result = action.updater([])
          return result.length > 0 && result[0].role === 'user'
        }
        return false
      })
      expect(addUserMessageCall).toBeUndefined()
      expect(sendChatMessage).toHaveBeenCalled()
    })

    it('uses silent path when isSilent is true', async () => {
      const props = createDefaultProps()
      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('silent command', true)
      })

      expect(props.dispatch).not.toHaveBeenCalledWith({ type: 'SET_LOADING', isLoading: true })
      expect(sendChatMessage).toHaveBeenCalled()
    })

    it('sets SET_LOADING true on send and false on done', async () => {
      const props = createDefaultProps()
      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('hello')
      })

      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_LOADING', isLoading: true })
      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_LOADING', isLoading: false })
    })

    it('handles API errors gracefully', async () => {
      const props = createDefaultProps()
      ;(sendChatMessage as Mock).mockRejectedValue(new Error('network failure'))

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('hello')
      })

      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_LOADING', isLoading: false })
    })
  })

  describe('call mode', () => {
    it('adds to callHistory when isCallMode is true', async () => {
      const props = createDefaultProps()
      props.isCallModeRef.current = true

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('hello in call mode')
      })

      expect(props.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SET_CALL_HISTORY' })
      )
    })

    it('trims callHistory to last 5 entries', async () => {
      const props = createDefaultProps()
      props.isCallModeRef.current = true
      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.sendMessage('hello')
      })

      const lastCall = (props.dispatch as Mock).mock.calls
        .filter((args: any[]) => args[0]?.type === 'SET_CALL_HISTORY')
        .pop()
      expect(lastCall).toBeDefined()
      const action = lastCall![0]
      const updater = action.updater as (prev: any[]) => any[]
      const longHistory = Array.from({ length: 7 }, (_, i) => ({
        id: `u${i}`,
        role: 'user' as const,
        content: `msg ${i}`
      }))
      const trimmed = updater(longHistory)
      expect(trimmed.length).toBe(5)
      expect(trimmed[0].content).toBe('msg 3')
    })
  })

  describe('regenerateMessage', () => {
    it('re-sends last user message', async () => {
      const props = createDefaultProps()
      props.messagesRef.current = [
        { role: 'user', content: 'original question' },
        { role: 'assistant', content: 'original answer' }
      ]

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.regenerateMessage(1)
      })

      expect(stopVoice).toHaveBeenCalled()
      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_SPEAKING', messageId: null })
      expect(sendChatMessage).toHaveBeenCalledWith(
        'original question',
        expect.any(String),
        expect.any(Object),
        expect.any(Object)
      )
    })

    it('does nothing when index does not point to an assistant message', async () => {
      const props = createDefaultProps()
      props.messagesRef.current = [
        { role: 'user', content: 'question' },
        { role: 'assistant', content: 'answer' }
      ]

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.regenerateMessage(0)
      })

      expect(sendChatMessage).not.toHaveBeenCalled()
    })

    it('does nothing when no prior user message exists', async () => {
      const props = createDefaultProps()
      props.messagesRef.current = [{ role: 'assistant', content: 'orphan reply' }]

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.regenerateMessage(0)
      })

      expect(sendChatMessage).not.toHaveBeenCalled()
    })
  })

  describe('handleClear', () => {
    it('resets messages and calls clearChatHistory', async () => {
      const props = createDefaultProps()

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.handleClear()
      })

      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_MESSAGES', messages: [] })
      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_SPEAKING', messageId: null })
      expect(props.dispatch).toHaveBeenCalledWith({
        type: 'SET_CALL_HISTORY',
        updater: expect.any(Function)
      })
      expect(props.toolTraceRef.current).toEqual({
        activeMsgId: null,
        byToolId: {}
      })
      expect(clearChatHistory).toHaveBeenCalledWith('test-thread-id')
      expect(stopVoice).toHaveBeenCalled()
    })
  })

  describe('stopGeneration', () => {
    it('calls stopGeneration api and stops voice', async () => {
      const props = createDefaultProps()

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.stopGeneration()
      })

      expect(stopGeneration).toHaveBeenCalled()
      expect(stopVoice).toHaveBeenCalled()
      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_LOADING', isLoading: false })
    })

    it('handles errors without throwing', async () => {
      const props = createDefaultProps()
      ;(stopGeneration as Mock).mockRejectedValue(new Error('stop failed'))

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.stopGeneration()
      })

      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_LOADING', isLoading: false })
    })
  })

  describe('toggleCallMode', () => {
    it('toggles call mode on', async () => {
      const props = createDefaultProps()
      props.isCallMode = false

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.toggleCallMode()
      })

      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_CALL_MODE', enabled: true })
      expect(props.dispatch).toHaveBeenCalledWith({
        type: 'SET_CALL_HISTORY',
        updater: expect.any(Function)
      })
    })

    it('toggles call mode off and stops voice', async () => {
      const props = createDefaultProps()
      props.isCallMode = true

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.toggleCallMode()
      })

      expect(props.dispatch).toHaveBeenCalledWith({ type: 'SET_CALL_MODE', enabled: false })
      expect(props.dispatch).toHaveBeenCalledWith({
        type: 'SET_CALL_HISTORY',
        updater: expect.any(Function)
      })
      expect(stopVoice).toHaveBeenCalled()
    })
  })

  describe('handleGraphOption', () => {
    it('sends graph options as messages', async () => {
      const props = createDefaultProps()

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.handleGraphOption('tell me more')
      })

      expect(props.dispatch).toHaveBeenCalledWith({
        type: 'SET_GRAPH_STATE',
        state: { view: null }
      })
      expect(sendChatMessage).toHaveBeenCalledWith(
        'tell me more',
        expect.any(String),
        expect.any(Object),
        expect.any(Object)
      )
    })

    it('sends silent message for __TOOL__: prefix', async () => {
      const props = createDefaultProps()

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.handleGraphOption('__TOOL__:run_code')
      })

      expect(sendChatMessage).toHaveBeenCalledWith(
        '__TOOL__:run_code',
        expect.any(String),
        expect.any(Object),
        expect.any(Object)
      )
    })

    it('does not send message for dismiss', async () => {
      const props = createDefaultProps()

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.handleGraphOption('dismiss')
      })

      expect(sendChatMessage).not.toHaveBeenCalled()
    })
  })

  describe('removeMessage', () => {
    it('removes a message by index', async () => {
      const props = createDefaultProps()
      props.messagesRef.current = [{ id: '1', role: 'user', content: 'hi' }]

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.removeMessage(0)
      })

      expect(props.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'UPDATE_MESSAGES' })
      )
    })

    it('does nothing for out-of-bounds index', async () => {
      const props = createDefaultProps()
      props.messagesRef.current = [{ id: '1', role: 'user', content: 'hi' }]

      const { result } = renderHook(() => useChatActions(props))

      await act(async () => {
        await result.current.removeMessage(99)
      })

      expect(props.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'UPDATE_MESSAGES' })
      )
    })
  })
})
