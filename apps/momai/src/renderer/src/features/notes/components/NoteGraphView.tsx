import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { X, ZoomIn, ZoomOut, Maximize2, ArrowLeft } from 'lucide-react'
import { NoteSummary, NoteDetail } from '../../../services/api'

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
  bg: '#1a1a1f',
  node: '#8b5cf6',
  nodeActive: '#a78bfa',
  nodeText: '#e5e5e8',
  link: '#3a3a45',
  linkHighlight: '#8b5cf6',
  ring: '#8b5cf6',
}

export default function NoteGraphView({ notes, onClose }: NoteGraphViewProps) {
  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] })
  const [highlightNode, setHighlightNode] = useState<string | null>(null)
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set())
  const [noteContents, setNoteContents] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  console.log('[Graph] Rendering NoteGraphView', { notesCount: notes.length, graphData, isLoading, dimensions })

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

  const parseWikiLinks = useCallback((content: string): string[] => {
    const links: string[] = []
    const regex = /\[\[(.+?)\]\]/g
    let match
    while ((match = regex.exec(content)) !== null) {
      links.push(match[1].trim())
    }
    return links
  }, [])

  useEffect(() => {
    setIsLoading(true)
    const fetchNoteContents = async () => {
      const contents: Record<string, string> = {}
      for (const note of notes) {
        try {
          if (window.api?.notes?.get) {
            const detail = await window.api.notes.get(note.id) as NoteDetail
            contents[note.id] = detail?.content || ''
          }
        } catch (err) {
          console.warn(`Failed to fetch note ${note.id}:`, err)
          contents[note.id] = ''
        }
      }
      setNoteContents(contents)
      setIsLoading(false)
    }
    fetchNoteContents()
  }, [notes])

  useEffect(() => {
    if (Object.keys(noteContents).length === 0) return

    try {
      const nodesMap = new Map<string, GraphNode>()
      const links: GraphLink[] = []

      notes.forEach((note) => {
        nodesMap.set(note.id, {
          id: note.id,
          title: note.title || 'Untitled',
          group: note.path || 'root',
          val: 1,
        })
      })

      notes.forEach((note) => {
        const content = noteContents[note.id] || ''
        const wikiLinks = parseWikiLinks(content)
        wikiLinks.forEach((linkTitle) => {
          const targetNote = notes.find((n) => n.title?.toLowerCase() === linkTitle.toLowerCase())
          if (targetNote && targetNote.id !== note.id) {
            links.push({
              source: note.id,
              target: targetNote.id,
            })
          }
        })
      })

      const nodes = Array.from(nodesMap.values())
      nodes.forEach((node) => {
        const connectionCount = links.filter(
          (l) => (typeof l.source === 'string' ? l.source : l.source.id) === node.id ||
                 (typeof l.target === 'string' ? l.target : l.target.id) === node.id
        ).length
        node.val = Math.max(1, Math.min(5, 1 + connectionCount * 0.5))
      })

      console.log('[Graph] Data built:', { nodes: nodes.length, links: links.length })
      setGraphData({ nodes, links })
    } catch (err) {
      console.error('[Graph] Error building graph data:', err)
    }
  }, [notes, noteContents, parseWikiLinks])

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const connectedLinks = graphData.links.filter(
        (l) => (typeof l.source === 'string' ? l.source : l.source.id) === node.id ||
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

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.title
      const fontSize = 12 / globalScale
      const nodeRadius = (node.val || 1) * 4

      const isHighlighted = highlightNode === node.id || highlightLinks.has(node.id)
      const isDimmed = highlightNode && !isHighlighted

      ctx.beginPath()
      ctx.arc(node.x || 0, node.y || 0, nodeRadius, 0, 2 * Math.PI, false)
      ctx.fillStyle = isHighlighted ? COLORS.nodeActive : isDimmed ? '#2a2a30' : COLORS.node
      ctx.fill()

      if (isHighlighted) {
        ctx.beginPath()
        ctx.arc(node.x || 0, node.y || 0, nodeRadius + 3, 0, 2 * Math.PI, false)
        ctx.strokeStyle = COLORS.ring
        ctx.lineWidth = 2 / globalScale
        ctx.stroke()
      }

      ctx.font = `${fontSize}px Inter`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isDimmed ? '#3a3a45' : COLORS.nodeText
      ctx.fillText(label, node.x || 0, (node.y || 0) + nodeRadius + fontSize)
    },
    [highlightNode, highlightLinks]
  )

  const linkCanvasObject = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const start = typeof link.source === 'string' ? graphData.nodes.find((n) => n.id === link.source) : link.source
      const end = typeof link.target === 'string' ? graphData.nodes.find((n) => n.id === link.target) : link.target

      if (!start || !end) return

      const isHighlighted = highlightNode && (
        (typeof link.source === 'string' ? link.source : link.source.id) === highlightNode ||
        (typeof link.target === 'string' ? link.target : link.target.id) === highlightNode
      )
      const isDimmed = highlightNode && !isHighlighted

      ctx.beginPath()
      ctx.moveTo(start.x || 0, start.y || 0)
      ctx.lineTo(end.x || 0, end.y || 0)
      ctx.strokeStyle = isDimmed ? '#1a1a1f' : isHighlighted ? COLORS.linkHighlight : COLORS.link
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
      graphRef.current.zoom(1, 300)
      graphRef.current.centerAt(0, 0, 300)
    }
  }, [])

  return (
    <div className="fixed top-8 bottom-0 left-0 right-0 z-[210] bg-bg flex flex-col">
      {/* Header - fixed above canvas with solid background */}
       <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 bg-bg shrink-0 relative z-[20] pointer-events-auto shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
          <div className="w-px h-4 bg-border/20" />
          <h2 className="text-sm font-semibold text-text">Grafo de Notas</h2>
          <span className="text-xs text-text-muted/40">
            {graphData.nodes.length} notas · {graphData.links.length} conexões
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={zoomIn}
            className="p-2 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={zoomOut}
            className="p-2 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={resetZoom}
            className="p-2 text-text-muted hover:text-text hover:bg-white/5 rounded-md transition-all"
            title="Reset View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border/20 mx-1" />
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
            title="Fechar"
          >
            <X className="w-4 h-4" />
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
            cooldownTicks={100}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            width={dimensions.width}
            height={dimensions.height}
            minZoom={0.5}
            maxZoom={2}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted/50">
            <p className="text-sm">Nenhuma conexão encontrada</p>
            <p className="text-xs mt-1">Adicione links [[wiki]] nas suas notas para ver conexões</p>
          </div>
        )}

        {/* Legend - above canvas */}
        <div className="absolute bottom-4 left-4 bg-card border border-border/40 rounded-lg px-4 py-3 text-xs z-[20] shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-text font-semibold">Nota</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-accent" />
            <span className="text-text font-semibold">Conexão [[wiki]]</span>
          </div>
        </div>

        {/* Hint - above canvas */}
        <div className="absolute bottom-4 right-4 bg-card border border-border/40 rounded-lg px-4 py-2 text-xs text-text z-[20] shadow-xl">
          Clique em um nó para destacar · Scroll para zoom
        </div>
      </div>
    </div>
  )
}
