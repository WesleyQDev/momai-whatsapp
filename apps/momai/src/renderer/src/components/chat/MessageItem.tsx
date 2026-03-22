import { JSX, memo, useEffect, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from '../../services/api'
import { cleanMomaiActions } from '../../utils/text'

// Helper to clean markdown and technical tags from snippets/titles for a cleaner UI
const cleanUIMetadata = (text: string) => {
  if (!text) return ''
  return text
    .replace(/[#*`_~>\[\]\(\)]/g, '') // Remove markdown symbols
    .replace(/Nota:/i, '')            // Remove redundant 'Nota:'
    .replace(/\s+/g, ' ')            // Normalize spaces
    .trim()
}
import icon from '../../assets/icon.png'
import { DocumentTextIcon, ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline'
import { ExtrasRenderer } from './ExtrasRenderer'
import MessageContextMenu from './MessageContextMenu'
import { useI18n } from '../../i18n'
import { DynamicRenderer } from '../DynamicRenderer'

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
          {copied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardIcon className="w-4 h-4" />}
        </button>
      </div>
      <pre className={className}>
        {children}
      </pre>
    </div>
  )
}

const Markdown = ({ children, components = {} }: { children: string; components?: any }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ node, ...props }) => <CodeBlock {...props} />,
        table: ({ node, ...props }) => (
          <div className="overflow-x-auto my-4 scrollbar-thin">
            <table
              className="min-w-full border-collapse border border-border/20 rounded-lg overflow-hidden"
              {...props}
            />
          </div>
        ),
        thead: ({ node, ...props }) => <thead className="bg-white/5" {...props} />,
        th: ({ node, ...props }) => (
          <th
            className="px-4 py-2.5 text-left text-[10px] font-black text-accent/90 uppercase tracking-widest border border-border/10"
            {...props}
          />
        ),
        td: ({ node, ...props }) => (
          <td
            className="px-4 py-2 text-sm text-text-muted border border-border/10"
            {...props}
          />
        ),
        tr: ({ node, ...props }) => (
          <tr className="hover:bg-white/[0.02] transition-colors" {...props} />
        ),
        ...components
      }}
    >
      {children}
    </ReactMarkdown>
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
  const [showTrace, setShowTrace] = useState(true)
  const [showToolDetails, setShowToolDetails] = useState(true)
  const [openToolIndex, setOpenToolIndex] = useState<number | null>(null)
  const [hideStopButton, setHideStopButton] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState<Record<number, number>>({})
  const [openSources, setOpenSources] = useState(false)
  const [revealedSources, setRevealedSources] = useState<number>(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showReportConfirm, setShowReportConfirm] = useState(false)
  const startTimesRef = useRef<Record<number, number>>({})

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
  const toolSteps = Array.isArray(toolTrace?.steps) ? toolTrace.steps : []
  const filteredActivities = (message.activities || []).filter(
    (a) => !a.toLowerCase().includes('running capability')
  )

  const displayActivities = filteredActivities
  const totalStagesCount = displayActivities.length + toolSteps.length
  const hasStageData = totalStagesCount > 0

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
  const processedParts = textParts.map(part => processThinkTags(part))
  
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
        setOpenSources(true)
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

  // Compute if trace should be visible - show when loading and has stages, or when explicitly shown
  const shouldShowTrace = (isLoading && hasStageData) || showTrace

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

  const humanizeToolName = (name: string) => {
    const lower = (name || '').toLowerCase()
    if (lower.includes('duckduckgo') || lower.includes('search')) return 'Busca na web'
    if (lower.includes('reminder')) return 'Lembretes'
    if (lower.includes('interface')) return 'Interface'
    return name || 'Ferramenta'
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
    if (lower.includes('usando skill:')) {
      return activity.replace(/usando skill:/i, '').trim()
    }
    if (lower.includes('usando ferramenta:')) {
      return activity.replace(/usando ferramenta:/i, '').trim()
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
                className="think-header w-full"
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
                  width="10"
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

          {/* 1. Aviso Inicial */}
          {introText && (
            <div
              className={`transition-all duration-500 ${hasStageData || isLoading ? 'mb-2' : ''} animate-in fade-in`}
            >
              <Markdown>{introText}</Markdown>
            </div>
          )}

          {/* Área de Ações - Skills, Tools e Sources integrados */}
          {message.role === 'assistant' && (hasStageData || isLoading) && (
            <div className="flex flex-col gap-1 mb-2">
              {/* Skills, Tools e Sources - todos inline juntos */}
              {(displayActivities.filter((a) => {
                const lower = a.toLowerCase()
                return (
                  lower.includes('especialista: executando') ||
                  lower.includes('manager: chamando ferramenta') ||
                  lower.includes('memória:')
                )
              }).length > 0 ||
                (message.sources && message.sources.length > 0)) && (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center animate-in slide-in-from-left-2 fade-in duration-300">
                  {/* Skills/Tools inline */}
                  {displayActivities
                    .filter((a) => {
                      const lower = a.toLowerCase()
                      return (
                        lower.includes('especialista: executando') ||
                        lower.includes('manager: chamando ferramenta') ||
                        lower.includes('memória:')
                      )
                    })
                    .map((activity, idx) => {
                      const lower = activity.toLowerCase()
                      const isSkill = lower.includes('especialista: executando')
                      const isMemory = lower.includes('memória:')

                      let name = ''
                      let prefix = 'Tool: '

                      if (isSkill) {
                        const rawName = activity
                          .replace(/especialista: executando/i, '')
                          .replace(/\.\.\.$/, '')
                          .trim()
                        
                        // Humanização escalável sem hardcode: remove underscores e capitaliza
                        name = rawName
                          .split('_')
                          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                          .join(' ')
                        prefix = 'Acessando Skill: '
                      } else if (isMemory) {
                        name = activity
                          .replace(/memória:/i, '')
                          .replace(/\.\.\.$/, '')
                          .trim()
                        prefix = 'Memória: '
                      } else {
                        const rawName = activity
                          .replace(/manager: chamando ferramenta/i, '')
                          .replace(/\.\.\.$/, '')
                          .trim()
                        
                        // Humanização generalista também para ferramentas
                        name = rawName
                          .split('_')
                          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                          .join(' ')
                        prefix = 'Usando: '
                      }

                      return (
                        <span
                          key={`activity-${idx}`}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500"
                        >
                          <DocumentTextIcon
                            className={`w-3 h-3 ${isMemory ? 'text-purple-500' : 'text-blue-500'}`}
                          />
                          {prefix}
                          {name}
                        </span>
                      )
                    })}

                  {/* Fontes inline */}
                  {message.sources && message.sources.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenSources(!openSources)}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-zinc-400"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <span>Fontes ({message.sources.length})</span>
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className={`text-zinc-400 transition-transform duration-200 ${openSources ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Sources expandidas - inline e minimalista */}
              {message.sources && message.sources.length > 0 && openSources && (
                <div className="mt-2 p-3 border border-zinc-200 dark:border-zinc-700/50 rounded-md animate-in fade-in duration-300">
                  <div className="flex flex-col gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                  {message.sources.map((source, idx) => {
                    const isRevealed = idx < revealedSources
                    const isNote = source.url.startsWith('momai://note/')
                    const urlObj = (() => {
                      if (isNote) return null
                      try {
                        return new URL(source.url)
                      } catch {
                        return null
                      }
                    })()
                    const domain = isNote
                      ? 'Memória Local'
                      : urlObj
                        ? urlObj.hostname.replace('www.', '')
                        : source.url
                    const hasValidTitle =
                      source.title && source.title.length > 3 && source.title !== domain
                    const displayTitle = hasValidTitle ? source.title : domain

                    if (!isRevealed) {
                      if (isLoading && idx === revealedSources) {
                        return (
                          <span key={`placeholder-${idx}`} className="text-zinc-600 dark:text-zinc-500 animate-pulse">
                            Buscando...
                          </span>
                        )
                      }
                      return null
                    }

                    const cleanTitle = cleanUIMetadata(displayTitle)

                    if (isNote) {
                      return (
                        <span
                          key={`${source.url}-${idx}`}
                          className="animate-in fade-in duration-300"
                          style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'both' }}
                        >
                          📄 Consulta na Anotação "<span className="text-purple-400 font-medium">{cleanTitle}</span>"
                        </span>
                      )
                    }

                    return (
                      <a
                        key={`${source.url}-${idx}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 hover:text-accent transition-colors animate-in fade-in duration-300"
                        style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'both' }}
                      >
                        <span className="text-zinc-600 dark:text-zinc-500">↗</span>
                        <span className="hover:underline underline-offset-2">{cleanTitle}</span>
                        <span className="text-zinc-600 dark:text-zinc-600 text-[11px]">({domain})</span>
                      </a>
                    )
                  })}
                  </div>
                </div>
              )}

              {/* Snippets and Cards from Skills - use ExtrasRenderer for all extras */}
              {(message.snippets?.length || message.cards?.length) && (
                <div className="mt-2">
                  <ExtrasRenderer
                    snippets={message.snippets}
                    cards={message.cards}
                    isLoading={isLoading}
                  />
                </div>
              )}

              {/* Status de Execução - minimalista */}
              {isLoading &&
                !toolsFinished &&
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
                      ? toolActivity.replace(/manager: chamando ferramenta/i, '').trim() + '...'
                      : displayActivities.length > 0
                        ? 'Executando...'
                        : 'Pensando...'
                  return (
                    <div className="flex items-center gap-1.5 mt-1 min-h-[16px]">
                      <span className="text-[11px] text-zinc-400 animate-pulse">{label}</span>
                    </div>
                  )
                })()}

              {/* Cards de Ferramentas - mais compactos */}
              {toolSteps.length > 0 && (
                <div className="flex flex-col gap-1 mt-0.5">
                  {toolSteps.map((step, idx) => {
                    const toolName = String(step.name || 'tool')
                    const isRunning = step.status === 'running'
                    const isExpanded = openToolIndex === idx || isRunning
                    return (
                      <div
                        key={`tool-${idx}`}
                        className={`flex flex-col rounded-lg border transition-all duration-500 ${isRunning ? 'border-blue-500/30 bg-blue-500/[0.03]' : 'border-zinc-200 dark:border-white/5 bg-zinc-500/[0.01]'}`}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenToolIndex(openToolIndex === idx ? null : idx)}
                          className="flex items-center justify-between px-2.5 py-2 text-left group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-all duration-300 ${isRunning ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'bg-white dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-400'}`}
                            >
                              {isRunning ? (
                                <svg
                                  className="w-2 h-2 animate-spin"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="4"
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
                                  strokeWidth="3"
                                >
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span
                                className={`text-[9px] font-bold uppercase tracking-wider ${isRunning ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-400'}`}
                              >
                                {humanizeToolName(toolName)}
                              </span>
                              {isRunning && (
                                <span className="text-[7px] text-blue-500/60 font-bold animate-pulse">
                                  {elapsedSeconds[idx] || 0}s
                                </span>
                              )}
                            </div>
                          </div>
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="4"
                            className={`text-zinc-300 dark:text-white/10 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                          >
                            <polyline points="9 6 15 12 9 18"></polyline>
                          </svg>
                        </button>
                        {isExpanded && (
                          <div className="px-2.5 pb-2 pt-0.5 flex flex-col gap-2 animate-in fade-in duration-300">
                            {step.query && (
                              <div className="flex flex-col gap-0.5 ml-7">
                                <span className="text-[6px] font-black uppercase tracking-[0.2em] text-zinc-400/40">
                                  Input
                                </span>
                                <div className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-mono border-l border-zinc-200 dark:border-white/10 pl-2 break-words">
                                  {step.query}
                                </div>
                              </div>
                            )}
                            {step.result && (
                              <div className="flex flex-col gap-0.5 ml-7">
                                <span className="text-[6px] font-black uppercase tracking-[0.2em] text-zinc-400/40">
                                  Output
                                </span>
                                <div className="text-[9px] text-zinc-400/70 dark:text-zinc-500 leading-relaxed font-mono border-l border-zinc-200 dark:border-white/10 pl-2 break-words">
                                  {minimizeText(step.result, 300)}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. Resposta Final */}
          {finalResponseText && (
            <div className="transition-all duration-500 animate-in fade-in">
              <Markdown>{finalResponseText}</Markdown>
            </div>
          )}

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
              {message.graphData && message.graphData.view === 'side' && message.graphData.content && (
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
                  {hasActualContent && (
                    <button
                      type="button"
                      onClick={handleReportResponse}
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 border border-border/20 text-[12px] text-text-muted/80 hover:text-red-500 transition-colors"
                      title={t('chat.report.title')}
                      aria-label={t('chat.report.title')}
                    >
                      <span aria-hidden="true">🚩</span>
                    </button>
                  )}

                  {isSpeaking && onStopVoice && !hideStopButton && aiTier !== 'lite' && (
                    <button
                      type="button"
                      onClick={handleStopVoiceClick}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all animate-pulse"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                      <span className="text-[10px] font-semibold">Parar</span>
                    </button>
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
