import { useRef, useState, useCallback, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Network, ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react'
import { NoteSummary } from '../../../services/api'
import { useNoteGraphData } from '../hooks/useNoteGraphData'

const COLORS = {
  node: '#cbd5e1',
  nodeDimmed: '#334155',
  nodeActive: '#a78bfa',
  nodeText: '#94a3b8',
  link: '#334155'
}

interface NoteGraphMiniProps {
  notes: NoteSummary[]
  onClose: () => void
  onExpand: () => void
}

export default function NoteGraphMini({ notes, onClose, onExpand }: NoteGraphMiniProps) {
  const graphRef = useRef<any>(null)
  const { graphData } = useNoteGraphData(notes)
  const [animStartTime, setAnimStartTime] = useState(() => Date.now())
  const [animElapsed, setAnimElapsed] = useState(0)
  const [highlightNode, setHighlightNode] = useState<string | null>(null)

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
    (node: any, ctx: CanvasRenderingContext2D) => {
      const rawLabel = node.title || ''
      const label = rawLabel.length > 20 ? rawLabel.slice(0, 18) + '…' : rawLabel
      const baseRadius = Math.max(2.5, (node.val || 1) * 2)

      // Sequential Timeline Animation (Second Brain effect)
      const nodeIndex = graphData.nodes.findIndex((n) => n.id === node.id)
      const totalNodes = Math.max(1, graphData.nodes.length)
      const nodeDelayMs = (nodeIndex / totalNodes) * 1200
      const nodeAgeMs = animElapsed - nodeDelayMs

      if (nodeAgeMs <= 0) return

      const scaleProgress = Math.min(1, nodeAgeMs / 300)
      const easeProgress = 1 - Math.pow(1 - scaleProgress, 3)

      const nodeRadius = baseRadius * easeProgress
      const isConnected = (node.val || 1) > 1

      ctx.beginPath()
      ctx.arc(node.x || 0, node.y || 0, nodeRadius, 0, 2 * Math.PI, false)
      ctx.fillStyle =
        highlightNode && highlightNode !== node.id
          ? COLORS.nodeDimmed
          : highlightNode === node.id || isConnected
            ? COLORS.nodeActive
            : COLORS.node
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
    [highlightNode, graphData.nodes, animElapsed]
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

  const handleNodeClick = useCallback((node: any) => {
    setHighlightNode((prev) => (prev === node.id ? null : node.id))
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setHighlightNode(null)
  }, [])

  const zoomIn = useCallback(() => graphRef.current?.zoom(graphRef.current.zoom() * 1.3, 200), [])
  const zoomOut = useCallback(() => graphRef.current?.zoom(graphRef.current.zoom() / 1.3, 200), [])

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="bg-card border border-border/20 rounded-xl shadow-2xl overflow-hidden select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/10 bg-bg/80">
          <div className="flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Grafo
            </span>
            <span className="text-[9px] text-text-muted/40">
              {graphData.nodes.length}n · {graphData.links.length}c
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onExpand}
              className="p-1 text-text-muted/50 hover:text-text hover:bg-white/5 rounded transition-all"
              title="Expandir"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-text-muted/50 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
              title="Fechar"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="w-[300px] h-[220px] relative">
          {graphData.nodes.length > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              nodeLabel="title"
              nodeColor={(node: any) =>
                highlightNode && highlightNode !== node.id
                  ? COLORS.nodeDimmed
                  : highlightNode === node.id
                    ? COLORS.nodeActive
                    : COLORS.node
              }
              nodeRelSize={2.5}
              linkColor={() => COLORS.link}
              linkWidth={0.5}
              linkDirectionalParticles={0}
              backgroundColor="transparent"
              onNodeClick={handleNodeClick}
              onBackgroundClick={handleBackgroundClick}
              nodeCanvasObject={nodeCanvasObject}
              nodeCanvasObjectMode={() => 'replace'}
              width={300}
              height={220}
              minZoom={0.3}
              maxZoom={4}
              cooldownTicks={60}
              d3AlphaDecay={0.03}
              d3VelocityDecay={0.3}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted/30">
              <span className="text-[10px]">Sem conexões</span>
            </div>
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-card/80 border border-border/20 rounded-lg p-0.5">
            <button
              onClick={zoomIn}
              className="p-0.5 text-text-muted/50 hover:text-text hover:bg-white/5 rounded transition-all"
              title="Zoom in"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              onClick={zoomOut}
              className="p-0.5 text-text-muted/50 hover:text-text hover:bg-white/5 rounded transition-all"
              title="Zoom out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
