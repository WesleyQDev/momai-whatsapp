import { useMemo, useCallback, useState, useRef, useEffect, useLayoutEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { PanelRightClose, ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react'
import { NoteSummary } from '../../../services/api'
import { useNoteGraphData } from '../hooks/useNoteGraphData'

const COLORS = {
  bg: '#16161a',
  node: '#cbd5e1',
  nodeActive: '#a78bfa',
  nodeDimmed: '#475569',
  nodeText: '#94a3b8',
  link: '#334155'
}

interface RightPanelProps {
  content: string
  notes: NoteSummary[]
  onExpandGraph: () => void
  width: number
  onResize: (width: number) => void
  isCollapsed: boolean
  onToggle: () => void
}

export default function RightPanel({
  content,
  notes,
  onExpandGraph,
  width,
  isCollapsed,
  onToggle,
  onResize
}: RightPanelProps) {
  const graphRef = useRef<any>(null)
  const graphContainerRef = useRef<HTMLDivElement>(null)
  const [graphRatio, setGraphRatio] = useState(0.45)
  const [graphDims, setGraphDims] = useState({ width: 0, height: 0 })
  const { graphData } = useNoteGraphData(notes)

  useLayoutEffect(() => {
    const el = graphContainerRef.current
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setGraphDims({ width: rect.width, height: rect.height })
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const [animStartTime, setAnimStartTime] = useState(() => Date.now())
  const [animElapsed, setAnimElapsed] = useState(0)

  useEffect(() => {
    let frameId: number
    const loop = () => {
      const elapsed = Date.now() - animStartTime
      setAnimElapsed(elapsed)
      if (elapsed < 1800) {
        frameId = requestAnimationFrame(loop)
      }
    }
    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [animStartTime])

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D) => {
      const rawLabel = node.title || ''
      const label = rawLabel.length > 20 ? rawLabel.slice(0, 18) + '…' : rawLabel
      const baseRadius = Math.max(2.5, (node.val || 1) * 2)

      // Sequential Timeline Animation (Second Brain effect)
      const nodeIndex = graphData.nodes.findIndex((n) => n.id === node.id)
      const totalNodes = Math.max(1, graphData.nodes.length)
      const nodeDelayMs = (nodeIndex / totalNodes) * 1000
      const nodeAgeMs = animElapsed - nodeDelayMs

      if (nodeAgeMs <= 0) return

      const scaleProgress = Math.min(1, nodeAgeMs / 250)
      const easeProgress = 1 - Math.pow(1 - scaleProgress, 3)

      const nodeRadius = baseRadius * easeProgress
      const isConnected = (node.val || 1) > 1

      ctx.beginPath()
      ctx.arc(node.x || 0, node.y || 0, nodeRadius, 0, 2 * Math.PI, false)
      ctx.fillStyle = isConnected ? COLORS.nodeActive : COLORS.node
      ctx.fill()

      if (scaleProgress >= 0.7 && label) {
        const fontSize = 8.5
        ctx.font = `${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = COLORS.nodeText
        ctx.fillText(label, node.x || 0, (node.y || 0) + nodeRadius + 2)
      }
    },
    [graphData.nodes, animElapsed]
  )

  useEffect(() => {
    if (graphRef.current) {
      const charge = graphRef.current.d3Force('charge')
      if (charge) charge.strength(-25).distanceMax(150)
      const center = graphRef.current.d3Force('center')
      if (center) center.strength(0.8)
      const link = graphRef.current.d3Force('link')
      if (link) {
        link.distance(35)
        link.strength(0.5)
      }
    }
  }, [graphData.nodes.length, graphData.links.length])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    if (graphDims.width > 0 && graphDims.height > 0 && graphRef.current) {
      const nodeCount = graphData.nodes.length
      const adaptivePadding = Math.max(35, Math.min(130, 35 + nodeCount * 4))
      timer = setTimeout(() => {
        graphRef.current?.zoomToFit(400, adaptivePadding)
      }, 150)
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [graphDims, graphData.nodes.length])

  const zoomIn = useCallback(() => graphRef.current?.zoom(graphRef.current.zoom() * 1.3, 200), [])
  const zoomOut = useCallback(() => graphRef.current?.zoom(graphRef.current.zoom() / 1.3, 200), [])

  const headings = useMemo(() => {
    if (!content) return []
    const items: { level: number; text: string }[] = []
    const lines = content.split('\n')
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        items.push({ level: match[1].length, text: match[2].trim() })
      }
    }
    return items
  }, [content])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = width

      const handleMouseMove = (e: MouseEvent) => {
        const newWidth = Math.max(180, Math.min(500, startWidth - (e.clientX - startX)))
        onResize(newWidth)
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [width, onResize]
  )

  if (isCollapsed) return null

  return (
    <div
      className="border-l border-border/10 bg-sidebar flex flex-col shrink-0 relative select-none"
      style={{ width }}
      data-panel
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/20 transition-colors z-10"
        onMouseDown={handleMouseDown}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/10 shrink-0">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          Outline
        </h3>
      </div>

      {/* TOC Section */}
      <div
        className="overflow-y-auto custom-scrollbar px-2 py-2 space-y-0.5 min-h-0"
        style={{ flex: `${1 - graphRatio}` }}
      >
        {headings.length === 0 ? (
          <p className="text-[10px] text-text-muted/30 italic px-2 py-4 text-center">
            Sem cabeçalhos
          </p>
        ) : (
          headings.map((h, i) => (
            <div
              key={i}
              className="text-xs text-text-muted/60 truncate px-2 py-1 rounded hover:bg-white/5 hover:text-text transition-all cursor-pointer"
              style={{ paddingLeft: `${8 + (h.level - 1) * 14}px` }}
              title={h.text}
            >
              <span className="text-[9px] opacity-30 mr-1 font-mono">{'#'.repeat(h.level)}</span>
              {h.text}
            </div>
          ))
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border/10 mx-3" />

      {/* Vertical drag handle */}
      <div
        className="h-1 cursor-row-resize hover:bg-white/20 transition-colors shrink-0 mx-3 rounded-full"
        onMouseDown={(e) => {
          e.preventDefault()
          const startY = e.clientY
          const startRatio = graphRatio
          const container = (e.target as HTMLElement).closest('[data-panel]')
          if (!container) return

          const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect()
            const deltaY = startY - e.clientY
            const newRatio = Math.max(0.15, Math.min(0.85, startRatio + deltaY / rect.height))
            setGraphRatio(newRatio)
          }

          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
          }

          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        }}
      />

      {/* Graph Section */}
      <div className="px-3 py-3 overflow-hidden flex flex-col" style={{ flex: `${graphRatio}` }}>
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
            Grafo
          </h3>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setAnimStartTime(Date.now())
                if (graphRef.current) {
                  const nodeCount = graphData.nodes.length
                  const adaptivePadding = Math.max(35, Math.min(130, 35 + nodeCount * 4))
                  graphRef.current.d3ReheatSimulation()
                  graphRef.current.zoomToFit(400, adaptivePadding)
                }
              }}
              className="p-1 text-text-muted/50 hover:text-text hover:bg-white/5 rounded transition-all"
              title="Reorganizar e Recentrar"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              onClick={zoomIn}
              className="p-1 text-text-muted/50 hover:text-text hover:bg-white/5 rounded transition-all"
              title="Zoom in"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              onClick={zoomOut}
              className="p-1 text-text-muted/50 hover:text-text hover:bg-white/5 rounded transition-all"
              title="Zoom out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              onClick={onExpandGraph}
              className="p-1 text-text-muted/50 hover:text-text hover:bg-white/5 rounded transition-all"
              title="Expandir grafo"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div ref={graphContainerRef} className="flex-1 min-h-0 relative">
          {graphData.nodes.length > 0 && graphDims.width > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              nodeLabel="title"
              nodeColor={() => COLORS.node}
              nodeRelSize={2.5}
              linkColor={() => COLORS.link}
              linkWidth={0.5}
              linkDirectionalParticles={0}
              backgroundColor="transparent"
              nodeCanvasObject={nodeCanvasObject}
              nodeCanvasObjectMode={() => 'replace'}
              width={graphDims.width}
              height={graphDims.height}
              minZoom={0.3}
              maxZoom={4}
              d3AlphaDecay={0.03}
              d3VelocityDecay={0.3}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted/30">
              <span className="text-[10px]">Sem conexões</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
