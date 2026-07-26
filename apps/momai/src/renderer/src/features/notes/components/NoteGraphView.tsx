import { useRef, useCallback, useLayoutEffect, useEffect, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { X, ZoomIn, ZoomOut, Maximize2, ArrowLeft, RotateCcw } from 'lucide-react'
import { NoteSummary } from '../../../services/api'
import { useNoteGraphData } from '../hooks/useNoteGraphData'

interface GraphNode {
  id: string
  title: string
  group: string
  val: number
  x?: number
  y?: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface NoteGraphViewProps {
  notes: NoteSummary[]
  onClose: () => void
}

const COLORS = {
  bg: '#16161a',
  node: '#cbd5e1',
  nodeActive: '#a78bfa',
  nodeText: '#94a3b8',
  link: '#334155',
  linkHighlight: '#a78bfa',
  ring: '#a78bfa'
}

export default function NoteGraphView({ notes, onClose }: NoteGraphViewProps) {
  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { graphData: rawGraphData, isLoading } = useNoteGraphData(notes)
  const [highlightNode, setHighlightNode] = useState<string | null>(null)
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set())
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const graphData: GraphData = {
    nodes: rawGraphData.nodes.map((n) => ({
      ...n,
      group: notes.find((note) => note.id === n.id)?.path || 'root'
    })),
    links: rawGraphData.links
  }

  // Adjust forces for Obsidian-style regional cloud layout with comfortable spacing
  useEffect(() => {
    if (graphRef.current) {
      const charge = graphRef.current.d3Force('charge')
      if (charge) charge.strength(-25).distanceMax(150)
      const center = graphRef.current.d3Force('center')
      if (center) center.strength(0.8)
      const linkForce = graphRef.current.d3Force('link')
      if (linkForce) {
        linkForce.distance(35)
        linkForce.strength(0.5)
      }
    }
  }, [graphData.nodes.length, graphData.links.length])

  useLayoutEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Smooth auto-center when dimensions change with adaptive padding
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    if (dimensions.width > 0 && dimensions.height > 0 && graphRef.current) {
      const nodeCount = graphData.nodes.length
      const adaptivePadding = Math.max(40, Math.min(160, 40 + nodeCount * 5))
      timer = setTimeout(() => {
        graphRef.current?.zoomToFit(400, adaptivePadding)
      }, 200)
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [dimensions, graphData.nodes.length])

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const connectedLinks = graphData.links.filter(
        (l) =>
          (typeof l.source === 'string' ? l.source : l.source.id) === node.id ||
          (typeof l.target === 'string' ? l.target : l.target.id) === node.id
      )
      const connectedNodeIds = new Set<string>()
      connectedLinks.forEach((l) => {
        connectedNodeIds.add(typeof l.source === 'string' ? l.source : l.source.id)
        connectedNodeIds.add(typeof l.target === 'string' ? l.target : l.target.id)
      })

      setHighlightNode(node.id)
      setHighlightLinks(connectedNodeIds)
    },
    [graphData.links]
  )

  const handleBackgroundClick = useCallback(() => {
    setHighlightNode(null)
    setHighlightLinks(new Set())
  }, [])

  // Track animation start time and 60fps frame progress for Second Brain blossoming animation
  const [animStartTime, setAnimStartTime] = useState(() => Date.now())
  const [animElapsed, setAnimElapsed] = useState(0)

  useEffect(() => {
    let frameId: number
    const loop = () => {
      const elapsed = Date.now() - animStartTime
      setAnimElapsed(elapsed)
      if (elapsed < 2000) {
        frameId = requestAnimationFrame(loop)
      }
    }
    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [animStartTime])

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.title
      const baseRadius = Math.max(4, (node.val || 1) * 3)

      // Sequential Timeline Animation (Second Brain effect)
      const nodeIndex = graphData.nodes.findIndex((n) => n.id === node.id)
      const totalNodes = Math.max(1, graphData.nodes.length)
      const nodeDelayMs = (nodeIndex / totalNodes) * 1200
      const nodeAgeMs = animElapsed - nodeDelayMs

      if (nodeAgeMs <= 0) return

      const scaleProgress = Math.min(1, nodeAgeMs / 300)
      const easeProgress = 1 - Math.pow(1 - scaleProgress, 3)

      const nodeRadius = baseRadius * easeProgress
      const isHighlighted = highlightNode === node.id || highlightLinks.has(node.id)
      const isDimmed = highlightNode && !isHighlighted

      ctx.beginPath()
      ctx.arc(node.x || 0, node.y || 0, nodeRadius, 0, 2 * Math.PI, false)
      ctx.fillStyle = isHighlighted ? COLORS.nodeActive : isDimmed ? '#1e293b' : COLORS.node
      ctx.fill()

      if (isHighlighted) {
        ctx.beginPath()
        ctx.arc(node.x || 0, node.y || 0, nodeRadius + 3, 0, 2 * Math.PI, false)
        ctx.strokeStyle = COLORS.ring
        ctx.lineWidth = 2 / globalScale
        ctx.stroke()
      }

      const showText = scaleProgress >= 0.7 || isHighlighted
      if (showText && label) {
        const rawLabel = label
        const displayLabel = rawLabel.length > 22 ? rawLabel.slice(0, 20) + '…' : rawLabel
        const fontSize = 8.5
        ctx.font = `${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isDimmed ? '#475569' : COLORS.nodeText
        ctx.fillText(displayLabel, node.x || 0, (node.y || 0) + nodeRadius + 2)
      }
    },
    [highlightNode, highlightLinks, graphData.nodes, animElapsed]
  )

  const linkCanvasObject = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const start =
        typeof link.source === 'string'
          ? graphData.nodes.find((n) => n.id === link.source)
          : link.source
      const end =
        typeof link.target === 'string'
          ? graphData.nodes.find((n) => n.id === link.target)
          : link.target

      if (!start || !end) return

      const isHighlighted =
        highlightNode &&
        ((typeof link.source === 'string' ? link.source : link.source.id) === highlightNode ||
          (typeof link.target === 'string' ? link.target : link.target.id) === highlightNode)
      const isDimmed = highlightNode && !isHighlighted

      ctx.beginPath()
      ctx.moveTo(start.x || 0, start.y || 0)
      ctx.lineTo(end.x || 0, end.y || 0)
      ctx.strokeStyle = isDimmed ? '#0f172a' : isHighlighted ? COLORS.linkHighlight : COLORS.link
      ctx.lineWidth = isHighlighted ? 2 / globalScale : 1 / globalScale
      ctx.stroke()
    },
    [highlightNode, graphData.nodes]
  )

  const zoomIn = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom()
      graphRef.current.zoom(currentZoom * 1.3, 300)
    }
  }, [])

  const zoomOut = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom()
      graphRef.current.zoom(currentZoom / 1.3, 300)
    }
  }, [])

  const resetZoom = useCallback(() => {
    if (graphRef.current) {
      const nodeCount = graphData.nodes.length
      const adaptivePadding = Math.max(40, Math.min(160, 40 + nodeCount * 5))
      graphRef.current.zoomToFit(400, adaptivePadding)
    }
  }, [graphData.nodes.length])

  const reorganizeGraph = useCallback(() => {
    setAnimStartTime(Date.now())
    if (graphRef.current) {
      const nodeCount = graphData.nodes.length
      const adaptivePadding = Math.max(40, Math.min(160, 40 + nodeCount * 5))
      graphRef.current.d3ReheatSimulation()
      graphRef.current.zoomToFit(400, adaptivePadding)
    }
  }, [graphData.nodes.length])

  return (
    <div className="fixed top-8 bottom-0 left-12 right-0 z-[210] bg-bg flex flex-col">
      {/* Header - fixed above canvas with solid background */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 bg-bg shrink-0 relative z-[20] pointer-events-auto shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
          <div className="w-px h-4 bg-border/20" />
          <h2 className="text-xs font-semibold text-text">Grafo de Notas</h2>
          <span className="text-[11px] text-text-muted/50">
            {graphData.nodes.length} notas · {graphData.links.length} conexões
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={reorganizeGraph}
            className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
            title="Reorganizar e Recentrar"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-border/20 mx-0.5" />
          <button
            onClick={zoomIn}
            className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={zoomOut}
            className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetZoom}
            className="p-1.5 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
            title="Recentrar e Ajustar"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-border/20 mx-1" />
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Graph Container */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-text-muted/50">
            <p className="text-sm">Carregando grafo...</p>
          </div>
        ) : !dimensions.width || !dimensions.height ? (
          <div className="flex items-center justify-center h-full text-text-muted/50">
            <p className="text-sm">Inicializando...</p>
          </div>
        ) : graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeLabel="title"
            nodeColor={(node: GraphNode) =>
              highlightNode === node.id ? COLORS.nodeActive : COLORS.node
            }
            nodeRelSize={4}
            linkColor={() => COLORS.link}
            linkWidth={1}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleColor={() => COLORS.linkHighlight}
            linkDirectionalParticleSpeed={0.005}
            backgroundColor={COLORS.bg}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            nodeCanvasObject={nodeCanvasObject}
            nodeCanvasObjectMode={() => 'replace'}
            linkCanvasObject={linkCanvasObject}
            linkCanvasObjectMode={() => 'replace'}
            cooldownTicks={80}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            width={dimensions.width}
            height={dimensions.height}
            minZoom={0.2}
            maxZoom={5}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted/50">
            <p className="text-sm">Nenhuma conexão encontrada</p>
            <p className="text-xs mt-1">Adicione links [[wiki]] nas suas notas para ver conexões</p>
          </div>
        )}

        {/* Legend - above canvas */}
        <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur border border-border/40 rounded-lg px-3 py-2 text-[11px] z-[20] shadow-xl whitespace-nowrap">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span className="text-text font-medium">Nota</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-indigo-400" />
            <span className="text-text font-medium">Conexão [[wiki]]</span>
          </div>
        </div>

        {/* Hint - above canvas */}
        <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur border border-border/40 rounded-lg px-3 py-1.5 text-[11px] text-text-muted z-[20] shadow-xl whitespace-nowrap">
          Clique em um nó para destacar · Scroll para zoom
        </div>
      </div>
    </div>
  )
}
