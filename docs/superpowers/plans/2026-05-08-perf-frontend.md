# Frontend Performance Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all frontend performance issues (7 High, 6 Medium, 7 Low) to make the UI extremely responsive.

**Architecture:** Fixes target `apps/momai/src/` — React components, hooks, Electron main process, TTS pipeline, and WebSocket handling.

**Tech Stack:** React 19, TypeScript 5.9, Electron 39, TailwindCSS 3.x

---

## Phase 1: Critical Responsiveness (P1)

### Task P1.1: Consolidate chat state into useReducer

**Files:**
- Modify: `apps/momai/src/renderer/src/hooks/useChatState.ts`
- Modify: `apps/momai/src/renderer/src/hooks/useChatHandlers.ts`
- Modify: `apps/momai/src/renderer/src/hooks/useChat.ts` (if exists)

**Problem:** 15 separate `useState` calls cause 3-5 cascading re-renders per WebSocket message. Every `setState` triggers a full app re-render.

- [ ] **Step 1: Create chat reducer types**

```typescript
// apps/momai/src/renderer/src/hooks/chatReducer.ts
import type { Message, Thread } from '../types/chat'

export interface ChatState {
  messages: Message[]
  threadId: string | null
  isLoading: boolean
  isHistoryLoaded: boolean
  speakingMessageId: string | null
  voiceStatus: string
  voiceEngineLoading: boolean
  isCallMode: boolean
  callHistory: any[]
  graphState: any
}

export type ChatAction =
  | { type: 'SET_MESSAGES'; messages: Message[] }
  | { type: 'APPEND_MESSAGE'; message: Message }
  | { type: 'UPDATE_LAST_MESSAGE'; content: string; status?: string }
  | { type: 'SET_THREAD_ID'; threadId: string }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_HISTORY_LOADED'; loaded: boolean }
  | { type: 'SET_SPEAKING'; messageId: string | null }
  | { type: 'SET_VOICE_STATUS'; status: string }
  | { type: 'SET_VOICE_ENGINE_LOADING'; loading: boolean }
  | { type: 'SET_CALL_MODE'; enabled: boolean }
  | { type: 'SET_CALL_HISTORY'; history: any[] }
  | { type: 'SET_GRAPH_STATE'; state: any }
  | { type: 'BATCH_UPDATE'; updates: Partial<ChatState> }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.messages }
    case 'APPEND_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] }
    case 'UPDATE_LAST_MESSAGE': {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last) {
        msgs[msgs.length - 1] = {
          ...last,
          content: action.content,
          status: action.status || last.status,
        }
      }
      return { ...state, messages: msgs }
    }
    case 'BATCH_UPDATE':
      return { ...state, ...action.updates }
    // ... other cases follow same pattern
    default:
      return state
  }
}
```

- [ ] **Step 2: Refactor useChatState to use useReducer**

```typescript
// apps/momai/src/renderer/src/hooks/useChatState.ts
import { useReducer, useCallback } from 'react'
import { chatReducer, type ChatState, type ChatAction } from './chatReducer'

const initialState: ChatState = {
  messages: [],
  threadId: null,
  isLoading: false,
  isHistoryLoaded: false,
  speakingMessageId: null,
  voiceStatus: 'idle',
  voiceEngineLoading: false,
  isCallMode: false,
  callHistory: [],
  graphState: null,
}

export function useChatState() {
  const [state, dispatch] = useReducer(chatReducer, initialState)

  const setMessages = useCallback((messages: any[]) =>
    dispatch({ type: 'SET_MESSAGES', messages }), [])
  const appendMessage = useCallback((message: any) =>
    dispatch({ type: 'APPEND_MESSAGE', message }), [])
  const updateLastMessage = useCallback((content: string, status?: string) =>
    dispatch({ type: 'UPDATE_LAST_MESSAGE', content, status }), [])
  const setLoading = useCallback((isLoading: boolean) =>
    dispatch({ type: 'SET_LOADING', isLoading }), [])
  const batchUpdate = useCallback((updates: Partial<ChatState>) =>
    dispatch({ type: 'BATCH_UPDATE', updates }), [])

  return {
    ...state,
    setMessages,
    appendMessage,
    updateLastMessage,
    setLoading,
    batchUpdate,
  }
}
```

- [ ] **Step 3: Update useChatHandlers to use batchUpdate**

In `handleWsMessage`, replace sequential setState calls:

```typescript
// Before:
setMessages(updated)
setSpeakingMessageId(...)
setVoiceStatus(...)
setIsLoading(false)

// After:
batchUpdate({
  messages: updated,
  speakingMessageId: ...,
  voiceStatus: ...,
  isLoading: false,
})
```

- [ ] **Step 4: Run lint and typecheck**

```bash
cd apps/momai && pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/hooks/chatReducer.ts apps/momai/src/renderer/src/hooks/useChatState.ts apps/momai/src/renderer/src/hooks/useChatHandlers.ts
git commit -m "perf(ui): consolidate chat state into useReducer"
```

### Task P1.2: Add strict memo to MessageItem

**Files:**
- Modify: `apps/momai/src/renderer/src/features/chat/message/MessageItem.tsx`

**Problem:** All MessageItems re-render on every streaming token because parent passes new array reference.

- [ ] **Step 1: Add custom comparator to memo**

```typescript
// apps/momai/src/renderer/src/features/chat/message/MessageItem.tsx
export const MessageItem = memo(function MessageItem({ message, ...rest }: MessageItemProps) {
  // ... existing component
}, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.isSpeaking === next.isSpeaking &&
    prev.isLoading === next.isLoading &&
    prev.message.status === next.message.status
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/renderer/src/features/chat/message/MessageItem.tsx
git commit -m "perf(ui): add strict memo comparator to MessageItem"
```

### Task P1.3: Fix AudioContext leak in TTS service

**Files:**
- Modify: `apps/momai/src/renderer/src/services/ttsService.ts`

- [ ] **Step 1: Add AudioContext close to cleanup**

```typescript
// In cleanup() method:
cleanup() {
  this.stopCurrentAudio()
  if (this.audioCtx && this.audioCtx.state !== 'closed') {
    this.audioCtx.close()
    this.audioCtx = null
  }
  this.currentSources.clear()
  this.listeners.clear()
  this.cleanupFns.forEach(fn => fn())
  this.cleanupFns = []
  this.nextScheduleTime = 0
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/renderer/src/services/ttsService.ts
git commit -m "fix(ui): close AudioContext in TTS cleanup"
```

### Task P1.4: Make TTS speak handler non-blocking in coreManager

**Files:**
- Modify: `apps/momai/src/main/coreManager.ts`

**Problem:** `tts-speak` handler blocks the Node Core IPC channel, preventing token streaming during TTS.

- [ ] **Step 1: Make handler non-blocking**

```typescript
// Wrap in: if (msg.type === 'tts-speak') {
if (msg.type === 'tts-speak') {
  handleTtsSpeak(msg).catch(err => logger.error('[TTS]', err))
  return
}

// New handler function:
async function handleTtsSpeak(msg: any) {
  const { requestId, text, voice, engine } = msg
  try {
    const ttsService = getTTSService()
    await ttsService.speak(text, engine || 'edge-tts')
    if (child.connected) {
      child.send({ type: 'tts-speak-result', requestId, ok: true })
    }
  } catch (error) {
    logger.error('[TTS] speak error:', error)
    if (child.connected) {
      child.send({ type: 'tts-speak-result', requestId, ok: false, error: String(error) })
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/main/coreManager.ts
git commit -m "perf(main): make TTS speak handler non-blocking"
```

### Task P1.5: Fix ContextUsageRing WebSocket

**Files:**
- Modify: `apps/momai/src/renderer/src/components/ContainerChat.tsx`

- [ ] **Step 1: Fix ContextUsageRing WS lifecycle**

```typescript
// Add try/catch around JSON.parse and safe accessors
ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data)
    if (msg?.type === 'resource_usage' && msg?.data) {
      const nextUsed = Number(msg.data.context_used_tokens ?? 0)
      const nextTotal = Number(msg.data.context_total_tokens ?? 0)
      if (Number.isFinite(nextUsed)) setUsed(Math.max(0, nextUsed))
      if (Number.isFinite(nextTotal)) setTotal(Math.max(0, nextTotal))
    }
  } catch {
    // ignore parse errors
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/renderer/src/components/ContainerChat.tsx
git commit -m "fix(ui): add error handling to ContextUsageRing WebSocket"
```

---

## Phase 2: Stability & Performance (P2)

### Task P2.1: Consolidate status polling intervals

**Files:**
- Modify: `apps/momai/src/renderer/src/hooks/useStatus.ts`

- [ ] **Step 1: Merge intervals into single loop**

Replace 4 separate intervals with one unified interval:

```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    // 1. Status check (every 2s during boot, 8s after)
    const status = await checkStatus()
    // 2. Init progress (during boot)
    if (!status.ready) {
      const progress = await checkInitProgress()
      setInitProgress(progress)
    }
    // 3. Stall watchdog (during boot, integrated)
    if (!status.ready && stalledSince) { ... }
  }, status.ready ? 8000 : 2000)

  return () => clearInterval(interval)
}, [status.ready])
```

- [ ] **Step 2: Reduce visual progress to 500ms**

```typescript
// Change from 200ms to 500ms:
const visualInterval = setInterval(() => {
  setVisualProgress(prev => Math.min(prev + 0.5, 95))
}, 500)
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/src/renderer/src/hooks/useStatus.ts
git commit -m "perf(ui): consolidate status polling intervals"
```

### Task P2.2: Deduplicate stripMarkdownAndEmoji

**Files:**
- Create: `apps/momai/src/shared/text-utils.ts`
- Modify: `apps/momai/src/renderer/src/services/api.ts`
- Modify: `apps/momai/src/main/ttsService.ts`

- [ ] **Step 1: Create shared utility**

```typescript
// apps/momai/src/shared/text-utils.ts
const _RE_EMOJI = /[\u{10000}-\u{10ffff}]/gu
const _RE_CODEBLOCK = /```[\s\S]*?```/g
const _RE_INLINE_CODE = /`([^`]+)`/g
const _RE_HEADING = /^#{1,6}\s+/gm
const _RE_BOLD = /\*\*(.+?)\*\*/g
const _RE_ITALIC = /\*(.+?)\*/g
const _RE_LINK = /\[([^\]]+)\]\([^)]+\)/g
const _RE_HR = /^[-*_]{3,}\s*$/gm
const _RE_BLOCKQUOTE = /^>\s?/gm
const _RE_LIST = /^[\s]*[-*+]\s+/gm
const _RE_NUMBERED = /^\s*\d+\.\s+/gm
const _RE_MULTILINE = /\n{3,}/g
const _RE_TRAILING = /\s+$/gm

export function stripMarkdownAndEmoji(text: string): string {
  let s = text
  s = _RE_EMOJI.test(text) ? text.replace(_RE_EMOJI, '') : text
  s = s.replace(_RE_CODEBLOCK, '')
  s = s.replace(_RE_INLINE_CODE, '$1')
  s = s.replace(_RE_HEADING, '')
  s = s.replace(_RE_BOLD, '$1')
  s = s.replace(_RE_ITALIC, '$1')
  s = s.replace(_RE_LINK, '$1')
  s = s.replace(_RE_HR, '')
  s = s.replace(_RE_BLOCKQUOTE, '')
  s = s.replace(_RE_LIST, '')
  s = s.replace(_RE_NUMBERED, '')
  s = s.replace(_RE_MULTILINE, '\n\n')
  s = s.replace(_RE_TRAILING, '')
  return s.trim()
}
```

- [ ] **Step 2: Update both consumers to import from shared**

- [ ] **Step 3: Commit**

```bash
git add apps/momai/src/shared/text-utils.ts apps/momai/src/renderer/src/services/api.ts apps/momai/src/main/ttsService.ts
git commit -m "refactor(ui): deduplicate stripMarkdownAndEmoji into shared utility"
```

### Task P2.3: Memoize createUnifiedSteps

**Files:**
- Modify: `apps/momai/src/renderer/src/features/chat/message/hooks/useMessageState.ts`

- [ ] **Step 1: Add useMemo**

```typescript
const unifiedSteps = useMemo(
  () => createUnifiedSteps(displayActivities, toolSteps, humanizeToolName),
  [displayActivities, toolSteps]
)
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/renderer/src/features/chat/message/hooks/useMessageState.ts
git commit -m "perf(ui): memoize createUnifiedSteps"
```

---

## Phase 3: Hardening (P3)

### Task P3.1: Add depth limit to DynamicRenderer

**Files:**
- Modify: `apps/momai/src/renderer/src/components/DynamicRenderer.tsx`

- [ ] **Step 1: Add depth parameter**

```typescript
export function DynamicRenderer({ schema, onAction, depth = 0 }: DynamicRendererProps & { depth?: number }) {
  if (depth > 20) {
    return <div className="text-xs text-muted-foreground">Nesting depth exceeded</div>
  }
  const renderChild = (child: UIComponent, index: number) => (
    <DynamicRenderer key={index} schema={child} onAction={onAction} depth={depth + 1} />
  )
  // ... rest of component
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/renderer/src/components/DynamicRenderer.tsx
git commit -m "fix(ui): add depth limit to DynamicRenderer"
```

### Task P3.2: Fix LateralBar fallback timer

**Files:**
- Modify: `apps/momai/src/renderer/src/components/LateralBar.tsx`

- [ ] **Step 1: Guard fallback timer**

```typescript
useEffect(() => {
  let loaded = false
  const doLoad = async () => {
    await loadExtensions()
    loaded = true
  }
  doLoad()
  const timer = setTimeout(() => {
    if (!loaded) loadExtensions()
  }, 5000)
  return () => {
    clearTimeout(timer)
  }
}, [])
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/src/renderer/src/components/LateralBar.tsx
git commit -m "perf(ui): guard LateralBar fallback timer"
```
