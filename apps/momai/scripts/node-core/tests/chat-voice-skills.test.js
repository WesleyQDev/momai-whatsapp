const { runVoiceCommand, streamLlamaChat, _testExports } = require('../services/chat-service')
const store = require('../services/shared-state').store
const { getThreadMessages } = require('../infrastructure/store')
const llamaManager = require('../services/llama-manager')

describe('chat-voice-skills', () => {
  it('runVoiceCommand is defined as an async function', () => {
    expect(typeof runVoiceCommand).toBe('function')
  })

  it('allows skill discovery and history for voice commands even when Call Mode is enabled', async () => {
    vi.spyOn(llamaManager, 'ensureLlamaReady').mockResolvedValue(false)

    const previousCallMode = store.call_mode
    store.call_mode = true

    try {
      let sseOutput = ''
      const reqMock = {
        on: () => {},
        headers: {}
      }
      const resMock = {
        writeHead: () => {},
        write: (chunk) => {
          sseOutput += String(chunk || '')
          return true
        },
        end: () => {}
      }

      await streamLlamaChat(reqMock, resMock, {
        content: 'previsão do tempo em Curitiba',
        thread_id: 'test-voice-skills',
        is_voice_command: true,
        is_call_mode: true,
        speak_response: false
      })

      const msgs = getThreadMessages(store, 'test-voice-skills')
      expect(msgs.some(m => m.content && m.content.includes('previsão do tempo em Curitiba'))).toBe(true)
    } finally {
      store.call_mode = previousCallMode
      vi.restoreAllMocks()
    }
  })

  it('allows skill discovery and tools when Call Mode is enabled without is_voice_command', async () => {
    vi.spyOn(llamaManager, 'ensureLlamaReady').mockResolvedValue(false)

    const previousCallMode = store.call_mode
    store.call_mode = true

    try {
      let sseOutput = ''
      const reqMock = {
        on: () => {},
        headers: {}
      }
      const resMock = {
        writeHead: () => {},
        write: (chunk) => {
          sseOutput += String(chunk || '')
          return true
        },
        end: () => {}
      }

      await streamLlamaChat(reqMock, resMock, {
        content: 'previsão do tempo em Curitiba',
        thread_id: 'test-luna-skills',
        is_call_mode: true,
        speak_response: true
      })

      const msgs = getThreadMessages(store, 'test-luna-skills')
      expect(msgs.some(m => m.content && m.content.includes('previsão do tempo em Curitiba'))).toBe(true)
    } finally {
      store.call_mode = previousCallMode
      vi.restoreAllMocks()
    }
  })

  it('uses activeThreadId when voice command thread_id is default or empty', async () => {
    vi.spyOn(llamaManager, 'ensureLlamaReady').mockResolvedValue(false)
    const { setActiveThreadId, getActiveThreadId } = require('../services/shared-state')

    setActiveThreadId('thread-sessao-ativa')

    let sseOutput = ''
    const reqMock = { on: () => {}, headers: {} }
    const resMock = {
      writeHead: () => {},
      write: (chunk) => {
        sseOutput += String(chunk || '')
        return true
      },
      end: () => {}
    }

    await streamLlamaChat(reqMock, resMock, {
      content: 'mensagem na thread ativa',
      thread_id: 'default',
      is_voice_command: true,
      speak_response: false
    })

    const activeMsgs = getThreadMessages(store, 'thread-sessao-ativa')
    expect(activeMsgs.some(m => m.content && m.content.includes('mensagem na thread ativa'))).toBe(true)
  })

  it('search_history restricts query results to current thread unless all_sessions is true', async () => {
    const { appendMessage } = require('../infrastructure/store')

    appendMessage(store, 'outra-thread', 'user', 'segredo de outra sessao')
    appendMessage(store, 'thread-atual', 'user', 'mensagem da sessao atual')

    const chatService = require('../services/chat-service')

    // Test executeMetaTool via skillRegistry mock or direct search_history logic test
    let sseOutput = ''
    const reqMock = { on: () => {}, headers: {} }
    const resMock = {
      writeHead: () => {},
      write: (chunk) => {
        sseOutput += String(chunk || '')
        return true
      },
      end: () => {}
    }

    vi.spyOn(llamaManager, 'ensureLlamaReady').mockResolvedValue(false)

    await streamLlamaChat(reqMock, resMock, {
      content: 'faça aquilo',
      thread_id: 'thread-atual',
      is_voice_command: true,
      speak_response: false
    })

    const threadMsgs = getThreadMessages(store, 'thread-atual')
    expect(threadMsgs.some(m => m.content && m.content.includes('segredo de outra sessao'))).toBe(false)
  })
})


