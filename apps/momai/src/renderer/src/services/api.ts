import axios from 'axios'
import { cleanMomaiActions } from '../utils/text'
import { API_URL } from '../constants'

export const api = axios.create({
  baseURL: API_URL
})

export interface StructuredResponse {
  type: string
  data: Record<string, any>
}

export interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  isGraph?: boolean
  graphData?: {
    view: 'center' | 'side' | 'chat' | null
    content: string
    options: string[]
    optionsMap?: Record<string, string>
    options_map?: Record<string, string>
    uiSchema?: any
  }
  activities?: string[]
  sources?: Source[]
  snippets?: Snippet[]
  cards?: Card[]
  toolSteps?: any[]
  activeSkill?: string
  structuredResponse?: StructuredResponse
}

export interface StatusData {
  status: string
  mode: string
  brain_ready: boolean
  is_loading: boolean
  setup: {
    local_installed: boolean
    installed_version?: string
    latest_version?: string
  }
  ai_tier: string | null
  tiers_config?: Record<string, any>
  llama_runtime?: {
    loaded_model_name: string | null
    [key: string]: any
  }
}

export interface ChatStreamCallbacks {
  onToken: (token: string) => void
  onStatus: (status: string) => void
  onError: (error: string) => void
  onDone: () => void
  onSources?: (sources: Source[]) => void
  onSnippets?: (snippets: Snippet[]) => void
  onCards?: (cards: Card[]) => void
  onToolSteps?: (steps: any[]) => void
  onActiveSkill?: (skillName: string) => void
  onStructuredResponse?: (response: StructuredResponse) => void
}

export interface ChatMessageOptions {
  memory_context?: string
  memory_sources?: Source[]
}

export interface Source {
  url: string
  title: string
  snippet: string
}

export interface Snippet {
  title: string
  content: string
  icon?: string
}

export interface Card {
  type: string
  title: string
  [key: string]: any
}

export async function sendChatMessage(
  content: string,
  threadId: string,
  callbacks: ChatStreamCallbacks,
  options?: ChatMessageOptions
): Promise<void> {
  const response = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, thread_id: threadId, ...options })
  })

  if (!response.ok) {
    throw new Error('Erro ao iniciar stream de chat')
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  if (!reader) throw new Error('Stream não disponível')

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue

      const payload = trimmed.replace(/^data:\s*/, '').trim()
      if (!payload) continue

      try {
        const data = JSON.parse(payload)

        if (data.token) {
          callbacks.onToken(data.token)
        }

        if (data.status) {
          callbacks.onStatus(data.status)
        }

        if (data.sources && callbacks.onSources) {
          callbacks.onSources(data.sources)
        }

        if (data.snippets && callbacks.onSnippets) {
          callbacks.onSnippets(data.snippets)
        }

        if (data.cards && callbacks.onCards) {
          callbacks.onCards(data.cards)
        }

        if (data.tool_steps && callbacks.onToolSteps) {
          callbacks.onToolSteps(data.tool_steps)
        }

        if (data.active_skill && callbacks.onActiveSkill) {
          callbacks.onActiveSkill(data.active_skill)
        }

        if (data.structured_response && callbacks.onStructuredResponse) {
          callbacks.onStructuredResponse(data.structured_response)
        }

        if (data.error) {
          callbacks.onError(data.error)
        }

        if (data.done) {
          callbacks.onDone()
        }
      } catch (e) {
        console.error('Erro ao processar JSON do stream:', e, 'Linha:', line)
      }
    }
  }
}

export async function fetchStatus(): Promise<StatusData> {
  const response = await fetch(`${API_URL}/status`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  return response.json()
}

export async function stopGeneration(): Promise<void> {
  const response = await fetch(`${API_URL}/chat/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error('Erro ao parar geracao')
}

export async function resetChatContextUsage(): Promise<void> {
  const response = await fetch(`${API_URL}/chat/context/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error('Erro ao resetar contexto')
}

export async function stopVoice(): Promise<void> {
  try {
    const { getTTSServiceRenderer } = await import('./ttsService')
    getTTSServiceRenderer().stop()
  } catch {}
  try {
    const response = await fetch(`${API_URL}/chat/stop-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) throw new Error('Erro ao parar voz')
  } catch {}
}

import { getTTSServiceRenderer } from './ttsService'

function stripEmojis(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, '')
}

export async function speakText(text: string, engine?: string): Promise<void> {
  const cleanText = stripEmojis(text)

  if (engine && engine !== 'kokoro') {
    const ttsService = getTTSServiceRenderer()
    const response = await ttsService.speak(cleanText, engine as any)
    if (!response.success) {
      throw new Error(response.error || 'Erro ao falar')
    }
    return
  }

  const response = await fetch(`${API_URL}/chat/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cleanText })
  })
  if (!response.ok) throw new Error('Erro ao ler texto')
}

export async function fetchInitStatus(): Promise<{
  stage: string
  message: string
  progress: number
  error?: string | null
}> {
  const response = await fetch(`${API_URL}/init-status`)
  if (!response.ok) throw new Error('Erro ao buscar status de inicialização')
  return response.json()
}

export async function updateMode(mode: string): Promise<void> {
  const response = await fetch(`${API_URL}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  })
  if (!response.ok) throw new Error('Erro ao atualizar modo')
}

function safeJsonParse(str: string | null | undefined): any {
  if (!str) return undefined
  try {
    return JSON.parse(str)
  } catch {
    return undefined
  }
}

export async function fetchChatHistory(threadId: string = 'default'): Promise<Message[]> {
  const response = await fetch(`${API_URL}/chat/history?thread_id=${threadId}`)
  if (!response.ok) throw new Error('Erro ao buscar histórico')
  const messages = await response.json()
  if (!Array.isArray(messages)) return []

  return messages.map((msg: any) => ({
    ...msg,
    sources: safeJsonParse(msg.sources),
    snippets: safeJsonParse(msg.snippets),
    cards: safeJsonParse(msg.cards),
    toolSteps: msg.graph_data && msg.graph_data.tool_steps ? msg.graph_data.tool_steps : undefined,
    structuredResponse: safeJsonParse(msg.structured_response)
  }))
}

export interface ChatSession {
  id: string
  lastActivity: string | null
  messageCount: number
  firstMessage: string | null
  title: string | null
}

export async function fetchSessions(): Promise<ChatSession[]> {
  const response = await fetch(`${API_URL}/chat/sessions`)
  if (!response.ok) throw new Error('Erro ao buscar sessoes')
  const data = await response.json()
  return data.sessions || []
}

export async function clearChatHistory(threadId: string = 'default'): Promise<void> {
  const response = await fetch(`${API_URL}/chat/history?thread_id=${threadId}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Erro ao limpar histórico')
}

export async function generateSessionTitle(
  threadId: string,
  userMessage: string,
  assistantMessage?: string
): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/chat/title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: threadId,
        user_message: userMessage,
        assistant_message: assistantMessage
      })
    })
    if (!response.ok) return null
    const data = await response.json()
    const title = data.title || null
    return title ? cleanMomaiActions(title) : null
  } catch {
    return null
  }
}

export async function deleteMessage(messageId: number): Promise<void> {
  const response = await fetch(`${API_URL}/chat/message/${messageId}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Erro ao excluir mensagem')
}

// --- EXTENSIONS ---

export interface Extension {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  installed?: boolean
  icon?: string
  version?: string
  error?: string
  author?: string
  is_official?: boolean
  download_url?: string
  tags?: string[]
  manifest?: any
  permissionSummary?: string[]
  riskLevel?: 'low' | 'medium' | 'high'
  instructions?: string
  readme?: string
  repo?: string
  stars?: number
  compatibility?: string
}

export async function fetchExtensions(lang?: string): Promise<Extension[]> {
  const url = lang ? `${API_URL}/extensions?lang=${lang}` : `${API_URL}/extensions`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Erro ao buscar extensões instaladas')
  return response.json()
}

export async function fetchExtensionRegistry(lang?: string): Promise<any[]> {
  const url = lang
    ? `${API_URL}/extensions/registry?lang=${lang}`
    : `${API_URL}/extensions/registry`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Erro ao buscar registro de extensões')
  return response.json()
}

export async function installExtension(id: string, downloadUrl: string): Promise<void> {
  const response = await fetch(`${API_URL}/extensions/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, download_url: downloadUrl })
  })
  if (!response.ok) throw new Error('Erro ao instalar extensão')
}

export async function toggleExtension(id: string, enabled: boolean): Promise<void> {
  const response = await fetch(`${API_URL}/extensions/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, enabled })
  })
  if (!response.ok) throw new Error('Erro ao alterar status da extensão')
}

export async function uninstallExtension(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/extensions/uninstall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, enabled: false }) // Reusing ExtensionToggle schema
  })
  if (!response.ok) throw new Error('Erro ao desinstalar extensão')
}

export async function sendExtensionAction(id: string, action: string, payload: any): Promise<any> {
  const response = await fetch(`${API_URL}/extensions/${id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  })
  if (!response.ok) throw new Error('Erro ao enviar ação para extensão')
  return response.json()
}

// --- GAMING MODE ---

export interface GamingApp {
  id: number
  name: string
  executable: string
  is_active: boolean
}

export async function fetchGamingApps(): Promise<GamingApp[]> {
  const response = await fetch(`${API_URL}/system/gaming-apps`)
  if (!response.ok) throw new Error('Erro ao buscar apps de jogo')
  return response.json()
}

export async function addGamingApp(name: string, executable: string): Promise<void> {
  const response = await fetch(`${API_URL}/system/gaming-apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, executable })
  })
  if (!response.ok) throw new Error('Erro ao adicionar app de jogo')
}

export async function deleteGamingApp(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/system/gaming-apps/${id}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Erro ao remover app de jogo')
}

// --- SETTINGS ---

export interface SettingsData {
  user_name?: string
  tts_voice?: string
  tts_enabled: boolean
  wake_word_enabled: boolean
  locale?: string
  min_interface_chars?: number
  prebuffer_chars?: number
  onboarding_completed?: boolean
  tutorial_completed?: boolean
  ai_tier?: string | null
  context_window_mode?: 'min' | 'medium' | 'max' | 'custom'
  context_window_tokens?: number
  skip_intro?: boolean
  daily_briefing_enabled?: boolean
}

export async function fetchSettings(): Promise<SettingsData> {
  const response = await fetch(`${API_URL}/settings`)
  if (!response.ok) throw new Error('Erro ao buscar configuracoes')
  return response.json()
}

export async function updateSettingsPartial(payload: Partial<SettingsData>): Promise<void> {
  const response = await fetch(`${API_URL}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Erro ao atualizar configuracoes')
}

export async function setCallMode(enabled: boolean): Promise<void> {
  const response = await fetch(`${API_URL}/mode/call-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  })
  if (!response.ok) throw new Error('Erro ao definir modo chamada')
}

// --- QUICK VOICE TRANSCRIPTION ---

export interface QuickTranscriptionResponse {
  text: string
  success: boolean
}

export async function quickTranscribe(): Promise<QuickTranscriptionResponse> {
  const response = await fetch(`${API_URL}/voice/quick-transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error('Erro ao transcrever audio')
  return response.json()
}

export async function stopQuickTranscribe(): Promise<void> {
  const response = await fetch(`${API_URL}/voice/stop-quick-transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  if (!response.ok) throw new Error('Erro ao parar gravação')
}

// --- EXTERNAL MEMORY ---

export interface NoteSummary {
  id: string
  title: string
  path: string
  source: string
  created_at?: string | null
  updated_at?: string | null
  preview?: string
}

export interface NoteDetail extends NoteSummary {
  content: string
}

export interface MemorySearchResult {
  note_id: string
  chunk_id: string
  title: string
  path: string
  text: string
  score: number
  keyword_score?: number
  vector_score?: number
}

export async function listMemoryNotes(): Promise<NoteSummary[]> {
  return window.api.notes.list()
}

export async function getMemoryNote(noteId: string): Promise<NoteDetail> {
  const note = await window.api.notes.get(noteId)
  if (!note) throw new Error('Erro ao buscar nota')
  return note
}

export async function createMemoryNote(
  title: string,
  content: string,
  path?: string
): Promise<NoteDetail> {
  return window.api.notes.create({ title, content, path })
}

export async function updateMemoryNote(
  noteId: string,
  payload: { title?: string; content?: string; path?: string }
): Promise<NoteDetail> {
  const updated = await window.api.notes.update(noteId, payload)
  if (!updated) throw new Error('Erro ao atualizar nota')
  return updated
}

export async function openNoteFolder(noteId: string): Promise<boolean> {
  return window.api.notes.openFolder(noteId)
}

export async function listMemoryFolders(): Promise<string[]> {
  return window.api.notes.listFolders()
}

export async function createMemoryFolder(path: string): Promise<void> {
  await window.api.notes.createFolder(path)
}

export async function renameMemoryFolder(oldPath: string, newPath: string): Promise<void> {
  const success = await window.api.notes.renameFolder(oldPath, newPath)
  if (!success) throw new Error('Erro ao renomear pasta')
}

export async function deleteMemoryFolder(path: string): Promise<void> {
  const success = await window.api.notes.deleteFolder(path)
  if (!success) throw new Error('Erro ao excluir pasta')
}

export async function deleteMemoryNote(noteId: string): Promise<void> {
  const deleted = await window.api.notes.delete(noteId)
  if (!deleted) throw new Error('Erro ao remover nota')
}

export async function importMemoryNotes(files: { name: string; content: string }[]): Promise<void> {
  await window.api.notes.import(files)
}

export async function searchMemory(query: string, limit = 6): Promise<MemorySearchResult[]> {
  return window.api.notes.search(query, limit)
}

// --- REMINDERS ---

export interface Reminder {
  id: number
  title: string
  content: string | null
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
  is_active: boolean
  note_id?: string | null
  action_type?: 'reminder' | 'cron'
  voice_response?: boolean
}

export interface ActiveReminder {
  id: number
  title: string
  content?: string | null
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
  note_id?: string | null
  action_type?: 'reminder' | 'cron'
  voice_response?: boolean
}

export async function fetchReminders(): Promise<Reminder[]> {
  const response = await fetch(`${API_URL}/reminders`)
  if (!response.ok) throw new Error('Erro ao buscar lembretes')
  return response.json()
}

export async function fetchActiveReminders(): Promise<ActiveReminder[]> {
  const response = await fetch(`${API_URL}/reminders/active`)
  if (!response.ok) throw new Error('Erro ao buscar lembretes ativos')
  return response.json()
}

export async function createReminder(payload: {
  title: string
  content: string
  scheduled_time: string
  repeat_interval: string | null
  repeat_value: number | null
  note_id?: string | null
  action_type?: 'reminder' | 'cron'
  voice_response?: boolean
}): Promise<void> {
  const response = await fetch(`${API_URL}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Erro ao criar lembrete')
}

export async function updateReminder(
  id: number,
  payload: {
    title?: string
    content?: string
    scheduled_time?: string
    repeat_interval?: string | null
    repeat_value?: number | null
    is_active?: boolean
    note_id?: string | null
    action_type?: 'reminder' | 'cron'
    voice_response?: boolean
  }
): Promise<void> {
  const response = await fetch(`${API_URL}/reminders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Erro ao atualizar lembrete')
}

export async function deleteReminder(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/reminders/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Erro ao deletar lembrete')
}

// --- HARDWARE ---

export interface HardwareStats {
  cpu_usage: number
  ram_usage: number
  active_processes: number
  vram_usage: number
}

export async function fetchHardwareStats(): Promise<HardwareStats> {
  const response = await fetch(`${API_URL}/extensions/hardware-stats`)
  if (!response.ok) throw new Error('Erro ao buscar stats de hardware')
  return response.json()
}
