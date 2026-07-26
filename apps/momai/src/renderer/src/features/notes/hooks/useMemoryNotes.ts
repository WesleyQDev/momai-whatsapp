import { useState, useCallback } from 'react'
import { api, NoteSummary } from '../../../services/api'

export const MEMORY_NOTE_PREFIX = '__memory:'
export const MAX_MEMORY_CHARS = 2200

const MEMORY_DEFS = [
  {
    id: `${MEMORY_NOTE_PREFIX}usuario` as const,
    title: 'Sobre o usuário',
    name: 'usuario',
    path: 'notes/Memória/usuario'
  },
  {
    id: `${MEMORY_NOTE_PREFIX}persona` as const,
    title: 'Personalidade da IA',
    name: 'persona',
    path: 'notes/Memória/persona'
  },
  {
    id: `${MEMORY_NOTE_PREFIX}conhecimento` as const,
    title: 'Conhecimento geral',
    name: 'conhecimento',
    path: 'notes/Memória/conhecimento'
  }
]

const VIRTUAL_NOTES: NoteSummary[] = MEMORY_DEFS.map((f) => ({
  id: f.id,
  title: f.title,
  path: f.path,
  source: 'memory',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}))

export function useMemoryNotes() {
  const [memoryNotesData] = useState<NoteSummary[]>(VIRTUAL_NOTES)

  const isMemoryNote = useCallback((id: string | null): id is string => {
    return id?.startsWith(MEMORY_NOTE_PREFIX) ?? false
  }, [])

  const loadMemoryContent = useCallback(async (id: string): Promise<string> => {
    const name = id.replace(MEMORY_NOTE_PREFIX, '')
    const res = await api.get(`/memories/${name}`)
    return res.data?.content || ''
  }, [])

  const saveMemoryContent = useCallback(async (id: string, content: string): Promise<void> => {
    const name = id.replace(MEMORY_NOTE_PREFIX, '')
    await api.post(`/memories/${name}`, { content })
  }, [])

  const getMemoryName = useCallback((id: string): string => {
    return id.replace(MEMORY_NOTE_PREFIX, '')
  }, [])

  return { memoryNotesData, isMemoryNote, loadMemoryContent, saveMemoryContent, getMemoryName }
}
