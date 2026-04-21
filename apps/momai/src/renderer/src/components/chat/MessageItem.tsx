import React, { JSX, memo, useEffect, useState, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'
import { cleanMomaiActions } from '../../utils/text'
import icon from '../../assets/icon.png'
import { DocumentTextIcon, ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline'
import { ExtrasRenderer } from './ExtrasRenderer'
import MessageContextMenu from './MessageContextMenu'
import { useI18n } from '../../i18n'
import { DynamicRenderer } from '../DynamicRenderer'
import { registerRenderer } from './SkillResponseRegistry'
import WeatherCard from './WeatherCard'
import RemindersCard from './RemindersCard'
import StructuredResponseRenderer from './StructuredResponseRenderer'

registerRenderer('weather', WeatherCard)
registerRenderer('reminders', RemindersCard)

const cleanUIMetadata = (text: string) => {
  if (!text) return ''
  return text
    .replace(/[#*`_~>[\]()]/g, '')
    .replace(/Nota:/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const humanizeToolName = (name: string) => {
  const lower = (name || '').toLowerCase()
  if (lower.includes('duckduckgo') || lower.includes('search')) return 'Busca na web'
  if (lower.includes('reminder')) return 'Lembretes'
  if (lower.includes('interface')) return 'Interface'
  if (lower.includes('os') || lower.includes('shell')) return 'Sistema OS'
  if (lower.includes('browser') || lower.includes('navigate')) return 'Navegador'
  if (lower.includes('youtube')) return 'YouTube'

  // Try to capitalize the first letter if we fallback
  const fallback = name || 'Ferramenta'
  return fallback.charAt(0).toUpperCase() + fallback.slice(1)
}

const CodeBlock = ({ children, className }: any) => {
  const [copied, setCopied] = useState(false)
  const code = String(children?.props?.children || children || '').replace(/\n$/, '')

  const onCopy = () => {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-4">
      <div className="absolute right-3 top-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onCopy}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white transition-all backdrop-blur-sm"
        >
          {copied ? (
            <CheckIcon className="w-4 h-4 text-green-400" />
          ) : (
            <ClipboardIcon className="w-4 h-4" />
          )}
        </button>
      </div>
      <pre className={className}>{children}</pre>
    </div>
  )
}

const Markdown = ({ children, components = {} }: { children: string; components?: any }) => {
  return (
    <div
      className={`prose prose-zinc dark:prose-invert max-w-none 
                 prose-p:leading-[1.6] prose-p:text-[15px] prose-p:text-zinc-800 dark:prose-p:text-zinc-300 prose-p:!m-0 prose-p:!mb-1
                 prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0
                 prose-li:text-[15px] prose-li:text-zinc-800 dark:prose-li:text-zinc-300 prose-li:!my-0.5 prose-li:!p-0
                 prose-ul:!my-1 prose-ul:!pl-0 prose-ul:!ml-5 prose-ul:!list-outside prose-ul:!marker:text-zinc-400
                 prose-ol:!my-1 prose-ol:!pl-0 prose-ol:!ml-5 prose-ol:!list-outside prose-ol:!marker:text-zinc-400
                 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100 prose-strong:font-bold
                 prose-h1:text-zinc-900 dark:prose-h1:text-zinc-100 prose-h1:font-bold prose-h1:!m-0 prose-h1:!mt-2 prose-h1:!mb-1 prose-h1:!text-[15px]
                 prose-h2:text-zinc-900 dark:prose-h2:text-zinc-100 prose-h2:font-bold prose-h2:!m-0 prose-h2:!mt-2 prose-h2:!mb-1 prose-h2:!text-[15px]
                 prose-h3:text-zinc-900 dark:prose-h3:text-zinc-100 prose-h3:font-bold prose-h3:!m-0 prose-h3:!mt-1 prose-h3:!mb-1 prose-h3:!text-[15px]
                 prose-h4:text-zinc-900 dark:prose-h4:text-zinc-100 prose-h4:font-bold prose-h4:!m-0 prose-h4:!mt-1 prose-h4:!mb-1 prose-h4:!text-[15px]
                 prose-hr:!my-4 prose-hr:border-zinc-200 dark:prose-hr:border-white/10
                 prose-a:text-blue-500 hover:prose-a:text-blue-600 dark:prose-a:text-blue-400`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ node, ...props }) => <CodeBlock {...props} />,
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="bg-zinc-100 dark:bg-white/10 text-red-500 dark:text-red-400 px-1.5 py-0.5 rounded-[4px] font-mono text-[13px] tracking-tight mx-0.5"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4 scrollbar-thin rounded-lg border border-border/20">
              <table className="min-w-full border-collapse overflow-hidden font-sans" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-zinc-50 dark:bg-white/5 border-b border-border/20" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className="px-4 py-3 text-left text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td
              className="px-4 py-3 text-[14px] text-zinc-700 dark:text-zinc-300 border-b border-border/10 last:border-0"
              {...props}
            />
          ),
          tr: ({ node, ...props }) => (
            <tr
              className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02] transition-colors"
              {...props}
            />
          ),
          ...components
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

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
}

const MessageItem = memo(function MessageItem({
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
  aiTier = 'pro'
}: MessageItemProps): JSX.Element {
  const { t } = useI18n()
  const [openToolIndex, setOpenToolIndex] = useState<Record<number, number | null>>({})
  const [hideStopButton, setHideStopButton] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState<Record<number, number>>({})
  const [openSources, setOpenSources] = useState(false)
  const [revealedSources, setRevealedSources] = useState<number>(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showReportConfirm, setShowReportConfirm] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [toolsBlockExpanded, setToolsBlockExpanded] = useState<Record<number, boolean>>({})
  const [memoryBlockExpanded, setMemoryBlockExpanded] = useState<Record<number, boolean>>({})
  const [toolsActive, setToolsActive] = useState<Record<number, boolean>>({})
  const startTimesRef = useRef<Record<number, number>>({})

  // Resolve fluttering for tools block expander state
  useEffect(() => {
    if (!message.toolSteps) return

    const activeSegments: Record<number, boolean> = {}

    // Check each segment individually
    const segments = new Set(message.toolSteps.map((s: any) => s.segment || 0))

    segments.forEach((segmentIdx: number) => {
      const segmentSteps = message.toolSteps!.filter((s: any) => (s.segment || 0) === segmentIdx)
      const hasRunningStep = segmentSteps.some((s: any) => s.status === 'running')
      const isWaitingForFirstText =
        isLoading && (!message.content || message.content.length === 0) && segmentIdx === 0

      activeSegments[segmentIdx] = hasRunningStep || isWaitingForFirstText
    })

    setToolsActive(activeSegments)

    // Schedule clearing active state for segments that just finished
    const timer = setTimeout(() => {
      setToolsActive((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((k) => {
          if (!activeSegments[Number(k)]) {
            next[Number(k)] = false
          }
        })
        return next
      })
    }, 3000)

    return () => clearTimeout(timer)
  }, [message.toolSteps, isLoading, message.content])

  // Reset tool details when loading finishes or reset
  useEffect(() => {
    if (!isLoading) {
      setOpenToolIndex({})
    }
  }, [isLoading])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

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
          console.warn('Clipboard API failed:', e)
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

      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error('Copy error:', err)
    }
  }

  const handleStopVoiceClick = () => {
    if (!onStopVoice) return
    onStopVoice()
    setHideStopButton(true)
  }

  const handleReportResponse = () => {
    setShowReportConfirm(true)
  }

  const handleCancelReport = () => {
    setShowReportConfirm(false)
  }

  const handleConfirmReport = () => {
    setShowReportConfirm(false)
    window.open('https://forms.office.com/r/NH3BQ1awVA', '_blank')
  }

  useEffect(() => {
    if (isSpeaking) {
      setHideStopButton(false)
    }
  }, [isSpeaking])

  const isSystemModelChange =
    message.role === 'assistant' && message.content.startsWith('Brain changed to:')
  const isDone = message.content.includes('✅')

  const toolTracePrefix = 'TOOL_TRACE::'
  const toolTraceTextDelimiter = '\n\nTOOL_TEXT::\n'
  const isToolTrace = message.role === 'assistant' && message.content.startsWith(toolTracePrefix)
  let toolTrace: { status?: string; steps?: any[] } | null = null
  let toolTraceText = ''

  if (isToolTrace) {
    try {
      const idx = message.content.indexOf(toolTraceTextDelimiter)
      const jsonPart =
        idx >= 0
          ? message.content.slice(toolTracePrefix.length, idx)
          : message.content.slice(toolTracePrefix.length)
      toolTraceText = idx >= 0 ? message.content.slice(idx + toolTraceTextDelimiter.length) : ''
      toolTrace = JSON.parse(jsonPart)
    } catch {
      toolTrace = { status: 'error', steps: [] }
    }
  }

  const isChatCard = message.role === 'assistant' && message.graphData?.view === 'chat'
  const displayContent =
    message.content === '...'
      ? ''
      : isChatCard && message.graphData?.content
        ? message.graphData.content
        : isToolTrace
          ? toolTraceText
          : message.content
  const optionsMap = message.graphData?.optionsMap || message.graphData?.options_map || {}
  const toolSteps =
    Array.isArray(message.toolSteps) && message.toolSteps.length > 0
      ? message.toolSteps
      : Array.isArray(toolTrace?.steps)
        ? toolTrace.steps
        : []
  const filteredActivities = (message.activities || []).filter(
    (a) => !a.toLowerCase().includes('running capability')
  )

  const displayActivities = filteredActivities
  const totalStagesCount = displayActivities.length + toolSteps.length
  const hasStageData = totalStagesCount > 0

  const unifiedSteps = useMemo(() => {
    const rawSteps: any[] = []

    // First, map Memory from activities
    const memoryActivities = displayActivities.filter((a) => a.toLowerCase().includes('memória:'))
    memoryActivities.forEach((act, originalIdx) => {
      rawSteps.push({
        isMemory: true,
        name: act
          .replace(/memória:/i, '')
          .replace(/\.\.\.$/, '')
          .trim(),
        originalIdx,
        status: 'done',
        segment: 0
      })
    })

    // Then, map actual tool steps
    toolSteps.forEach((step, originalIdx) => {
      let isSkill = false
      let displayName = String(step.name || 'tool')

      if (displayName === 'activate_skill') {
        isSkill = true
        try {
          const parsedQuery = JSON.parse(step.query)
          displayName = `Lendo habilidade de ${parsedQuery.skill_id}`
        } catch {
          displayName = 'Adquirindo nova habilidade'
        }
      } else {
        displayName = humanizeToolName(displayName)
      }

      rawSteps.push({
        isMemory: false,
        name: displayName,
        rawName: step.name,
        isSkill,
        step,
        status: step.status,
        originalIdx,
        segment: step.segment || 0
      })
    })

    // Grouping identically-named tools if they are adjacent
    const grouped: any[] = []
    for (const item of rawSteps) {
      if (grouped.length === 0) {
        grouped.push({ ...item, count: 1, usages: item.isMemory ? [] : [item.step] })
        continue
      }
      const last = grouped[grouped.length - 1]
      // Condition to group
      if (
        !item.isMemory &&
        !last.isMemory &&
        item.name === last.name &&
        item.segment === last.segment
      ) {
        last.count += 1
        last.usages.push(item.step)
        // update status to running if any is running
        if (item.status === 'running') last.status = 'running'
      } else {
        grouped.push({ ...item, count: 1, usages: item.isMemory ? [] : [item.step] })
      }
    }

    return grouped
  }, [displayActivities, toolSteps])

  const displayContentStr = String(displayContent || '')
  const ACTION_MARKER = '__MOMAI_ACTIONS__'
  const hasMarker = displayContentStr.includes(ACTION_MARKER)

  const [isThinkingOpen, setIsThinkingOpen] = useState(false)

  // Function to extract <think> tags from text
  const processThinkTags = (text: string) => {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g
    let match
    const thoughts: string[] = []
    let cleanText = text

    while ((match = thinkRegex.exec(text)) !== null) {
      thoughts.push(match[1].trim())
    }

    cleanText = text.replace(thinkRegex, '').trim()
    return { thoughts, cleanText }
  }

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

  const isFinalizing = (message.activities || []).some((a) =>
    a.toLowerCase().includes('finalizando resposta')
  )
  const hasActualContent = message.content !== '...' && message.content.length > 0 && !isToolTrace
  const toolsFinished = hasActualContent || (hasMarker && (finalResponseText?.length ?? 0) > 0)

  // Efeito para gerenciar a abertura/fechamento automático das fontes
  useEffect(() => {
    if (message.sources && message.sources.length > 0) {
      // 1. Abrir fontes se elas acabaram de chegar e ainda não estamos finalizando a resposta
      if (isLoading && !isFinalizing) {
        if (message.sources.length <= revealedSources) {
          setRevealedSources(0)
        }
      }
      // 2. Minimizar fontes se a resposta começou a ser finalizada ou o carregamento parou
      else if (isFinalizing || !isLoading) {
        setOpenSources(false)
      }
    }
  }, [message.sources?.length, isLoading, isFinalizing])

  useEffect(() => {
    if (isLoading && message.sources && message.sources.length > 0) {
      setRevealedSources(message.sources.length)
    }
  }, [message.sources, isLoading])

  // Track start time for running steps
  useEffect(() => {
    const newStartTimes: Record<number, number> = {}
    toolSteps.forEach((step, idx) => {
      if (step.status === 'running') {
        if (!startTimesRef.current[idx]) {
          newStartTimes[idx] = Date.now()
        } else {
          newStartTimes[idx] = startTimesRef.current[idx]
        }
      }
    })
    if (Object.keys(newStartTimes).length > 0) {
      startTimesRef.current = { ...startTimesRef.current, ...newStartTimes }
    }
  }, [toolSteps])

  // Update elapsed seconds every second (only works if toolSteps were populated, which they're not currently)
  useEffect(() => {
    if (toolSteps.length === 0) return
    const hasRunningStep = toolSteps.some((s) => s.status === 'running')
    if (!hasRunningStep) return
    const interval = setInterval(() => {
      const newElapsed: Record<number, number> = {}
      toolSteps.forEach((step, idx) => {
        if (step.status === 'running' && startTimesRef.current[idx]) {
          newElapsed[idx] = Math.floor((Date.now() - startTimesRef.current[idx]) / 1000)
        }
      })
      if (Object.keys(newElapsed).length > 0) {
        setElapsedSeconds((prev) => ({ ...prev, ...newElapsed }))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [toolSteps])

  const minimizeText = (value: unknown, max = 180) => {
    if (value === null || value === undefined) return ''
    const text = String(value).replace(/\s+/g, ' ').trim()
    if (text.length <= max) return text
    return `${text.slice(0, max)}...`
  }

  const humanizeActivity = (activity: string) => {
    const lower = activity.toLowerCase()
    if (lower.includes('especialista: executando')) {
      return activity.replace(/especialista: executando/i, '').trim()
    }
    if (lower.includes('manager: delegando')) {
      return activity
        .replace(/manager: delegando para especialista/i, '')
        .replace(/[()]/g, '')
        .trim()
    }
    if (lower.includes('manager: chamando ferramenta')) {
      return activity.replace(/manager: chamando ferramenta/i, '').trim()
    }
    if (lower.includes('manager: finalizando')) {
      return activity.replace(/manager: finalizando resposta/i, '').trim()
    }
    if (lower.includes('discovery:')) {
      return activity.replace(/discovery:/i, '').trim()
    }
    if (lower.includes('buscando')) {
      return activity
    }
    return ''
  }

  return (
    <div
      onContextMenu={handleContextMenu}
      className={`flex items-start gap-3 sm:gap-4 max-w-full group ${message.role === 'assistant' ? 'self-start w-full' : 'self-end flex-row-reverse ml-12'}`}
    >
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isUser={message.role === 'user'}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onSpeak={onSpeak || (() => {})}
          onDelete={onDelete || (() => {})}
          onRetry={onRetry}
          showSpeak={aiTier !== 'lite'}
        />
      )}
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
              <img src={icon} alt="MomAI" className="w-full h-full object-cover" />
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
            EU
          </div>
        )}
      </div>

      <div
        className={`relative break-words overflow-hidden min-w-0 max-w-full transition-all duration-300 ${
          message.role === 'assistant'
            ? 'flex-1 pt-0.5 text-text text-[15px] sm:text-[16px] leading-relaxed message'
            : 'bg-zinc-100 dark:bg-[#282A2C] p-3 px-4 rounded-lg rounded-tr-none text-text text-[15px] sm:text-[16px] message'
        }`}
      >
        <div className="flex flex-col gap-0 transition-all duration-300 overflow-hidden">
          {/* Thinking Block */}
          {allThoughts.length > 0 && (
            <div className="think-container animate-in fade-in slide-in-from-top-2 duration-500">
              <button
                type="button"
                onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                className="think-header w-full text-[15px]"
              >
                <div className="flex items-center gap-2 flex-1">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-text/30"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Pensamento</span>
                </div>
                <svg
                  width="12"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className={`text-text/30 transition-transform duration-300 ${isThinkingOpen ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isThinkingOpen && (
                <div className="think-content animate-in fade-in zoom-in-95 duration-300">
                  {allThoughts.map((thought, i) => (
                    <div key={i} className={i > 0 ? 'mt-4 pt-4 border-t border-white/5' : ''}>
                      <Markdown>{thought}</Markdown>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Renderização em Segmentos (Texto e Ações Intercalados) */}
          {processedParts.map((part, segmentIdx) => {
            const segmentSteps = unifiedSteps.filter((s: any) => (s.segment || 0) === segmentIdx)
            const isLastPart = segmentIdx === processedParts.length - 1
            const hasSegmentData = segmentSteps.length > 0
            const showLoadingStatus = isLastPart && isLoading && !toolsFinished
            const hasGlobalExtras =
              isLastPart && (message.snippets?.length || message.cards?.length)
            const hasSources = isLastPart && message.sources && message.sources.length > 0
            const showActionsContainer =
              message.role === 'assistant' &&
              (hasSegmentData || showLoadingStatus || hasSources || hasGlobalExtras)

            return (
              <React.Fragment key={`segment-${segmentIdx}`}>
                {/* 1. Bloco de Ações para este segmento (Agora em cima) */}
                {showActionsContainer && (
                  <div className="flex flex-col gap-0.5 mb-1">
                    {/* Render Extras (Snippets/Cards) - Only on the first segment or if it's the only one */}
                    {hasGlobalExtras && (
                      <div className="mt-2 text-zinc-800 dark:text-zinc-200">
                        <ExtrasRenderer
                          snippets={message.snippets}
                          cards={message.cards}
                          isLoading={isLoading}
                        />
                      </div>
                    )}

                    {/* Status de Execução Genérico */}
                    {showLoadingStatus &&
                      !hasSegmentData &&
                      (() => {
                        const searchActivity = displayActivities.find((a) =>
                          a.toLowerCase().includes('buscando')
                        )
                        const toolActivity = displayActivities.find((a) =>
                          a.toLowerCase().includes('chamando')
                        )
                        const label = searchActivity
                          ? 'Buscando...'
                          : toolActivity
                            ? toolActivity.replace(/manager: chamando ferramenta/i, '').trim() +
                              '...'
                            : displayActivities.length > 0
                              ? 'Executando...'
                              : 'Pensando...'
                        return (
                          <div className="flex items-center gap-1.5 mt-1 min-h-[16px]">
                            <span className="text-[13px] text-zinc-400 animate-pulse">{label}</span>
                          </div>
                        )
                      })()}

                    {/* Lista de Ações (Tools e Memória em blocos separados) */}
                    {hasSegmentData && (
                      <div className="flex flex-col mt-0.5 mb-0 gap-1.5">
                        {(() => {
                          const memSteps = segmentSteps.filter((s: any) => s.isMemory)
                          const tSteps = segmentSteps.filter((s: any) => !s.isMemory)

                          return (
                            <>
                              {/* BLOCO DE MEMÓRIA */}
                              {memSteps.length > 0 && (
                                <div className="flex flex-col">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMemoryBlockExpanded((prev) => ({
                                        ...prev,
                                        [segmentIdx]: !prev[segmentIdx]
                                      }))
                                    }
                                    className="flex items-center gap-2 text-[15px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors self-start mb-0.5"
                                  >
                                    <span>Analisando o sistema de notas</span>
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      className={`transition-transform duration-200 ${memoryBlockExpanded[segmentIdx] ? 'rotate-180' : ''}`}
                                    >
                                      <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                  </button>

                                  <div
                                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out origin-top ${memoryBlockExpanded[segmentIdx] ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                  >
                                    <div className="overflow-hidden">
                                      <div className="flex flex-col ml-1 relative">
                                        <div className="absolute left-[7px] top-4 bottom-6 w-[2px] bg-zinc-200 dark:bg-white/10 rounded-full"></div>
                                        {memSteps.map((group, idx) => (
                                          <div
                                            key={`mem-${segmentIdx}-${idx}`}
                                            className="flex items-start gap-4 mb-5 relative group z-10 animate-in fade-in duration-300"
                                          >
                                            <div className="mt-0.5 w-[16px] h-[16px] rounded flex items-center justify-center flex-shrink-0 bg-card border border-purple-300 dark:border-purple-500/50 text-purple-500 z-10">
                                              <DocumentTextIcon className="w-2.5 h-2.5" />
                                            </div>
                                            <div className="flex flex-col min-w-0 pt-[1px] w-full">
                                              <span className="text-[13px] font-medium tracking-wide text-zinc-700 dark:text-zinc-300">
                                                Memória: {group.name}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* BLOCO DE FERRAMENTAS (O "Executou n comandos") */}
                              <div className="flex flex-col">
                                {tSteps.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setToolsBlockExpanded((prev) => ({
                                        ...prev,
                                        [segmentIdx]: !prev[segmentIdx]
                                      }))
                                    }
                                    className="flex items-center gap-2 text-[15px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors self-start mb-0.5"
                                  >
                                    <span>
                                      {(() => {
                                        const isRunning = tSteps.some(
                                          (s: any) => s.status === 'running'
                                        )
                                        const skillName = message.activeSkill
                                          ? ` usando ${humanizeToolName(message.activeSkill)}`
                                          : ''
                                        const count = tSteps.length
                                        const verb = isRunning ? 'Executando' : 'Executou'
                                        return `${verb} ${count} comando${count > 1 ? 's' : ''}${skillName}${isRunning ? '...' : ''}`
                                      })()}
                                    </span>
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      className={`transition-transform duration-200 ${toolsBlockExpanded[segmentIdx] || tSteps.some((s: any) => s.status === 'running') ? 'rotate-180' : ''}`}
                                    >
                                      <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                  </button>
                                )}

                                <div
                                  className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out origin-top ${toolsBlockExpanded[segmentIdx] || tSteps.some((s: any) => s.status === 'running') ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                >
                                  <div className="overflow-hidden">
                                    <div className="flex flex-col ml-1 relative">
                                      <div className="absolute left-[7px] top-4 bottom-4 w-[2px] bg-zinc-200 dark:bg-white/10 rounded-full"></div>

                                      {tSteps.map((group, idx) => (
                                        <div
                                          key={`step-${segmentIdx}-${idx}`}
                                          className="flex items-start gap-4 mb-5 relative group z-10 animate-in fade-in duration-300"
                                        >
                                          <div
                                            className={`mt-0.5 w-[16px] h-[16px] rounded flex items-center justify-center flex-shrink-0 bg-card border ${group.status === 'running' ? 'border-blue-400 text-blue-500' : 'border-zinc-300 dark:border-white/20 text-zinc-500 dark:text-zinc-400'} z-10`}
                                          >
                                            {group.status === 'running' ? (
                                              <svg
                                                className="w-2.5 h-2.5 animate-spin"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="3"
                                              >
                                                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                                              </svg>
                                            ) : (
                                              <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.5"
                                              >
                                                <polyline points="4 17 10 11 4 5"></polyline>
                                                <line x1="12" y1="19" x2="20" y2="19"></line>
                                              </svg>
                                            )}
                                          </div>
                                          <div className="flex flex-col min-w-0 pt-[1px] w-full">
                                            <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                                              {group.name}
                                            </span>
                                          </div>
                                        </div>
                                      ))}

                                      {/* Fontes integradas (Móvido para DENTRO da lista principal para visual vertical) */}
                                      {isLastPart &&
                                        message.sources &&
                                        message.sources.length > 0 && (
                                          <div className="flex items-start gap-4 mb-5 relative z-10 animate-in fade-in duration-300">
                                            <div className="mt-0.5 w-[16px] h-[16px] rounded flex items-center justify-center flex-shrink-0 bg-card border border-zinc-300 dark:border-white/20 text-zinc-500 dark:text-zinc-400 z-10">
                                              <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.5"
                                              >
                                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                              </svg>
                                            </div>
                                            <div className="flex flex-col min-w-0 pt-[1px]">
                                              <button
                                                type="button"
                                                onClick={() => setOpenSources(!openSources)}
                                                className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-accent flex items-center gap-1.5"
                                              >
                                                Fontes ({message.sources.length})
                                                <svg
                                                  width="8"
                                                  height="8"
                                                  viewBox="0 0 24 24"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  strokeWidth="3"
                                                  className={`transition-transform duration-200 ${openSources ? 'rotate-180' : ''}`}
                                                >
                                                  <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                              </button>
                                              {openSources && (
                                                <div className="mt-1 flex flex-col gap-1">
                                                  {message.sources.map((s, idx) => (
                                                    <a
                                                      key={idx}
                                                      href={s.url}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      className="text-[12px] text-blue-500 hover:underline"
                                                    >
                                                      {cleanUIMetadata(s.title || s.url)}
                                                    </a>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                      {/* Finalizador */}
                                      {tSteps.every((s: any) => s.status !== 'running') && (
                                        <div className="flex items-center gap-4 mt-1 relative z-10">
                                          <div className="w-[16px] h-[16px] rounded-full flex items-center justify-center flex-shrink-0 border-[1.5px] border-zinc-400 text-zinc-500 ml-[0.5px]">
                                            <svg
                                              width="8"
                                              height="8"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="3"
                                            >
                                              <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                          </div>
                                          <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">
                                            Concluído
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* 1.5. Structured Response (from skill) */}
                {isLastPart && message.structuredResponse && (
                  <div className="transition-all duration-500 animate-in fade-in py-0.5">
                    <StructuredResponseRenderer response={message.structuredResponse} />
                  </div>
                )}

                {/* 2. Conteúdo do Texto (Markdown) (Agora embaixo) */}
                {part.cleanText && part.cleanText.length > 0 && (
                  <div className="transition-all duration-500 animate-in fade-in py-0.5">
                    <Markdown>{part.cleanText}</Markdown>
                  </div>
                )}
              </React.Fragment>
            )
          })}

          {/* 4. Rodapé de Opções */}
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
                    const label = optionsMap[option] || option
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

              <div className="flex flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                  {(hasActualContent || isSpeaking) && (
                    <>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors opacity-50 hover:opacity-100"
                        title="Copiar"
                        aria-label="Copiar resposta"
                      >
                        {isCopied ? (
                          <CheckIcon className="w-[14px] h-[14px] text-green-500" />
                        ) : (
                          <ClipboardIcon className="w-[14px] h-[14px]" />
                        )}
                      </button>

                      {onRetry && (
                        <button
                          type="button"
                          onClick={onRetry}
                          className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors opacity-50 hover:opacity-100"
                          title="Regerar resposta"
                          aria-label="Regerar resposta"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                          </svg>
                        </button>
                      )}

                      {onSpeak && aiTier !== 'lite' && !isSpeaking && (
                        <button
                          type="button"
                          onClick={onSpeak}
                          className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors opacity-50 hover:opacity-100"
                          title="Ouvir resposta"
                          aria-label="Ouvir resposta"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          </svg>
                        </button>
                      )}

                      {isSpeaking && onStopVoice && !hideStopButton && aiTier !== 'lite' && (
                        <button
                          type="button"
                          onClick={handleStopVoiceClick}
                          className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-red-500 dark:text-red-400 hover:text-red-600 transition-colors opacity-80 hover:opacity-100"
                          title="Parar voz"
                          aria-label="Parar voz"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <rect x="6" y="5" width="4" height="14" rx="1" />
                            <rect x="14" y="5" width="4" height="14" rx="1" />
                          </svg>
                        </button>
                      )}

                      <div className="w-[1px] h-3 bg-zinc-200 dark:bg-white/10 mx-0.5"></div>

                      <button
                        type="button"
                        onClick={handleReportResponse}
                        className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-red-500 transition-colors opacity-50 hover:opacity-100"
                        title={t('chat.report.title')}
                        aria-label={t('chat.report.title')}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                          <line x1="4" y1="22" x2="4" y2="15" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>


                {hasActualContent && showReportConfirm && (
                  <div className="w-full max-w-[320px] p-3 rounded-xl border border-border/20 bg-card/95 shadow-xl backdrop-blur-sm">
                    <p className="text-xs text-text-muted leading-relaxed">
                      {t('chat.report.message')}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCancelReport}
                        className="px-3 py-1.5 rounded-lg text-xs border border-border/20 bg-white/5 hover:bg-white/10 text-text-muted transition-colors"
                      >
                        {t('chat.report.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmReport}
                        className="px-3 py-1.5 rounded-lg text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 transition-colors"
                      >
                        {t('chat.report.confirm')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default MessageItem
