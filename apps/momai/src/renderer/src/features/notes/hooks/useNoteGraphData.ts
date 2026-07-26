import { useState, useEffect, useCallback } from 'react'
import { NoteSummary, NoteDetail } from '../../../services/api'

interface GraphNode {
  id: string
  title: string
  val: number
}

interface GraphLink {
  source: string
  target: string
}

export function useNoteGraphData(notes: NoteSummary[]) {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: []
  })
  const [isLoading, setIsLoading] = useState(false)

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
    const fetchGraph = async () => {
      setIsLoading(true)
      const nodesMap = new Map<string, GraphNode>()
      const links: GraphLink[] = []

      notes.forEach((note) => {
        nodesMap.set(note.id, { id: note.id, title: note.title || 'Untitled', val: 1 })
      })

      for (const note of notes) {
        try {
          if (window.api?.notes?.get) {
            const detail = (await window.api.notes.get(note.id)) as NoteDetail
            const content = detail?.content || ''
            const wikiLinks = parseWikiLinks(content)
            wikiLinks.forEach((linkTitle) => {
              const linkLower = linkTitle.toLowerCase()
              const target = notes.find((n) => {
                const noteTitle = (n.title || '').toLowerCase()
                if (!noteTitle) return false
                if (noteTitle === linkLower) return true
                if (linkLower.endsWith('/' + noteTitle) || noteTitle.endsWith('/' + linkLower))
                  return true
                if (
                  n.path &&
                  (n.path.toLowerCase() === linkLower || n.path.toLowerCase().endsWith(linkLower))
                )
                  return true
                return false
              })

              if (target && target.id !== note.id) {
                if (
                  !links.some(
                    (l) =>
                      (l.source === note.id && l.target === target.id) ||
                      (l.source === target.id && l.target === note.id)
                  )
                ) {
                  links.push({ source: note.id, target: target.id })
                }
              }
            })
          }
        } catch {
          // skip failed notes
        }
      }

      const nodes = Array.from(nodesMap.values())
      nodes.forEach((node) => {
        const connectionCount = links.filter(
          (l) => l.source === node.id || l.target === node.id
        ).length
        node.val = Math.max(1, Math.min(5, 1 + connectionCount * 0.5))
      })

      setGraphData({ nodes, links })
      setIsLoading(false)
    }
    fetchGraph()
  }, [notes, parseWikiLinks])

  return { graphData, isLoading }
}
