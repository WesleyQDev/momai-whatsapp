import { useState, useEffect, useRef } from 'react'
import { Message } from '../../../../services/api'
import { createUnifiedSteps, UnifiedStep, humanizeToolName } from '../utils'

interface UseMessageStateProps {
  message: Message
  isLoading: boolean
}

export interface MessageState {
  openToolIndex: Record<number, number | null>
  setOpenToolIndex: React.Dispatch<React.SetStateAction<Record<number, number | null>>>
  hideStopButton: boolean
  setHideStopButton: React.Dispatch<React.SetStateAction<boolean>>
  elapsedSeconds: Record<number, number>
  setElapsedSeconds: React.Dispatch<React.SetStateAction<Record<number, number>>>
  openSources: boolean
  setOpenSources: React.Dispatch<React.SetStateAction<boolean>>
  revealedSources: number
  setRevealedSources: React.Dispatch<React.SetStateAction<number>>
  contextMenu: { x: number; y: number } | null
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
  showReportConfirm: boolean
  setShowReportConfirm: React.Dispatch<React.SetStateAction<boolean>>
  isCopied: boolean
  setIsCopied: React.Dispatch<React.SetStateAction<boolean>>
  toolsBlockExpanded: Record<number, boolean>
  setToolsBlockExpanded: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
  memoryBlockExpanded: Record<number, boolean>
  setMemoryBlockExpanded: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
  toolsActive: Record<number, boolean>
  setToolsActive: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
  isThinkingOpen: boolean
  setIsThinkingOpen: React.Dispatch<React.SetStateAction<boolean>>
  unifiedSteps: UnifiedStep[]
  toolSteps: any[]
  displayActivities: string[]
  isToolTrace: boolean
  toolTrace: any
  toolTraceText: string
  displayContent: string
  optionsMap: Record<string, string>
  isFinalizing: boolean
  hasActualContent: boolean
  toolsFinished: boolean
  isChatCard: boolean
  isSystemModelChange: boolean
  isDone: boolean
}

export const useMessageState = ({ message, isLoading }: UseMessageStateProps): MessageState => {
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
  const [isThinkingOpen, setIsThinkingOpen] = useState(false)
  const startTimesRef = useRef<Record<number, number>>({})

  // Resolve fluttering for tools block expander state
  useEffect(() => {
    if (!message.toolSteps) return

    const activeSegments: Record<number, boolean> = {}

    const segments = new Set(message.toolSteps.map((s: any) => s.segment || 0))

    Array.from(segments).forEach((segmentIdx) => {
      const segmentSteps = message.toolSteps!.filter((s: any) => (s.segment || 0) === segmentIdx)
      const hasRunningStep = segmentSteps.some((s: any) => s.status === 'running')
      const isWaitingForFirstText =
        isLoading && (!message.content || message.content.length === 0) && segmentIdx === 0

      activeSegments[segmentIdx] = hasRunningStep || isWaitingForFirstText
    })

    setToolsActive(activeSegments)

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

  // Efeito para gerenciar abertura/fechamento automático das fontes
  useEffect(() => {
    if (message.sources && message.sources.length > 0) {
      const isFinalizing = (message.activities || []).some((a) =>
        a.toLowerCase().includes('finalizando resposta')
      )

      if (isLoading && !isFinalizing) {
        if (message.sources.length <= revealedSources) {
          setRevealedSources(0)
        }
      } else if (isFinalizing || !isLoading) {
        setOpenSources(false)
      }
    }
  }, [message.sources?.length, isLoading])

  useEffect(() => {
    if (isLoading && message.sources && message.sources.length > 0) {
      setRevealedSources(message.sources.length)
    }
  }, [message.sources, isLoading])

  // Track start time for running steps
  useEffect(() => {
    const toolSteps = Array.isArray(message.toolSteps) ? message.toolSteps : []
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
  }, [message.toolSteps])

  // Update elapsed seconds every second
  useEffect(() => {
    const toolSteps = Array.isArray(message.toolSteps) ? message.toolSteps : []
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
  }, [message.toolSteps])

  // Message analysis
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
  const isFinalizing = (message.activities || []).some((a) =>
    a.toLowerCase().includes('finalizando resposta')
  )
  const hasActualContent = message.content !== '...' && message.content.length > 0 && !isToolTrace
  const toolsFinished = hasActualContent

  const unifiedSteps = createUnifiedSteps(displayActivities, toolSteps, humanizeToolName)

  return {
    openToolIndex,
    setOpenToolIndex,
    hideStopButton,
    setHideStopButton,
    elapsedSeconds,
    setElapsedSeconds,
    openSources,
    setOpenSources,
    revealedSources,
    setRevealedSources,
    contextMenu,
    setContextMenu,
    showReportConfirm,
    setShowReportConfirm,
    isCopied,
    setIsCopied,
    toolsBlockExpanded,
    setToolsBlockExpanded,
    memoryBlockExpanded,
    setMemoryBlockExpanded,
    toolsActive,
    setToolsActive,
    isThinkingOpen,
    setIsThinkingOpen,
    unifiedSteps,
    toolSteps,
    displayActivities,
    isToolTrace,
    toolTrace,
    toolTraceText,
    displayContent,
    optionsMap,
    isFinalizing,
    hasActualContent,
    toolsFinished,
    isChatCard,
    isSystemModelChange,
    isDone
  }
}
