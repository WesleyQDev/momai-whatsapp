import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('./hooks/useMessageState', () => ({
  useMessageState: vi.fn()
}))

vi.mock('./hooks/useTtsPlayback', () => ({
  useTtsPlayback: vi.fn()
}))

vi.mock('./components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  )
}))

vi.mock('./components/MessageHeader', () => ({
  MessageHeader: ({ thoughts, onToggleThinking }: any) => (
    <div data-testid="message-header">
      {thoughts.length > 0 && (
        <button data-testid="thinking-toggle" onClick={onToggleThinking}>
          Pensamento
        </button>
      )}
    </div>
  )
}))

vi.mock('./components/StructuredResponse', () => ({
  StructuredResponse: ({ responses }: any) => (
    <div data-testid="structured-response">{responses?.[0]?.type}</div>
  )
}))

vi.mock('./components/MessageActions', () => ({
  MessageActions: (props: any) => (
    <div data-testid="message-actions">
      <button data-testid="copy-button" onClick={props.onCopy}>
        Copy
      </button>
      {props.onRetry && (
        <button data-testid="retry-button" onClick={props.onRetry}>
          Retry
        </button>
      )}
      {props.onSpeak && (
        <button data-testid="speak-button" onClick={props.onSpeak}>
          Speak
        </button>
      )}
    </div>
  )
}))

vi.mock('./components/ToolSteps', () => ({
  ToolSteps: () => <div data-testid="tool-steps">Tool Steps</div>
}))

vi.mock('../../../components/chat/ExtrasRenderer', () => ({
  ExtrasRenderer: () => <div data-testid="extras-renderer">Extras</div>
}))

vi.mock('../../../components/chat/MessageContextMenu', () => ({
  __esModule: true,
  default: ({ onCopy, onSpeak, onRetry }: any) => (
    <div data-testid="context-menu">
      <button data-testid="context-copy" onClick={onCopy}>
        Copy
      </button>
      <button data-testid="context-speak" onClick={onSpeak}>
        Speak
      </button>
      {onRetry && (
        <button data-testid="context-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}))

vi.mock('../../../components/DynamicRenderer', () => ({
  DynamicRenderer: () => <div data-testid="dynamic-renderer">Dynamic</div>
}))

vi.mock('../../../utils/text', () => ({
  cleanMomaiActions: (text: string) => text
}))

vi.mock('../../../assets/icon.png', () => ({ default: 'icon-mock.png' }))

vi.mock('../../../components/chat/SkillResponseRegistry', () => ({
  registerRenderer: vi.fn()
}))
vi.mock('../../../components/chat/WeatherCard', () => ({ default: () => null }))
vi.mock('../../../components/chat/RemindersCard', () => ({ default: () => null }))
vi.mock('../../../components/chat/DevConfirmationCard', () => ({ default: () => null }))
vi.mock('../../../components/chat/DevHtmlRenderCard', () => ({ default: () => null }))
vi.mock('../../../components/chat/DevResultCard', () => ({ default: () => null }))
vi.mock('../../../components/chat/ExtensionRendererLoader', () => ({}))

import MessageItem from './MessageItem'
import { useMessageState } from './hooks/useMessageState'
import { useTtsPlayback } from './hooks/useTtsPlayback'

describe('MessageItem', () => {
  const defaultMessageState = {
    openToolIndex: {},
    setOpenToolIndex: vi.fn(),
    hideStopButton: false,
    setHideStopButton: vi.fn(),
    elapsedSeconds: {},
    setElapsedSeconds: vi.fn(),
    openSources: false,
    setOpenSources: vi.fn(),
    revealedSources: 0,
    setRevealedSources: vi.fn(),
    contextMenu: null,
    setContextMenu: vi.fn(),
    showReportConfirm: false,
    setShowReportConfirm: vi.fn(),
    isCopied: false,
    setIsCopied: vi.fn(),
    toolsBlockExpanded: {},
    setToolsBlockExpanded: vi.fn(),
    memoryBlockExpanded: {},
    setMemoryBlockExpanded: vi.fn(),
    toolsActive: {},
    setToolsActive: vi.fn(),
    isThinkingOpen: false,
    setIsThinkingOpen: vi.fn(),
    unifiedSteps: [],
    toolSteps: [],
    displayActivities: [],
    isToolTrace: false,
    toolTrace: null,
    toolTraceText: '',
    displayContent: '',
    optionsMap: {},
    isFinalizing: false,
    hasActualContent: false,
    toolsFinished: false,
    isChatCard: false,
    isSystemModelChange: false,
    isDone: false
  }

  const defaultTtsState = {
    hideStopButton: false,
    handleStopVoiceClick: vi.fn()
  }

  const defaultProps = {
    message: { role: 'user' as const, content: '' },
    onReopenGraph: vi.fn(),
    onGraphOption: vi.fn(),
    onSpeak: vi.fn(),
    onRetry: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMessageState).mockReturnValue(defaultMessageState)
    vi.mocked(useTtsPlayback).mockReturnValue(defaultTtsState)
  })

  it('renders user message text', () => {
    const content = 'hello'
    vi.mocked(useMessageState).mockReturnValue({
      ...defaultMessageState,
      displayContent: content,
      hasActualContent: true
    })
    render(<MessageItem {...defaultProps} message={{ role: 'user', content }} />)

    expect(screen.getByTestId('markdown')).toHaveTextContent(content)
    expect(screen.queryByTestId('message-actions')).not.toBeInTheDocument()
  })

  it('renders assistant message', () => {
    const content = 'world'
    vi.mocked(useMessageState).mockReturnValue({
      ...defaultMessageState,
      displayContent: content,
      hasActualContent: true
    })
    render(<MessageItem {...defaultProps} message={{ role: 'assistant', content }} />)

    expect(screen.getByTestId('markdown')).toHaveTextContent(content)
    expect(screen.getByTestId('message-actions')).toBeInTheDocument()
  })

  it('strips think tags from content', () => {
    const content = 'Hello <think>inner thought</think> world'
    vi.mocked(useMessageState).mockReturnValue({
      ...defaultMessageState,
      displayContent: content,
      hasActualContent: true
    })
    render(<MessageItem {...defaultProps} message={{ role: 'assistant', content }} />)

    expect(screen.getByTestId('markdown')).toHaveTextContent('Hello')
    expect(screen.getByTestId('markdown')).toHaveTextContent('world')
    expect(screen.getByTestId('markdown')).not.toHaveTextContent('inner thought')
    expect(screen.queryByTestId('thinking-toggle')).not.toBeInTheDocument()
  })

  it('renders structured response when present', () => {
    const structuredResponse = { type: 'weather', data: { temp: 25 } }
    vi.mocked(useMessageState).mockReturnValue({
      ...defaultMessageState,
      displayContent: 'some text',
      hasActualContent: true
    })
    render(
      <MessageItem
        {...defaultProps}
        message={{ role: 'assistant', content: 'some text', structuredResponses: [structuredResponse] }}
      />
    )

    expect(screen.getByTestId('structured-response')).toHaveTextContent('weather')
  })

  it('renders tool trace messages', () => {
    vi.mocked(useMessageState).mockReturnValue({
      ...defaultMessageState,
      isToolTrace: true,
      displayContent: 'Tool trace output',
      toolTraceText: 'Tool trace output'
    })
    render(
      <MessageItem
        {...defaultProps}
        message={{
          role: 'assistant',
          content: 'TOOL_TRACE::{"status":"ok"}\n\nTOOL_TEXT::\nTool trace output'
        }}
      />
    )

    expect(screen.getByTestId('markdown')).toHaveTextContent('Tool trace output')
  })

  it('calls onSpeak when speak button clicked', () => {
    const onSpeak = vi.fn()
    vi.mocked(useMessageState).mockReturnValue({
      ...defaultMessageState,
      displayContent: 'hello',
      hasActualContent: true
    })
    render(
      <MessageItem
        {...defaultProps}
        message={{ role: 'assistant', content: 'hello' }}
        onSpeak={onSpeak}
      />
    )

    fireEvent.click(screen.getByTestId('speak-button'))
    expect(onSpeak).toHaveBeenCalledTimes(1)
  })

  it('calls onRetry when retry button clicked', () => {
    const onRetry = vi.fn()
    vi.mocked(useMessageState).mockReturnValue({
      ...defaultMessageState,
      displayContent: 'hello',
      hasActualContent: true
    })
    render(
      <MessageItem
        {...defaultProps}
        message={{ role: 'assistant', content: 'hello' }}
        onRetry={onRetry}
      />
    )

    fireEvent.click(screen.getByTestId('retry-button'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
