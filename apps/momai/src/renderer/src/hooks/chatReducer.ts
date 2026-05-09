import type { Message } from '../services/api'

export interface GraphState {
  view: 'center' | 'side' | null
  content: string
  options: string[]
  optionsMap?: Record<string, string>
  uiSchema?: any
  bypass_wake_word?: boolean
}

export interface ChatState {
  messages: Message[]
  threadId: string
  isLoading: boolean
  isHistoryLoaded: boolean
  speakingMessageId: string | null
  voiceStatus: 'idle' | 'listening' | 'processing'
  voiceEngineLoading: {
    loading: boolean
    pendingAutoTts: boolean
    message: string
  } | null
  isCallMode: boolean
  callHistory: { id: string; role: 'user' | 'assistant'; content: string }[]
  graphState: GraphState
  animationFinished: boolean
}

export type ChatAction =
  | { type: 'SET_MESSAGES'; messages: Message[] }
  | { type: 'APPEND_MESSAGE'; message: Message }
  | { type: 'UPDATE_MESSAGES'; updater: (prev: Message[]) => Message[] }
  | { type: 'SET_THREAD_ID'; threadId: string }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_HISTORY_LOADED'; loaded: boolean }
  | { type: 'SET_SPEAKING'; messageId: string | null }
  | { type: 'SET_VOICE_STATUS'; status: 'idle' | 'listening' | 'processing' }
  | { type: 'SET_VOICE_ENGINE_LOADING'; data: ChatState['voiceEngineLoading'] }
  | { type: 'SET_CALL_MODE'; enabled: boolean }
  | {
      type: 'SET_CALL_HISTORY'
      updater: (prev: ChatState['callHistory']) => ChatState['callHistory']
    }
  | { type: 'SET_GRAPH_STATE'; state: Partial<ChatState['graphState']> }
  | { type: 'SET_ANIMATION_FINISHED'; finished: boolean }
  | { type: 'BATCH_UPDATE'; updates: Partial<ChatState> }

export const initialChatState: ChatState = {
  messages: [],
  threadId: `sessao_${Date.now()}`,
  isLoading: false,
  isHistoryLoaded: false,
  speakingMessageId: null,
  voiceStatus: 'idle',
  voiceEngineLoading: null,
  isCallMode: false,
  callHistory: [],
  graphState: {
    view: null,
    content: '',
    options: [],
    optionsMap: {},
    bypass_wake_word: false
  },
  animationFinished: false
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.messages }
    case 'APPEND_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] }
    case 'UPDATE_MESSAGES':
      return { ...state, messages: action.updater(state.messages) }
    case 'SET_THREAD_ID':
      return { ...state, threadId: action.threadId }
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading }
    case 'SET_HISTORY_LOADED':
      return { ...state, isHistoryLoaded: action.loaded }
    case 'SET_SPEAKING':
      return { ...state, speakingMessageId: action.messageId }
    case 'SET_VOICE_STATUS':
      return { ...state, voiceStatus: action.status }
    case 'SET_VOICE_ENGINE_LOADING':
      return { ...state, voiceEngineLoading: action.data }
    case 'SET_CALL_MODE':
      return { ...state, isCallMode: action.enabled }
    case 'SET_CALL_HISTORY':
      return { ...state, callHistory: action.updater(state.callHistory) }
    case 'SET_GRAPH_STATE':
      return { ...state, graphState: { ...state.graphState, ...action.state } }
    case 'SET_ANIMATION_FINISHED':
      return { ...state, animationFinished: action.finished }
    case 'BATCH_UPDATE':
      return { ...state, ...action.updates }
    default:
      return state
  }
}
