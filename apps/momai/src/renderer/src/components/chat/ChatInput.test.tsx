import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatInput from './ChatInput'

vi.mock('../../hooks/useAutocomplete', () => ({
  useAutocomplete: () => ({
    suggestion: '',
    addToHistory: vi.fn(),
    getSuggestion: vi.fn(),
    clearSuggestion: vi.fn(),
    acceptSuggestion: vi.fn((text: string) => text),
    getRecentHistory: vi.fn(() => [])
  })
}))

vi.mock('../../hooks/usePythonStatus', () => ({
  usePythonStatus: () => ({ online: true, detail: '' })
}))

vi.mock('../../services/api', () => ({
  fetchSettings: vi.fn(() =>
    Promise.resolve({
      wake_word_enabled: false,
      tts_enabled: true,
      ai_tier: 'ultra'
    })
  ),
  updateSettingsPartial: vi.fn(() => Promise.resolve()),
  quickTranscribe: vi.fn(() => Promise.resolve({ success: true, text: '' })),
  stopQuickTranscribe: vi.fn(() => Promise.resolve())
}))

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

describe('ChatInput', () => {
  const defaultProps = {
    text: '',
    onSend: vi.fn(),
    isLoading: false,
    statusInfo: {
      status: 'ok',
      mode: 'chat',
      brain_ready: true,
      is_loading: false,
      setup: { local_installed: true },
      ai_tier: 'ultra'
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders text input', () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('send button triggers onSend', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'hello world')

    const sendButton = screen.getByTitle('Enviar mensagem')
    await user.click(sendButton)

    expect(onSend).toHaveBeenCalledWith('hello world')
  })

  it('shows stop button and prevents send when loading', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} isLoading={true} onSend={onSend} />)

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByTitle('Enviar mensagem')).not.toBeInTheDocument()

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'hello')
    await user.keyboard('{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send empty text', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)

    expect(screen.queryByTitle('Enviar mensagem')).not.toBeInTheDocument()

    const textarea = screen.getByRole('textbox')
    textarea.focus()
    await user.keyboard('{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('renders voice button', () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByTitle('Gravar mensagem de voz')).toBeInTheDocument()
  })

  it('sends on Enter key', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'hello')
    await user.keyboard('{Enter}')

    expect(onSend).toHaveBeenCalledWith('hello')
  })

  it('inserts newline on Shift+Enter', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'hello')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(onSend).not.toHaveBeenCalled()
  })
})
