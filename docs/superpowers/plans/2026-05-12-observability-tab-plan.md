# Observabilidade de IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Observability" tab in the main sidebar, controlled by a toggle in Dev settings, that shows real-time LLM call traces (prompt, timing, tokens, tools).

**Architecture:** Node Core (`chat-service.js`) collects trace data after each `streamLlamaChat` call and emits via existing WebSocket as `observability_trace`. Renderer listens via `useChatHandlers`, buffers traces in React state, and renders them in a new `ObservabilityView` component. Toggle state is stored in `localStorage` (same pattern as dev mode).

**Tech Stack:** Node Core (JS), React 19 + TypeScript, Vitest, TailwindCSS, WebSocket, Heroicons

---

### Task 1: Toggle observability in DeveloperTab

**Files:**
- Modify: `src/renderer/src/components/floating/settings/tabs/DeveloperTab.tsx`
- Test: `src/renderer/src/components/floating/settings/tabs/DeveloperTab.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// DeveloperTab.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DeveloperTab from './DeveloperTab'

const mockT = (key: string) => {
  const labels: Record<string, string> = {
    'settings.dev.observability': 'Observabilidade de IA',
    'settings.dev.observability.desc': 'Monitore chamadas ao LLM em tempo real'
  }
  return labels[key] || key
}

function renderTab(isDevMode = true) {
  localStorage.setItem('momai_dev_mode', String(isDevMode))
  localStorage.removeItem('momai_observability_enabled')

  const handleDevMode = vi.fn()
  return render(<DeveloperTab t={mockT} handleDevMode={handleDevMode} />)
}

describe('DeveloperTab - Observability toggle', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows observability toggle when dev mode is active', () => {
    renderTab(true)
    expect(screen.getByText('Observabilidade de IA')).toBeTruthy()
  })

  it('hides observability toggle when dev mode is inactive', () => {
    renderTab(false)
    expect(screen.queryByText('Observabilidade de IA')).toBeNull()
  })

  it('toggles observability on click and saves to localStorage', () => {
    renderTab(true)
    const toggle = screen.getByTestId('observability-toggle')
    fireEvent.click(toggle)
    expect(localStorage.getItem('momai_observability_enabled')).toBe('true')

    fireEvent.click(toggle)
    expect(localStorage.getItem('momai_observability_enabled')).toBe('false')
  })

  it('dispatches observability sync event on toggle', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    renderTab(true)

    const toggle = screen.getByTestId('observability-toggle')
    fireEvent.click(toggle)

    const calls = dispatchSpy.mock.calls.filter(
      ([e]) => e.type === 'momai_observability_sync'
    )
    expect(calls.length).toBe(1)
    expect((calls[0][0] as CustomEvent).detail).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && npx vitest run --project renderer src/renderer/src/components/floating/settings/tabs/DeveloperTab.test.tsx -t "Observabilidade"`
Expected: FAIL — component doesn't have observability toggle yet

- [ ] **Step 3: Add observability toggle to DeveloperTab**

After the context ring toggle (around line 140), add:

```tsx
const [observabilityEnabled, setObservabilityEnabled] = useState(
  () => localStorage.getItem('momai_observability_enabled') === 'true'
)

// Sync event listener
useEffect(() => {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<boolean>).detail
    if (typeof detail === 'boolean') setObservabilityEnabled(detail)
    else setObservabilityEnabled(localStorage.getItem('momai_observability_enabled') === 'true')
  }
  window.addEventListener('momai_observability_sync', handler as EventListener)
  return () => window.removeEventListener('momai_observability_sync', handler as EventListener)
}, [])

const handleObservabilityToggle = () => {
  const next = !observabilityEnabled
  setObservabilityEnabled(next)
  localStorage.setItem('momai_observability_enabled', String(next))
  window.dispatchEvent(new CustomEvent('momai_observability_sync', { detail: next }))
}
```

And add a feature card (after the `showContextRing` section):

```tsx
{
  id: 'observability',
  title: 'Observabilidade de IA',
  description: 'Monitore chamadas ao LLM em tempo real: prompts, velocidade de tokens, execução de tools e latência.',
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20V10M18 20V4M6 20v-4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  active: isDevMode
},
```

In the feature card rendering loop, when `feature.id === 'observability'` and `isDevMode`, render toggle:

```tsx
{isDevMode && feature.id === 'observability' && (
  <div className="mt-3 flex items-center justify-between">
    <span className="text-sm text-text-muted">Ativar Observabilidade</span>
    <button
      data-testid="observability-toggle"
      onClick={(e) => { e.stopPropagation(); handleObservabilityToggle() }}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${observabilityEnabled ? 'bg-accent/80' : 'bg-white/10'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${observabilityEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai && npx vitest run --project renderer src/renderer/src/components/floating/settings/tabs/DeveloperTab.test.tsx -t "Observabilidade"`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/components/floating/settings/tabs/DeveloperTab.tsx
git add apps/momai/src/renderer/src/components/floating/settings/tabs/DeveloperTab.test.tsx
git commit -m "feat: add observability toggle to dev settings tab"
```

---

### Task 2: Trace broadcast from Node Core (chat-service.js)

**Files:**
- Modify: `scripts/node-core/services/chat-service.js`
- Modify: `scripts/node-core/services/shared-state.js`
- Test: `scripts/node-core/services/chat-service.test.js`

- [ ] **Step 1: Write the failing test**

```typescript
// chat-service.test.js
const { describe, it, expect, vi, beforeEach } = require('vitest')

describe('observability trace emission', () => {
  let broadcastSpy
  let shared

  beforeEach(() => {
    vi.resetModules()
    shared = require('./shared-state')
    shared.observabilityBuffer = []
    broadcastSpy = vi.fn()
    // Mock broadcast in tts-service
    vi.mock('./tts-service', () => ({
      triggerAutoTts: vi.fn(),
      ensurePython: vi.fn(),
      broadcast: broadcastSpy
    }))
  })

  it('broadcasts observability_trace after successful chat completion', async () => {
    const { streamLlamaChat } = require('./chat-service')
    // ... test setup with mocked fetch, etc.
    // Verify broadcast was called with observability_trace
    const traceCalls = broadcastSpy.mock.calls.filter(
      ([msg]) => msg.type === 'observability_trace'
    )
    expect(traceCalls.length).toBeGreaterThan(0)
    expect(traceCalls[0][0].data).toHaveProperty('total_duration')
    expect(traceCalls[0][0].data).toHaveProperty('tokens_per_second')
    expect(traceCalls[0][0].data).toHaveProperty('messages')
  })

  it('adds trace to observabilityBuffer', () => {
    expect(Array.isArray(shared.observabilityBuffer)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && npx vitest run --project scripts scripts/node-core/services/chat-service.test.js -t "observability"`
Expected: FAIL — observabilityBuffer not in shared, no trace emission

- [ ] **Step 3: Add observabilityBuffer to shared-state.js**

```js
// In shared-state.js, add to the exports:
observabilityBuffer: [],
```

- [ ] **Step 4: Emit trace at end of streamLlamaChat in chat-service.js**

Before `endSse(res)` in both success and catch paths (around line 1767 and 1800), add:

```js
// Broadcast observability trace
const totalDuration = Date.now() - t0
const generatedTokens = estimateTokenCount(assembled || fallbackMsg || '')
const trace = {
  id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  timestamp: Date.now(),
  type: toolSteps?.length ? 'llm_call' : (activeSkill ? 'skill' : 'llm_call'),
  total_duration: totalDuration,
  pre_llm_duration: typeof tPreFetch !== 'undefined' ? tPreFetch - t0 : 0,
  first_token_duration: 0,
  generation_duration: 0,
  system_prompt: systemMessage?.content || '',
  messages: currentMessages?.filter(m => m.role !== 'system').slice(-10) || [],
  response: (assembled || fallbackMsg || '').slice(0, 5000),
  tokens_per_second: totalDuration > 0 ? Math.round((generatedTokens / totalDuration) * 1000 * 10) / 10 : 0,
  total_tokens: estimatedPromptTokens + generatedTokens,
  estimated_prompt_tokens: estimatedPromptTokens || 0,
  generated_tokens: generatedTokens,
  model: tierName || 'unknown',
  tier: tierName || 'unknown',
  tools_count: (typeof toolsPayload !== 'undefined' ? toolsPayload.length : 0),
  tool_calls: toolSteps?.length ? toolSteps.map(ts => ({
    tool_name: ts.tool_name || ts.name || 'unknown',
    args: ts.args || ts.input || {},
    result: ts.result ? String(ts.result).slice(0, 500) : undefined,
    duration_ms: ts.duration_ms || 0
  })) : undefined,
  active_skill: activeSkill || undefined,
  thread_id: threadId || 'default',
  status: 'success'
}

// Add to buffer
shared.observabilityBuffer = shared.observabilityBuffer || []
shared.observabilityBuffer.unshift(trace)
if (shared.observabilityBuffer.length > 50) shared.observabilityBuffer.length = 50

// Broadcast via WebSocket
broadcast({ type: 'observability_trace', data: trace })
```

In the catch block, emit with `status: 'error'` and `error: error?.message`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/momai && npx vitest run --project scripts scripts/node-core/services/chat-service.test.js -t "observability"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/momai/scripts/node-core/services/chat-service.js
git add apps/momai/scripts/node-core/services/shared-state.js
git commit -m "feat: emit observability traces from node core via websocket"
```

---

### Task 3: WebSocket handler in renderer (useChatHandlers)

**Files:**
- Modify: `src/renderer/src/hooks/useChatHandlers.ts`
- Test: `src/renderer/src/hooks/useChatHandlers.test.ts`

- [ ] **Step 1: Write failing test for observability_trace handling**

```typescript
// In useChatHandlers.test.ts, add to the main describe block
describe('observability_trace handling', () => {
  it('dispatches momai_observability_trace event with trace data', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const hook = setupHook()

    const traceData = {
      id: 'trace-1',
      type: 'llm_call',
      total_duration: 12300,
      tokens_per_second: 45.2,
      total_tokens: 558,
      messages: [{ role: 'user', content: 'hello' }],
      response: 'Hi there!',
      tool_calls: [],
      status: 'success'
    }

    act(() => {
      hook.handleWsMessage({ type: 'observability_trace', data: traceData })
    })

    const events = dispatchSpy.mock.calls.filter(
      ([e]) => e.type === 'momai_observability_trace'
    )
    expect(events.length).toBe(1)
    expect((events[0][0] as CustomEvent).detail).toEqual(traceData)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && npx vitest run --project renderer src/renderer/src/hooks/useChatHandlers.test.ts -t "observability_trace"`
Expected: FAIL — no handler for observability_trace

- [ ] **Step 3: Add handler in useChatHandlers.ts**

In `handleWsMessage`, add before the else chain end:

```typescript
} else if (msg.type === 'observability_trace') {
  window.dispatchEvent(new CustomEvent('momai_observability_trace', { detail: msg.data }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai && npx vitest run --project renderer src/renderer/src/hooks/useChatHandlers.test.ts -t "observability_trace"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/hooks/useChatHandlers.ts
git commit -m "feat: handle observability_trace websocket events in renderer"
```

---

### Task 4: ObservabilityView component

**Files:**
- Create: `src/renderer/src/views/ObservabilityView.tsx`
- Create: `src/renderer/src/views/ObservabilityView.test.tsx`

- [ ] **Step 1: Write failing test for ObservabilityView**

```typescript
// ObservabilityView.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ObservabilityView from './ObservabilityView'

const mockTraces = [
  {
    id: 'trace-1',
    timestamp: Date.now() - 10000,
    type: 'llm_call',
    total_duration: 12300,
    pre_llm_duration: 340,
    first_token_duration: 890,
    generation_duration: 11070,
    system_prompt: 'You are a helpful assistant.',
    messages: [
      { role: 'user', content: 'Qual a previsão do tempo em SP?' },
      { role: 'assistant', content: 'Em São Paulo faz 28°C.' }
    ],
    response: 'Em São Paulo faz 28°C.',
    tokens_per_second: 45.2,
    total_tokens: 558,
    estimated_prompt_tokens: 420,
    generated_tokens: 138,
    model: 'llama-3.2',
    tier: 'pro',
    tools_count: 1,
    tool_calls: [
      { tool_name: 'get_weather', args: { city: 'SP' }, result: '28°C', duration_ms: 890 }
    ],
    thread_id: 'default',
    status: 'success'
  },
  {
    id: 'trace-2',
    timestamp: Date.now() - 60000,
    type: 'skill',
    total_duration: 1200,
    tokens_per_second: 0,
    total_tokens: 0,
    model: 'llama-3.2',
    tier: 'pro',
    tools_count: 0,
    thread_id: 'default',
    status: 'success',
    active_skill: 'weather'
  }
]

describe('ObservabilityView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders empty state when no traces', () => {
    render(<ObservabilityView />)
    expect(screen.getByText(/Nenhum trace/i)).toBeTruthy()
  })

  it('renders trace list with mock data', () => {
    render(<ObservabilityView initialTraces={mockTraces} />)
    expect(screen.getByText('45.2')).toBeTruthy()
    expect(screen.getByText('12.3s')).toBeTruthy()
    expect(screen.getByText(/llama-3.2/i)).toBeTruthy()
  })

  it('expands trace on click to show details', () => {
    render(<ObservabilityView initialTraces={mockTraces} />)
    const expandBtn = screen.getAllByRole('button', { expanded: false })[0]
    fireEvent.click(expandBtn)
    expect(screen.getByText(/System Prompt/i)).toBeTruthy()
    expect(screen.getByText(/get_weather/i)).toBeTruthy()
    expect(screen.getByText(/Pre-LLM/i)).toBeTruthy()
  })

  it('filters traces by type', () => {
    render(<ObservabilityView initialTraces={mockTraces} />)
    // Click "Skills" filter
    fireEvent.click(screen.getByText(/Skills/i))
    expect(screen.queryByText('45.2')).toBeNull()
    // Click "All" filter
    fireEvent.click(screen.getByText(/Todas/i))
    expect(screen.getByText('45.2')).toBeTruthy()
  })

  it('syncs with momai_observability_trace events', () => {
    render(<ObservabilityView />)
    act(() => {
      window.dispatchEvent(new CustomEvent('momai_observability_trace', {
        detail: mockTraces[0]
      }))
    })
    expect(screen.getByText('45.2')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && npx vitest run --project renderer src/renderer/src/views/ObservabilityView.test.tsx`
Expected: FAIL — component doesn't exist yet

- [ ] **Step 3: Implement ObservabilityView component**

```tsx
// ObservabilityView.tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { ChartBarIcon, FunnelIcon } from '@heroicons/react/24/outline'

interface ToolCall {
  tool_name: string
  args: any
  result?: string
  duration_ms?: number
}

interface Trace {
  id: string
  timestamp: number
  type: 'llm_call' | 'skill' | 'fallback'
  total_duration: number
  pre_llm_duration?: number
  first_token_duration?: number
  generation_duration?: number
  system_prompt?: string
  messages?: { role: string; content: string }[]
  response?: string
  tokens_per_second: number
  total_tokens: number
  estimated_prompt_tokens?: number
  generated_tokens?: number
  model: string
  tier: string
  tools_count?: number
  tool_calls?: ToolCall[]
  active_skill?: string
  thread_id: string
  status: 'success' | 'error'
  error?: string
}

interface ObservabilityViewProps {
  initialTraces?: Trace[]
}

const TYPE_ICONS: Record<string, string> = {
  llm_call: '🤖',
  skill: '⚡',
  fallback: '⚠'
}

const TYPE_COLORS: Record<string, string> = {
  llm_call: 'text-blue-400',
  skill: 'text-green-400',
  fallback: 'text-yellow-400'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function TokenSpeedBar({ speed, maxSpeed }: { speed: number; maxSpeed: number }) {
  const pct = maxSpeed > 0 ? Math.min(100, (speed / maxSpeed) * 100) : 0
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-muted w-10 text-right tabular-nums">{speed}</span>
    </div>
  )
}

function TrendGraph({ traces }: { traces: Trace[] }) {
  const llmTraces = traces.filter(t => t.type === 'llm_call' && t.tokens_per_second > 0).slice(-30)
  if (llmTraces.length < 2) return null

  const maxTps = Math.max(...llmTraces.map(t => t.tokens_per_second))
  const w = 160
  const h = 40
  const points = llmTraces.map((t, i) => {
    const x = (i / (llmTraces.length - 1)) * w
    const y = h - (t.tokens_per_second / maxTps) * h
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="bg-white/5 rounded-xl p-4">
      <div className="text-sm text-text-muted mb-2">Token Speed (tok/s) — últimos {llmTraces.length}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[200px] h-10">
        <polyline fill="none" stroke="rgb(99,102,241)" strokeWidth="2" points={points} />
      </svg>
    </div>
  )
}

function TraceDetail({ trace }: { trace: Trace }) {
  const [isOpen, setIsOpen] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)

  return (
    <div className="border-b border-white/5 last:border-none">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <span className={TYPE_COLORS[trace.type]}>{TYPE_ICONS[trace.type]}</span>
        <span className="text-xs text-text-muted w-10">{formatTime(trace.timestamp)}</span>
        <span className="text-xs text-text-muted w-16">{trace.type === 'llm_call' ? 'LLM' : trace.active_skill || trace.type}</span>
        <span className="text-xs text-text-muted w-16">{formatDuration(trace.total_duration)}</span>
        {trace.type === 'llm_call' && (
          <div className="flex-1">
            <TokenSpeedBar speed={trace.tokens_per_second} maxSpeed={Math.max(trace.tokens_per_second * 1.3, 1)} />
          </div>
        )}
        <span className="text-xs text-text-muted w-14 tabular-nums">{trace.total_tokens || '-'}</span>
        <span className="text-xs text-text-muted">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div ref={detailRef} className="px-4 pb-4 space-y-3 animate-fade-in">
          {trace.status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
              Error: {trace.error || 'Unknown error'}
            </div>
          )}

          {trace.system_prompt && (
            <div>
              <div className="text-xs text-text-muted mb-1">▶ System Prompt ({(trace.estimated_prompt_tokens || 0)} tokens)</div>
              <pre className="text-xs text-text bg-white/5 rounded-lg p-3 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                {trace.system_prompt.slice(0, 2000)}
              </pre>
            </div>
          )}

          {trace.messages && trace.messages.length > 0 && (
            <div>
              <div className="text-xs text-text-muted mb-1">▶ Messages ({trace.messages.length})</div>
              <div className="space-y-1">
                {trace.messages.map((msg, i) => (
                  <div key={i} className={`text-xs rounded-lg p-2 ${msg.role === 'user' ? 'bg-blue-500/10' : msg.role === 'tool' ? 'bg-green-500/10' : 'bg-white/5'}`}>
                    <span className="font-bold text-text-muted">{msg.role}: </span>
                    <span className="text-text">{msg.content.slice(0, 300)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-text-muted mb-1">▶ Timing</div>
            <div className="bg-white/5 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">├─ Pre-LLM</span>
                <span className="text-text">{formatDuration(trace.pre_llm_duration || 0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">├─ First Token</span>
                <span className="text-text">{formatDuration(trace.first_token_duration || 0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">├─ Generation</span>
                <span className="text-text">{formatDuration(trace.generation_duration || 0)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold border-t border-white/10 pt-1 mt-1">
                <span className="text-text-muted">└─ Total</span>
                <span className="text-text">{formatDuration(trace.total_duration)}</span>
              </div>
            </div>
          </div>

          {trace.tool_calls && trace.tool_calls.length > 0 && (
            <div>
              <div className="text-xs text-text-muted mb-1">▶ Tools ({trace.tool_calls.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-muted border-b border-white/10">
                      <th className="text-left py-1 pr-2">Tool</th>
                      <th className="text-left py-1 pr-2">Args</th>
                      <th className="text-left py-1 pr-2">Duration</th>
                      <th className="text-left py-1">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trace.tool_calls.map((tc, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="py-1 pr-2 text-accent">{tc.tool_name}</td>
                        <td className="py-1 pr-2 text-text-muted font-mono max-w-[120px] truncate">
                          {JSON.stringify(tc.args)}
                        </td>
                        <td className="py-1 pr-2 text-text-muted">{tc.duration_ms ? formatDuration(tc.duration_ms) : '-'}</td>
                        <td className="py-1 text-text-muted max-w-[120px] truncate">{tc.result || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ObservabilityView({ initialTraces }: ObservabilityViewProps) {
  const [traces, setTraces] = useState<Trace[]>(initialTraces || [])
  const [filter, setFilter] = useState<'all' | 'llm_call' | 'skill' | 'error'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const handler = (event: Event) => {
      const trace = (event as CustomEvent<Trace>).detail
      setTraces(prev => [trace, ...prev].slice(0, 50))
    }
    window.addEventListener('momai_observability_trace', handler as EventListener)
    return () => window.removeEventListener('momai_observability_trace', handler as EventListener)
  }, [])

  const filteredTraces = traces.filter(t => {
    if (filter === 'error') return t.status === 'error'
    if (filter !== 'all') return t.type === filter
    return true
  }).filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.model?.toLowerCase().includes(q) ||
      t.active_skill?.toLowerCase().includes(q) ||
      t.tool_calls?.some(tc => tc.tool_name.toLowerCase().includes(q)) ||
      t.response?.toLowerCase().includes(q) ||
      t.messages?.some(m => m.content.toLowerCase().includes(q))
    )
  })

  const llmTraces = traces.filter(t => t.type === 'llm_call' && t.tokens_per_second > 0)

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <div className="p-4 border-b border-white/5">
        <h2 className="text-lg font-semibold mb-1">Observabilidade</h2>
        <p className="text-xs text-text-muted">Monitoramento de chamadas ao LLM em tempo real</p>
      </div>

      {llmTraces.length >= 2 && (
        <div className="px-4 pt-4">
          <TrendGraph traces={llmTraces} />
        </div>
      )}

      <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5">
        {(['all', 'llm_call', 'skill', 'error'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              filter === f
                ? 'bg-accent/20 text-accent'
                : 'bg-white/5 text-text-muted hover:bg-white/10'
            }`}
          >
            {f === 'all' ? 'Todas' : f === 'llm_call' ? 'LLM' : f === 'skill' ? 'Skills' : 'Erros'}
          </button>
        ))}
        <div className="flex-1" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-text placeholder-text-muted w-32 focus:outline-none focus:border-accent/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filteredTraces.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            {traces.length === 0
              ? 'Nenhum trace ainda. Faça uma pergunta à MomAI para começar.'
              : 'Nenhum resultado para este filtro.'}
          </div>
        ) : (
          <div>
            {filteredTraces.map(trace => (
              <TraceDetail key={trace.id} trace={trace} />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/5 text-xs text-text-muted flex items-center">
        <span>{traces.length} traces coletados</span>
        <span className="mx-2">·</span>
        <span>{llmTraces.length > 0 ? `Média: ${(llmTraces.reduce((a, t) => a + t.tokens_per_second, 0) / llmTraces.length).toFixed(1)} tok/s` : 'Aguardando dados...'}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/momai && npx vitest run --project renderer src/renderer/src/views/ObservabilityView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/views/ObservabilityView.tsx
git add apps/momai/src/renderer/src/views/ObservabilityView.test.tsx
git commit -m "feat: add ObservabilityView component with trace list, filters, and detail expansion"
```

---

### Task 5: Register view in routing + LateralBar button

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/MainViewRenderer.tsx`
- Modify: `src/renderer/src/components/LateralBar.tsx`
- Test: `src/renderer/src/components/LateralBar.test.tsx`

- [ ] **Step 1: Write failing test for LateralBar observability button**

```typescript
// LateralBar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import LateralBar from './LateralBar'

describe('LateralBar - observability button', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows observability button when enabled in localStorage', () => {
    localStorage.setItem('momai_observability_enabled', 'true')
    render(<LateralBar activeRoute="/" onNavigate={vi.fn()} />)
    expect(screen.getByTitle(/Observabilidade/i)).toBeTruthy()
  })

  it('hides observability button when disabled in localStorage', () => {
    localStorage.setItem('momai_observability_enabled', 'false')
    render(<LateralBar activeRoute="/" onNavigate={vi.fn()} />)
    expect(screen.queryByTitle(/Observabilidade/i)).toBeNull()
  })

  it('highlights observability button when route is /observability', () => {
    localStorage.setItem('momai_observability_enabled', 'true')
    render(<LateralBar activeRoute="/observability" onNavigate={vi.fn()} />)
    const btn = screen.getByTitle(/Observabilidade/i)
    expect(btn.className).toContain('text-accent')
  })

  it('syncs observability state with localStorage on event', () => {
    localStorage.setItem('momai_observability_enabled', 'false')
    const { rerender } = render(<LateralBar activeRoute="/" onNavigate={vi.fn()} />)
    expect(screen.queryByTitle(/Observabilidade/i)).toBeNull()

    localStorage.setItem('momai_observability_enabled', 'true')
    window.dispatchEvent(new CustomEvent('momai_observability_sync'))
    rerender(<LateralBar activeRoute="/" onNavigate={vi.fn()} />)
    expect(screen.getByTitle(/Observabilidade/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/momai && npx vitest run --project renderer src/renderer/src/components/LateralBar.test.tsx -t "observability"`
Expected: FAIL — button not in LateralBar yet

- [ ] **Step 3: Register view + add LateralBar button**

In **App.tsx**, add to `viewMapping` (around line 143):
```tsx
'/observability': 'ObservabilityDashboard',
```

In **MainViewRenderer.tsx**, add import and VIEW_MAP entry:
```tsx
import ObservabilityView from '../views/ObservabilityView'

const VIEW_MAP: Record<string, React.ComponentType<any>> = {
  // ... existing entries
  ObservabilityDashboard: ObservabilityView,
}
```

In **LateralBar.tsx**, add import:
```tsx
import { ChartBarIcon } from '@heroicons/react/24/outline'
```

Add state for observability:
```tsx
const [observabilityEnabled, setObservabilityEnabled] = useState(
  () => localStorage.getItem('momai_observability_enabled') === 'true'
)

useEffect(() => {
  const handler = () => {
    setObservabilityEnabled(localStorage.getItem('momai_observability_enabled') === 'true')
  }
  window.addEventListener('momai_observability_sync', handler)
  return () => window.removeEventListener('momai_observability_sync', handler)
}, [])
```

Add button after the About button (around line 228):
```tsx
{observabilityEnabled && (
  <button
    onClick={() => onNavigate('/observability')}
    title="Observabilidade"
    className={`group relative ${isCompact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${activeRoute === '/observability' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'}`}
  >
    {activeRoute === '/observability' && (
      <div className={`absolute ${isCompact ? '-left-2 h-4' : '-left-3 h-6'} w-1 bg-accent rounded-r-full animate-fade-in`} />
    )}
    <ChartBarIcon className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} transition-all duration-300 ease-out group-hover:scale-110`} />
  </button>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/momai && npx vitest run --project renderer src/renderer/src/components/LateralBar.test.tsx -t "observability"`
Expected: PASS
Also run: `cd apps/momai && npx vitest run --project renderer` — confirm no regressions

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/App.tsx
git add apps/momai/src/renderer/src/components/MainViewRenderer.tsx
git add apps/momai/src/renderer/src/components/LateralBar.tsx
git add apps/momai/src/renderer/src/components/LateralBar.test.tsx
git commit -m "feat: register observability view in routing and add sidebar button"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Run full test suite**

Run: `cd apps/momai && pnpm test`
Expected: All tests pass (including existing ones, no regressions)

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/momai && pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat: add AI observability tab with real-time LLM tracing"
```
