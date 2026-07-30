import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import ContainerChat from './ContainerChat'

vi.mock('./chat', () => ({
  MessageList: () => <div data-testid="message-list">MessageList</div>,
  ChatInput: () => <div data-testid="chat-input">ChatInput</div>,
  LoadingAnimation: ({ message }: { message?: string }) => (
    <div data-testid="loading-animation">{message || 'LoadingAnimation'}</div>
  )
}))

vi.mock('./chat/WelcomeTips', () => ({
  WelcomeHeader: () => <div data-testid="welcome-header">WelcomeHeader</div>,
  WelcomeActions: () => <div data-testid="welcome-actions">WelcomeActions</div>
}))

vi.mock('../services/api', () => ({
  fetchSettings: vi.fn(() =>
    Promise.resolve({
      skip_intro: false,
      tts_enabled: true,
      ai_tier: 'ultra',
      user_name: null
    })
  ),
  listMemoryNotes: vi.fn(() => Promise.resolve([])),
  resetChatContextUsage: vi.fn(() => Promise.resolve())
}))

vi.mock('../i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('../utils/text', () => ({
  cleanMomaiActions: (s: string) => s,
  stripMarkdown: (s: string) => s
}))

vi.mock('../constants', () => ({
  WS_URL: 'ws://localhost:9999'
}))

describe('ContainerChat', () => {
  const defaultProps = {
    messages: [],
    isLoading: false,
    text: '',
    onSendMessage: vi.fn(),
    messagesEndRef: { current: null } as React.RefObject<HTMLDivElement | null>,
    onReopenGraph: vi.fn(),
    onGraphOption: vi.fn(),
    statusInfo: null,
    threadId: 'default',
    setThreadId: vi.fn(),
    animationFinished: true,
    setAnimationFinished: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    HTMLDivElement.prototype.scrollTo = vi.fn() as any
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
    } as unknown as CanvasRenderingContext2D)
    ;(window as any).api = {
      ...((window as any).api ?? {}),
      apiWebSocket: () => ({
        onopen: null,
        onclose: null,
        onmessage: null,
        onerror: null,
        send: vi.fn(),
        close: vi.fn()
      })
    }
  })

  afterEach(() => {
    delete (window as any).api
  })

  it('renders welcome tips when no messages', async () => {
    render(<ContainerChat {...defaultProps} />)
    await act(() => Promise.resolve())
    expect(screen.getByTestId('welcome-header')).toBeInTheDocument()
    expect(screen.getByTestId('welcome-actions')).toBeInTheDocument()
  })

  it('renders messages when present', async () => {
    const messages = [
      { id: '1', role: 'user' as const, content: 'Hello' },
      { id: '2', role: 'assistant' as const, content: 'Hi there' }
    ]
    render(<ContainerChat {...defaultProps} messages={messages} />)
    await act(() => Promise.resolve())
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
    expect(screen.queryByTestId('welcome-header')).not.toBeInTheDocument()
    expect(screen.queryByTestId('welcome-actions')).not.toBeInTheDocument()
  })

  it('renders ChatInput', async () => {
    render(<ContainerChat {...defaultProps} />)
    await act(() => Promise.resolve())
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })

  it('shows call mode UI when in call mode', async () => {
    render(<ContainerChat {...defaultProps} isCallMode={true} />)
    await act(() => Promise.resolve())
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument()
    expect(screen.getByTitle('Encerrar Sessão')).toBeInTheDocument()
  })

  it('renders loading state', async () => {
    render(<ContainerChat {...defaultProps} isBooting={true} animationFinished={false} />)
    await act(() => Promise.resolve())
    expect(screen.getByTestId('loading-animation')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument()
  })

  it('renders loading when isTierChanging is true', async () => {
    render(<ContainerChat {...defaultProps} isTierChanging={true} />)
    await act(() => Promise.resolve())
    expect(screen.getByTestId('loading-animation')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument()
  })

  it('passes tier-changing message to LoadingAnimation', async () => {
    localStorage.setItem('momai_ai_tier', 'ultra')
    render(<ContainerChat {...defaultProps} isTierChanging={true} />)
    await act(() => Promise.resolve())
    expect(screen.getByText(/ultra/i)).toBeInTheDocument()
  })

  it('hides loading when isTierChanging becomes false', async () => {
    const { rerender } = render(<ContainerChat {...defaultProps} isTierChanging={true} />)
    await act(() => Promise.resolve())
    expect(screen.getByTestId('loading-animation')).toBeInTheDocument()
    rerender(<ContainerChat {...defaultProps} isTierChanging={false} />)
    await act(() => Promise.resolve())
    expect(screen.queryByTestId('loading-animation')).not.toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })

  it('renders ContextUsageRing when dev mode and context ring enabled', async () => {
    localStorage.setItem('momai_dev_mode', 'true')
    localStorage.setItem('momai_show_context_ring', 'true')
    render(<ContainerChat {...defaultProps} />)
    await act(() => Promise.resolve())
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('renders ChatHistoryPopover trigger', async () => {
    render(<ContainerChat {...defaultProps} />)
    await act(() => Promise.resolve())
    expect(screen.getByText('home.history.previousConversations')).toBeInTheDocument()
  })
})
