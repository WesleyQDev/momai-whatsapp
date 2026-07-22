import React, { JSX, memo, useMemo } from 'react'
import { Message } from '../../../services/api'
import { cleanMomaiActions } from '../../../utils/text'
import icon from '../../../assets/icon.png'
import { ExtrasRenderer } from '../../../components/chat/ExtrasRenderer'
import MessageContextMenu from '../../../components/chat/MessageContextMenu'
import { DynamicRenderer } from '../../../components/DynamicRenderer'
import { useI18n } from '../../../i18n'
import { MarkdownRenderer } from './components/MarkdownRenderer'
import { ToolSteps } from './components/ToolSteps'
import { MessageActions } from './components/MessageActions'
import { StructuredResponse } from './components/StructuredResponse'
import { MessageHeader } from './components/MessageHeader'
import { useMessageState, MessageState } from './hooks/useMessageState'
import { useTtsPlayback, TtsPlaybackState } from './hooks/useTtsPlayback'
import {
  createUnifiedSteps,
  processThinkTags,
  ACTION_MARKER,
  cleanUIMetadata,
  humanizeToolName
} from './utils'

// Register skill renderers
import { registerRenderer } from '../../../components/chat/SkillResponseRegistry'
import WeatherCard from '../../../components/chat/WeatherCard'
import RemindersCard from '../../../components/chat/RemindersCard'
import DevConfirmationCard from '../../../components/chat/DevConfirmationCard'
import DevHtmlRenderCard from '../../../components/chat/DevHtmlRenderCard'
import DevResultCard from '../../../components/chat/DevResultCard'
import '../../../components/chat/ExtensionRendererLoader'
import TrelloCard from '../../../components/chat/TrelloCard'
import YouTubeCard from '../../../components/chat/YouTubeCard'

registerRenderer('weather', WeatherCard)
registerRenderer('reminders', RemindersCard)
registerRenderer('dev_confirmation', DevConfirmationCard)
registerRenderer('dev_html_render', DevHtmlRenderCard)
registerRenderer('dev_result', DevResultCard)
registerRenderer('trello_boards', TrelloCard)
registerRenderer('trello_lists', TrelloCard)
registerRenderer('trello_cards', TrelloCard)
registerRenderer('trello_card_detail', TrelloCard)
registerRenderer('youtube_results', YouTubeCard)

interface MessageItemProps {
  message: Message
  isLoading?: boolean
  onReopenGraph: (data: any) => void
  onGraphOption: (option: string) => void
  isSpeaking?: boolean
  onStopVoice?: () => void
  onStopGeneration?: () => void
  onSpeak?: () => void
  onDelete?: () => void
  onRetry?: () => void
  aiTier?: string | null
  ttsEnabled?: boolean
  llmStarting?: boolean
}

const MessageItem = memo(
  function MessageItem({
    message,
    isLoading = false,
    onReopenGraph,
    onGraphOption,
    isSpeaking = false,
    onStopVoice,
    onStopGeneration,
    onSpeak,
    onDelete,
    onRetry,
    aiTier = 'pro',
    ttsEnabled = false,
    llmStarting = false
  }: MessageItemProps): JSX.Element {
    const { t } = useI18n()

    // Use custom hooks for state management
    const state: MessageState = useMessageState({ message, isLoading })
    const ttsState: TtsPlaybackState = useTtsPlayback({
      isSpeaking,
      onStopVoice,
      onSpeak
    })

    // Handle copy
    const handleCopy = async () => {
      try {
        const text = cleanMomaiActions(message.content)
        if (!text) return

        let success = false
        if (navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(text)
            success = true
          } catch (e) {
            console.debug('Clipboard API failed:', e)
          }
        }

        if (!success) {
          const textArea = document.createElement('textarea')
          textArea.value = text
          textArea.style.position = 'fixed'
          textArea.style.left = '-9999px'
          textArea.style.top = '0'
          document.body.appendChild(textArea)
          textArea.focus()
          textArea.select()
          try {
            const result = document.execCommand('copy')
            if (!result) throw new Error('execCommand copy failed')
          } catch (err) {
            console.error('Fallback copy failed:', err)
          }
          document.body.removeChild(textArea)
        }

        state.setIsCopied(true)
        setTimeout(() => state.setIsCopied(false), 2000)
      } catch (err) {
        console.error('Copy error:', err)
      }
    }

    const handleReportResponse = () => {
      state.setShowReportConfirm(true)
    }

    const handleCancelReport = () => {
      state.setShowReportConfirm(false)
    }

    const handleConfirmReport = () => {
      state.setShowReportConfirm(false)
      window.open('https://forms.office.com/r/NH3BQ1awVA', '_blank')
    }

    const handleContextMenu = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'IMG') return
      e.preventDefault()
      state.setContextMenu({ x: e.clientX, y: e.clientY })
    }

    // Process message content for think tags and action markers
    const displayContentStr = String(state.displayContent || '')
    const hasMarker = displayContentStr.includes(ACTION_MARKER)

    const textParts = hasMarker ? displayContentStr.split(ACTION_MARKER) : [displayContentStr]

    // Process each part for thinking tags
    const processedParts = textParts.map((part) => processThinkTags(part))

    const introData = processedParts[0]
    const introText = introData?.cleanText
    const introThoughts = introData?.thoughts || []

    const finalResponseData = hasMarker ? processedParts[1] : null
    const finalResponseText = finalResponseData?.cleanText || ''
    const finalResponseThoughts = finalResponseData?.thoughts || []

    const allThoughts = [...introThoughts, ...finalResponseThoughts]

    const handleStopVoiceClick = () => {
      if (!onStopVoice) return
      onStopVoice()
      ttsState.handleStopVoiceClick()
    }

    return (
      <div
        onContextMenu={handleContextMenu}
        className={`relative flex items-start gap-3 sm:gap-4 max-w-full group ${message.role === 'assistant' ? 'self-start w-full' : 'self-end flex-row-reverse ml-12'}`}
      >
        {/* Context Menu */}
        {state.contextMenu && (
          <MessageContextMenu
            x={state.contextMenu.x}
            y={state.contextMenu.y}
            isUser={message.role === 'user'}
            onClose={() => state.setContextMenu(null)}
            onCopy={handleCopy}
            onSpeak={onSpeak || (() => {})}
            onDelete={onDelete || (() => {})}
            onRetry={onRetry}
            showSpeak={aiTier !== 'lite'}
          />
        )}

        {/* Avatar */}
        <div
          className={`flex-shrink-0 mt-1 ${message.role === 'assistant' ? 'block' : 'hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity'}`}
        >
          {message.role === 'assistant' ? (
            <div className="relative">
              {isLoading && (
                <div className="absolute inset-[-2px] rounded-xl bg-gradient-to-tr from-accent/40 via-purple-500/20 to-accent/40 animate-spin-slow opacity-40 blur-[4px]"></div>
              )}
              <div
                className={`relative z-10 w-8 h-8 rounded-lg border border-border/20 bg-card overflow-hidden ${isLoading ? 'animate-ai-loading ring-1 ring-accent/20' : ''}`}
              >
                <img
                  src={icon}
                  alt="MomAI"
                  draggable={false}
                  className="w-full h-full object-cover select-none pointer-events-none"
                />
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
              EU
            </div>
          )}
        </div>

        {/* Message Content */}
        <div
          className={`relative break-words overflow-hidden min-w-0 flex-1 transition-all duration-300 ${
            message.role === 'assistant'
              ? 'pt-0.5 text-text text-[15px] sm:text-[16px] leading-relaxed message'
              : 'bg-zinc-100 dark:bg-[#282A2C] p-3 px-4 rounded-lg rounded-tr-none text-text text-[15px] sm:text-[16px] message'
          }`}
        >
          <div className="flex flex-col gap-0 transition-all duration-300 overflow-hidden">
            {/* Thinking Block */}
            <MessageHeader
              message={message}
              aiTier={aiTier}
              isLoading={isLoading}
              isThinkingOpen={state.isThinkingOpen}
              onToggleThinking={() => state.setIsThinkingOpen(!state.isThinkingOpen)}
              thoughts={allThoughts}
            />

            {/* Renderização em Segmentos (Texto e Ações Intercalados) */}
            {processedParts.map((part, segmentIdx) => {
              const segmentSteps = state.unifiedSteps.filter(
                (s: any) => (s.segment || 0) === segmentIdx
              )
              const isLastPart = segmentIdx === processedParts.length - 1
              const hasSegmentData = segmentSteps.length > 0
              const showLoadingStatus = isLastPart && isLoading && !state.toolsFinished
              const hasGlobalExtras =
                isLastPart && (message.snippets?.length || message.cards?.length)
              const hasSources = isLastPart && message.sources && message.sources.length > 0
              const showActionsContainer =
                message.role === 'assistant' &&
                (hasSegmentData || showLoadingStatus || hasSources || hasGlobalExtras)

              return (
                <React.Fragment key={`segment-${segmentIdx}`}>
                  {/* Actions Block */}
                  {showActionsContainer && (
                    <div className="flex flex-col gap-0.5 mb-1">
                      {/* Render Extras (Snippets/Cards) */}
                      {hasGlobalExtras && (
                        <div className="mt-2 text-zinc-800 dark:text-zinc-200">
                          <ExtrasRenderer
                            snippets={message.snippets}
                            cards={message.cards}
                            isLoading={isLoading}
                          />
                        </div>
                      )}

                      {/* Generic Execution Status */}
                      {showLoadingStatus &&
                        !hasSegmentData &&
                        (() => {
                          const searchActivity = state.displayActivities.find((a) =>
                            a.toLowerCase().includes('buscando')
                          )
                          const toolActivity = state.displayActivities.find((a) =>
                            a.toLowerCase().includes('chamando')
                          )
                          const label = searchActivity
                            ? 'Buscando...'
                            : toolActivity
                              ? toolActivity.replace(/manager: chamando ferramenta/i, '').trim() +
                                '...'
                              : state.displayActivities.length > 0
                                ? 'Executando...'
                                : llmStarting
                                  ? 'Iniciando LLM...'
                                  : 'Pensando...'
                          return (
                            <div className="flex items-center gap-1.5 mt-1 min-h-[16px]">
                              <span className="text-[13px] text-zinc-400 animate-pulse">
                                {label}
                              </span>
                            </div>
                          )
                        })()}

                      {/* Tool Steps List */}
                      {hasSegmentData && (
                        <ToolSteps
                          segmentSteps={segmentSteps}
                          segmentIdx={segmentIdx}
                          toolsBlockExpanded={state.toolsBlockExpanded}
                          setToolsBlockExpanded={state.setToolsBlockExpanded}
                          toolsActive={state.toolsActive}
                          isLastPart={isLastPart}
                          sources={message.sources}
                          openSources={state.openSources}
                          setOpenSources={state.setOpenSources}
                          cleanUIMetadata={cleanUIMetadata}
                        />
                      )}
                    </div>
                  )}

                  {/* Markdown Content */}
                  {part.cleanText && part.cleanText.length > 0 && (
                    <div className="transition-all duration-500 animate-in fade-in py-0.5">
                      <MarkdownRenderer>{part.cleanText}</MarkdownRenderer>
                    </div>
                  )}

                  {/* Structured Response */}
                  {isLastPart && message.structuredResponse && (
                    <StructuredResponse
                      response={message.structuredResponse}
                      isSpeaking={isSpeaking}
                    />
                  )}
                </React.Fragment>
              )
            })}

            {/* Footer Options */}
            {message.role === 'assistant' && (
              <div className="flex flex-col gap-3 mt-3">
                {message.graphData?.uiSchema && (
                  <div className="w-full mt-1 bg-white/[0.02] border border-white/5 p-4 rounded-xl animate-fade-in shadow-sm relative overflow-hidden">
                    <DynamicRenderer
                      schema={message.graphData.uiSchema}
                      onAction={(actionId, value) => {
                        const payload = JSON.stringify({ action: actionId, value })
                        onGraphOption(payload)
                      }}
                    />
                  </div>
                )}
                {message.graphData?.options && message.graphData.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 animate-fade-in mt-1">
                    {message.graphData.options.map((option) => {
                      const label = state.optionsMap[option] || option
                      return (
                        <button
                          key={option}
                          onClick={() => onGraphOption(option)}
                          className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-all active:scale-95 border ${
                            option.toLowerCase() === 'sim' ||
                            option.toLowerCase() === 'confirmar' ||
                            option.toLowerCase() === 'yes'
                              ? 'bg-accent/10 border-accent/20 text-accent hover:bg-accent/20 hover:border-accent/30'
                              : option.toLowerCase() === 'não' ||
                                  option.toLowerCase() === 'cancelar' ||
                                  option.toLowerCase() === 'no'
                                ? 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20'
                                : 'bg-white/5 border-border/10 text-text/80 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}
                {message.graphData &&
                  message.graphData.view === 'side' &&
                  message.graphData.content && (
                    <button
                      onClick={() => onReopenGraph(message.graphData)}
                      className="flex items-center gap-3 w-full p-3 bg-accent/5 border border-border/20 rounded-xl hover:bg-accent/10 hover:border-accent/30 transition-all group text-left cursor-pointer shadow-sm animate-fade-in mt-1"
                    >
                      <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center text-accent group-hover:scale-105 transition-transform flex-shrink-0">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                          <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                        </svg>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors truncate">
                          Interface Auxiliar Gerada
                        </span>
                        <span className="text-xs text-text-muted truncate">
                          Clique para visualizar os dados de conteúdo
                        </span>
                      </div>
                    </button>
                  )}

                {/* Message Actions */}
                <MessageActions
                  hasActualContent={state.hasActualContent}
                  isCopied={state.isCopied}
                  onCopy={handleCopy}
                  onRetry={onRetry}
                  aiTier={aiTier}
                  isSpeaking={isSpeaking}
                  isLoading={isLoading}
                  ttsEnabled={ttsEnabled}
                  onStopVoice={handleStopVoiceClick}
                  onSpeak={onSpeak}
                  hideStopButton={ttsState.hideStopButton}
                  onReportResponse={handleReportResponse}
                  showReportConfirm={state.showReportConfirm}
                  onCancelReport={handleCancelReport}
                  onConfirmReport={handleConfirmReport}
                />
              </div>
            )}
          </div>
        </div>

        {/* Side TTS Stop Button */}
        {message.role === 'assistant' && (
          <div className="flex-shrink-0 w-12 flex flex-col items-center pt-10 self-stretch min-h-[100px]">
            {isSpeaking && !ttsState.hideStopButton && (aiTier === 'pro' || aiTier === 'ultra') && (
              <div className="sticky top-[45%] -translate-y-1/2 z-[100] animate-in fade-in zoom-in slide-in-from-right-4 duration-700">
                <button
                  onClick={handleStopVoiceClick}
                  className="relative flex items-center justify-center w-10 h-10 rounded-full bg-[#0a0a0a] border border-purple-500/40 text-purple-400/80 shadow-[0_0_10px_rgba(168,85,247,0.2)] hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:border-purple-400/60 transition-all duration-500 active:scale-90 group overflow-hidden"
                  title={t('chat.voice.stop')}
                >
                  <div className="absolute inset-0 bg-purple-600/5 animate-pulse"></div>
                  <div className="w-3.5 h-3.5 border-[1.5px] border-purple-500/50 rounded-[2.5px] shadow-[0_0_5px_rgba(168,85,247,0.3)] group-hover:scale-110 transition-transform duration-300 relative z-10"></div>
                  <div className="absolute -top-3 -left-3 w-6 h-6 bg-white/5 blur-xl rounded-full"></div>
                </button>

                <div className="absolute -inset-1 rounded-full bg-purple-500/5 blur-sm -z-10"></div>

                <div className="mt-0.5 text-center">
                  <span className="text-[9px] font-bold text-purple-400/60 uppercase tracking-widest leading-none">
                    Parar
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  },
  (prev, next) => {
    return (
      prev.message.id === next.message.id &&
      prev.message.content === next.message.content &&
      prev.message.toolSteps === next.message.toolSteps &&
      prev.message.activities === next.message.activities &&
      prev.message.sources === next.message.sources &&
      prev.message.snippets === next.message.snippets &&
      prev.message.cards === next.message.cards &&
      prev.message.structuredResponse === next.message.structuredResponse &&
      prev.isSpeaking === next.isSpeaking &&
      prev.isLoading === next.isLoading
    )
  }
)

export default MessageItem
export type { MessageItemProps }
