# WhatsApp Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the WhatsApp extension for MomAI, including generic infrastructure (persistent background workers, SSE event channel, storage API, granular permissions, sidebar panels) and the extension itself (Baileys integration, QR auth, card overlay notifications).

**Architecture:** 3-layer approach — (1) Generic infrastructure that any extension can use, (2) WhatsApp extension using that infra, (3) Frontend UI components for overlay notifications and sidebar panels. Infrastructure first, then extension.

**Tech Stack:** Node.js (scripts/node-core), Electron + React + TypeScript (frontend), Baileys (WhatsApp Web protocol), SSE for events.

---

### File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `scripts/node-core/services/extension-events.js` | SSE event bus for extension push events |
| Modify | `scripts/node-core/services/extension-host-manager.js` | Add persistent worker mode (`startPersistent`) |
| Modify | `scripts/node-core/services/extension-host-worker.js` | Add `momai.storage`, `momai.sendEvent`, `momai.sendStructuredResponse` |
| Modify | `scripts/node-core/services/skill-orchestrator.js` | Add `sidebarPanel` to extension payload |
| Modify | `scripts/node-core/index.js` | Register `GET /extensions/events` route |
| Modify | `scripts/skills/registry.js` | Validate permissions on execute |
| Create | `src/renderer/src/hooks/useExtensionEvents.ts` | Frontend hook for SSE extension events |
| Create | `src/renderer/src/components/ExtensionPanel.tsx` | Right sidebar panel for extension UIs |
| Modify | `src/renderer/src/services/api.ts` | Add `connectExtensionEvents`, update `Extension` interface |
| Modify | `src/renderer/src/components/LateralBar.tsx` | Add Extensões section with panel icons + status dot |
| Create | `scripts/skills/packaged/whatsapp/manifest.json` | WhatsApp extension manifest |
| Create | `scripts/skills/packaged/whatsapp/background-worker.js` | Persistent Baileys process |
| Create | `scripts/skills/packaged/whatsapp/runtime.js` | LLM tools for WhatsApp |
| Create | `scripts/skills/packaged/whatsapp/SKILL.md` | Frontmatter + LLM instructions |
| Create | `scripts/skills/packaged/whatsapp/locales/pt-BR.json` | Portuguese locale |
| Modify | `registry.json` | Add whatsapp extension to registry |

---

### Task 1: Extension Events SSE Service

**Files:**
- Create: `apps/momai/scripts/node-core/services/extension-events.js`

- [ ] **Step 1: Create extension-events.js**

```javascript
// scripts/node-core/services/extension-events.js
const { sendSseHeaders, writeSse } = require('../infrastructure/http-helpers')

const clients = new Set()

function addClient(res) {
  sendSseHeaders(res)
  clients.add(res)
  res.on('close', () => {
    clients.delete(res)
  })
}

function broadcast(eventType, data) {
  const payload = { type: 'extension_event', eventType, data }
  for (const client of clients) {
    if (!writeSse(client, payload)) {
      clients.delete(client)
    }
  }
}

function getClientCount() {
  return clients.size
}

module.exports = { addClient, broadcast, getClientCount }
```

- [ ] **Step 2: Register route in index.js**

In `apps/momai/scripts/node-core/index.js`, add:
```javascript
const extensionEvents = require('./services/extension-events')
```
And register the route alongside other GET routes:
```javascript
router.get('/extensions/events', (req, res) => extensionEvents.addClient(res))
```

- [ ] **Step 3: Add generic extension command route**

In `apps/momai/scripts/node-core/api/routes/extensions.routes.js`, add handler for extension panel and command endpoints:

```javascript
// Inside handleExtensionsRoutes, after existing GET /extensions:

// GET /extensions/:id/panel — fetch panel data from persistent worker
const panelMatch = pathname.match(/^\/extensions\/([^/]+)\/panel$/)
if (panelMatch && req.method === 'GET') {
  const extId = panelMatch[1]
  try {
    const result = await extensionHostManager.sendToPersistent(extId, { toolName: 'panel', args: {} })
    sendJson(res, 200, result || { ok: false, error: 'no_data' })
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message })
  }
  return true
}

// POST /extensions/:id/command — send command to persistent worker
const cmdMatch = pathname.match(/^\/extensions\/([^/]+)\/command$/)
if (cmdMatch && req.method === 'POST') {
  const extId = cmdMatch[1]
  const body = await parseBody(req)
  try {
    const result = await extensionHostManager.sendToPersistent(extId, {
      toolName: body.toolName,
      args: body.args || {}
    })
    sendJson(res, 200, result || { ok: true })
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message })
  }
  return true
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/momai/scripts/node-core/services/extension-events.js apps/momai/scripts/node-core/index.js apps/momai/scripts/node-core/api/routes/extensions.routes.js
git commit -m "feat: add extension events SSE + generic command routes"
```

---

### Task 2: Persistent Background Workers

**Files:**
- Modify: `apps/momai/scripts/node-core/services/extension-host-manager.js`
- Modify: `apps/momai/scripts/node-core/services/extension-host-worker.js`
- Modify: `apps/momai/scripts/node-core/services/index.js` (if init logic needed)

- [ ] **Step 1: Read current extension-host-manager.js**

Read the full file to understand existing structure before modifying.

- [ ] **Step 2: Add persistent mode to extension-host-manager.js**

Add to the class:

```javascript
const extensionEvents = require('./extension-events')

class ExtensionHostManager extends EventEmitter {
  constructor() {
    super()
    this.hosts = new Map()
    this.persistentHosts = new Map()
    this.restartCounts = new Map()
  }

  async startPersistent(skillId, skillPath, manifest) {
    if (this.persistentHosts.has(skillId)) return

    const child = fork(workerPath, [skillId, skillPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, MOMAI_EXTENSION_ID: skillId, MOMAI_PERSISTENT: 'true' }
    })

    const entry = { child, skillId, manifest, startedAt: Date.now() }
    this.persistentHosts.set(skillId, entry)

    child.on('message', (msg) => {
      if (msg.type === 'ready') {
        this.emit(`${skillId}:ready`)
      } else if (msg.type === 'event') {
        extensionEvents.broadcast(msg.eventType, msg.data || {})
      } else if (msg.type === 'structured_response') {
        extensionEvents.broadcast('structured_response', { skillId, ...msg.data })
      } else if (msg.type === 'log') {
        console.log(`[ext:${skillId}]`, msg.message)
      }
    })

    child.on('exit', (code) => {
      this.persistentHosts.delete(skillId)
      const count = (this.restartCounts.get(skillId) || 0) + 1
      this.restartCounts.set(skillId, count)

      if (count <= 3 && this._shouldAutoRestart(skillId)) {
        const delay = Math.min(1000 * Math.pow(3, count - 1), 5000)
        setTimeout(() => this.startPersistent(skillId, skillPath, manifest), delay)
      } else {
        this.emit(`${skillId}:crashed`, { code, restartCount: count })
      }
    })

    // Wait for ready or timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker ready timeout')), 15000)
      this.once(`${skillId}:ready`, () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  stopPersistent(skillId) {
    const entry = this.persistentHosts.get(skillId)
    if (entry) {
      entry.child.kill()
      this.persistentHosts.delete(skillId)
      this.restartCounts.delete(skillId)
    }
  }

  async sendToPersistent(skillId, message) {
    const entry = this.persistentHosts.get(skillId)
    if (!entry) throw new Error(`No persistent host for ${skillId}`)
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Response timeout')), 30000)
      entry.child.once('message', (msg) => {
        if (msg.type === 'response' && msg.requestId === requestId) {
          clearTimeout(timeout)
          resolve(msg.result)
        }
      })
      entry.child.send({ type: 'execute', requestId, payload: message })
    })
  }

  stopAllPersistent() {
    for (const id of this.persistentHosts.keys()) {
      this.stopPersistent(id)
    }
  }

  _shouldAutoRestart(skillId) {
    const entry = this.persistentHosts.get(skillId)
    if (!entry) return true
    const elapsed = Date.now() - entry.startedAt
    return elapsed > 60000 // only restart if it ran for at least 1 min before crash
  }
}
```

- [ ] **Step 3: Update extension-host-worker.js with storage + events**

```javascript
// Add to the worker init, after momai
const fs = require('fs/promises')
const path = require('path')

const dataDir = process.env.MOMAI_DATA_DIR || path.join(__dirname, '..', '..', 'data')
const skillId = process.argv[2]

const storage = {
  async get(key) {
    const filePath = path.join(dataDir, 'extensions', skillId, `${key}.json`)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  },

  async set(key, value) {
    const dir = path.join(dataDir, 'extensions', skillId)
    await fs.mkdir(dir, { recursive: true })
    const serialized = JSON.stringify(value, null, 2)
    if (serialized.length > 1024 * 1024) {
      throw new Error('Storage quota exceeded: max 1MB per extension')
    }
    await fs.writeFile(path.join(dir, `${key}.json`), serialized, 'utf-8')
  }
}

const momai = {
  log: (msg) => process.send({ type: 'log', message: msg }),
  sendEvent: (eventType, data) => process.send({ type: 'event', eventType, data }),
  sendStructuredResponse: (data) => process.send({ type: 'structured_response', data }),
  storage
}
```

- [ ] **Step 4: Initialize persistent workers on app startup**

In `apps/momai/scripts/node-core/services/index.js` (or wherever extensions are initialized), add logic to start persistent workers for installed packaged extensions with `background: true`:

```javascript
async function initPersistentExtensions(extensionHostManager, skillRegistry) {
  const skills = skillRegistry.getAll()
  for (const skill of skills) {
    const manifest = skill.manifest || skill.metadata
    if (manifest?.background) {
      try {
        await extensionHostManager.startPersistent(skill.id, skill.path, manifest)
        console.log(`[ext] Started persistent worker: ${skill.id}`)
      } catch (err) {
        console.error(`[ext] Failed to start persistent worker: ${skill.id}`, err.message)
      }
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/momai/scripts/node-core/services/extension-host-manager.js apps/momai/scripts/node-core/services/extension-host-worker.js
git commit -m "feat: add persistent background workers for extensions"
```

---

### Task 3: Granular Permissions Validation

**Files:**
- Modify: `apps/momai/scripts/skills/registry.js`

- [ ] **Step 1: Add permission validation + background skill routing**

In `apps/momai/scripts/skills/registry.js`, find the `createSkillRegistry` and `execute` functions. Add permission validation and route background skills to the persistent worker:

```javascript
const PERMISSION_RISK = {
  'network:persistent': 'medium',
  'storage:persistent': 'low',
  'filesystem:read': 'low',
  'process:spawn': 'high'
}

function validatePermissions(skillId, manifest) {
  const config = this.permissions?.[skillId] || {}
  const perms = manifest.permissions || []
  for (const perm of perms) {
    if (config[perm] === false) {
      return { ok: false, error: `permission_denied: ${perm}`, permission: perm }
    }
  }
  return { ok: true }
}
```

In the `execute` function, add routing for background skills:

```javascript
async function execute(skillId, input, context, args, toolName) {
  const skill = this.getById(skillId)
  if (!skill) return { ok: false, error: 'skill_not_found' }

  const permCheck = validatePermissions(skillId, skill.manifest)
  if (!permCheck.ok) return permCheck

  // Background skills route to persistent worker instead of forking a new host
  if (skill.manifest?.background) {
    try {
      const payload = { content: input, context, args, toolName }
      const result = await extensionHostManager.sendToPersistent(skillId, payload)
      return { ...result, tool: toolName }
    } catch (err) {
      return { ok: false, error: err.message, tool: toolName }
    }
  }

  // ... rest of existing execute (fork for packaged, direct for builtin)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/momai/scripts/skills/registry.js
git commit -m "feat: granular permission validation on skill execute"
```

---

### Task 4: Storage API in Extension Host Worker

Already covered in Task 2 Step 3 (the `momai.storage` object). No additional task needed.

---

### Task 5: Sidebar Panel in Extension Payload

**Files:**
- Modify: `apps/momai/scripts/node-core/services/skill-orchestrator.js`
- Modify: `apps/momai/src/renderer/src/services/api.ts`

- [ ] **Step 1: Add sidebarPanel to extension payload**

In `apps/momai/scripts/node-core/services/skill-orchestrator.js`, update the `buildExtensionsPayload` function. Find where `features` is constructed and add `sidebarPanel`:

```javascript
features: {
  sidebar: manifest.sidebar === true,
  sidebarPanel: manifest.sidebarPanel || null,
  agent_name: manifest.id
},
```

- [ ] **Step 2: Update frontend Extension interface**

In `apps/momai/src/renderer/src/services/api.ts`, update the interface:

```typescript
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
  features?: {
    sidebar?: boolean
    sidebarPanel?: {
      icon: string
      label: string
      panelEndpoint: string
    } | null
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/scripts/node-core/services/skill-orchestrator.js apps/momai/src/renderer/src/services/api.ts
git commit -m "feat: add sidebarPanel to extension payload and types"
```

---

### Task 6: Frontend Extension Events + Right Panel

**Files:**
- Create: `apps/momai/src/renderer/src/hooks/useExtensionEvents.ts`
- Create: `apps/momai/src/renderer/src/components/ExtensionPanel.tsx`
- Modify: `apps/momai/src/renderer/src/components/LateralBar.tsx`
- Modify: `apps/momai/src/renderer/src/services/api.ts`

- [ ] **Step 1: Create useExtensionEvents hook**

```typescript
// src/renderer/src/hooks/useExtensionEvents.ts
import { useEffect, useRef, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface ExtensionEvent {
  eventType: string
  data: any
}

interface UseExtensionEventsOptions {
  onEvent: (event: ExtensionEvent) => void
  enabled?: boolean
}

export function useExtensionEvents({ onEvent, enabled = true }: UseExtensionEventsOptions) {
  const sourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    if (sourceRef.current) return

    const source = new EventSource(`${API_URL}/extensions/events`)
    sourceRef.current = source

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'extension_event') {
          onEventRef.current({ eventType: data.eventType, data: data.data })
        } else if (data.type === 'structured_response') {
          onEventRef.current({ eventType: 'structured_response', data: data.data })
        }
      } catch (err) {
        console.error('[ExtensionEvents] Parse error:', err)
      }
    }

    source.onerror = () => {
      source.close()
      sourceRef.current = null
      setTimeout(connect, 3000)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close()
      sourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      connect()
    } else {
      disconnect()
    }
    return disconnect
  }, [enabled, connect, disconnect])
}
```

- [ ] **Step 2: Create ExtensionPanel component**

```tsx
// src/renderer/src/components/ExtensionPanel.tsx
import { useEffect, useState, useCallback } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { fetchApi } from '../services/api'
import { getRenderer } from '../components/chat/SkillResponseRegistry'

interface ExtensionPanelProps {
  extensionId: string
  label: string
  icon: string
  panelEndpoint: string
  onClose: () => void
}

export default function ExtensionPanel({ extensionId, label, icon, panelEndpoint, onClose }: ExtensionPanelProps) {
  const [loading, setLoading] = useState(true)
  const [response, setResponse] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPanel = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchApi(panelEndpoint, { method: 'GET' })
      const data = await res.json()
      setResponse(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load panel')
    } finally {
      setLoading(false)
    }
  }, [panelEndpoint])

  useEffect(() => {
    loadPanel()
  }, [loadPanel])

  return (
    <div className="w-80 h-full border-l border-white/5 bg-bg/90 backdrop-blur-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-medium text-sm">{label}</span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text p-1 rounded-lg hover:bg-white/5">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-text-muted text-sm animate-pulse">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}
        {response?.structuredResponse && (
          <ExtensionPanelRenderer response={response.structuredResponse} onAction={loadPanel} />
        )}
        {response?.data && !response?.structuredResponse && (
          <ExtensionPanelRenderer response={{ type: 'generic-extension', data: response.data }} onAction={loadPanel} />
        )}
      </div>
    </div>
  )
}

function ExtensionPanelRenderer({ response, onAction }: { response: any; onAction: () => void }) {
  const Renderer = getRenderer(response.type)
  if (Renderer) {
    return <Renderer data={{ ...response.data, onAction }} />
  }
  return <div className="text-text-muted text-sm">Tipo não suportado: {response.type}</div>
}
```

- [ ] **Step 3: Create connectExtensionEvents in api.ts**

Add to `apps/momai/src/renderer/src/services/api.ts`:

```typescript
export function connectExtensionEvents(
  onEvent: (eventType: string, data: any) => void,
  onError?: (err: any) => void
): () => void {
  const API_URL = getApiUrl()
  const source = new EventSource(`${API_URL}/extensions/events`)

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'extension_event') {
        onEvent(data.eventType, data.data)
      }
    } catch (err) {
      onError?.(err)
    }
  }

  source.onerror = () => {
    source.close()
    onError?.(new Error('SSE connection error'))
  }

  return () => source.close()
}
```

- [ ] **Step 4: Update LateralBar for extension panels**

In `apps/momai/src/renderer/src/components/LateralBar.tsx`, add panel state and section for panel extensions:

1. Add state imports for panel:
```typescript
import { useState, useEffect, useCallback } from 'react'
```

2. Add panel state:
```typescript
const [activePanel, setActivePanel] = useState<string | null>(null)
```

3. After the existing extension rendering block, add a divider and panel section:
```tsx
{/* Extension Panels Section */}
{panelExtensions.length > 0 && (
  <>
    <div className="w-6 h-px bg-white/10 my-1" />
    {panelExtensions.map((ext) => {
      const panel = ext.features?.sidebarPanel
      const isActive = activePanel === ext.id
      return (
        <button
          key={`panel-${ext.id}`}
          onClick={() => setActivePanel(isActive ? null : ext.id)}
          title={panel?.label || ext.name}
          className={`group relative w-10 h-10 rounded-xl shrink-0 bg-transparent border-none flex items-center justify-center transition-all duration-300 ease-out hover:bg-accent/10 ${
            isActive ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text'
          }`}
        >
          {isActive && (
            <div className="absolute -left-3 h-6 w-1 bg-accent rounded-r-full animate-fade-in" />
          )}
          <span className="text-base transition-all duration-300 ease-out group-hover:scale-110">
            {panel?.icon || '🧩'}
          </span>
          {/* Status dot */}
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
        </button>
      )
    })}
  </>
)}
```

4. Filter panel extensions:
```typescript
const panelExtensions = extensions.filter(
  (e) => e.features?.sidebarPanel && e.enabled && e.id !== 'responder'
)
```

5. Render ExtensionPanel when active:
```tsx
return (
  <div className="flex h-full relative">
    <LateralBar
      activeRoute={location.pathname}
      onNavigate={(path) => navigate(path)}
      onOpenSettings={() => openSettings('general')}
      isCompact={isCompact}
    />
    {activePanel && (
      <ExtensionPanel
        extensionId={activePanel}
        label={panelExtensions.find(e => e.id === activePanel)?.features?.sidebarPanel?.label || ''}
        icon={panelExtensions.find(e => e.id === activePanel)?.features?.sidebarPanel?.icon || '🧩'}
        panelEndpoint={panelExtensions.find(e => e.id === activePanel)?.features?.sidebarPanel?.panelEndpoint || ''}
        onClose={() => setActivePanel(null)}
      />
    )}
    <main className="flex-1 overflow-hidden">
      {children}
    </main>
  </div>
)
```

Note: The panel rendering needs to be in the parent component (likely App.tsx) that wraps both LateralBar and the main content area. Update App.tsx to manage `activePanel` state and render ExtensionPanel.

- [ ] **Step 5: Commit**

```bash
git add apps/momai/src/renderer/src/hooks/useExtensionEvents.ts apps/momai/src/renderer/src/components/ExtensionPanel.tsx apps/momai/src/renderer/src/services/api.ts apps/momai/src/renderer/src/components/LateralBar.tsx
git commit -m "feat: extension events hook, right panel, and sidebar panel icons"
```

---

### Task 7: Notification Overlay Component

**Files:**
- Create: `apps/momai/src/renderer/src/components/NotificationOverlay.tsx`
- Modify: `apps/momai/src/renderer/src/App.tsx` (or layout root)

- [ ] **Step 1: Create NotificationOverlay component**

```tsx
// src/renderer/src/components/NotificationOverlay.tsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { useExtensionEvents } from '../hooks/useExtensionEvents'

interface Notification {
  id: string
  eventType: string
  data: any
  receivedAt: number
}

const NOTIFICATION_TIMEOUT = 30000

export default function NotificationOverlay() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const handleEvent = useCallback((event: { eventType: string; data: any }) => {
    if (event.eventType === 'whatsapp_notification' || event.eventType === 'notification') {
      const id = `${event.eventType}-${Date.now()}`
      const notification: Notification = {
        id,
        eventType: event.eventType,
        data: event.data,
        receivedAt: Date.now()
      }
      setNotifications((prev) => [...prev, notification])

      // Auto-dismiss after 30s
      const timer = setTimeout(() => removeNotification(id), NOTIFICATION_TIMEOUT)
      timersRef.current.set(id, timer)
    }
  }, [removeNotification])

  useExtensionEvents({ onEvent: handleEvent })

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  if (notifications.length === 0) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="pointer-events-auto w-full max-w-md mx-4 animate-fade-in"
        >
          <NotificationCard
            notification={notification}
            onDismiss={() => removeNotification(notification.id)}
              onRespond={async (message: string) => {
                try {
                  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
                  await fetch(`${API_URL}/extensions/whatsapp/command`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      toolName: 'send_message',
                      args: {
                        contact: notification.data.contactJid || notification.data.contact,
                        message
                      }
                    })
                  })
                } catch (err) {
                  console.error('Failed to send:', err)
                }
                removeNotification(notification.id)
              }}
          />
        </div>
      ))}
    </div>
  )
}

function NotificationCard({
  notification,
  onDismiss,
  onRespond
}: {
  notification: Notification
  onDismiss: () => void
  onRespond: (message: string) => void
}) {
  const { data } = notification
  const contact = data?.contact || data?.from || 'Desconhecido'
  const message = data?.message || data?.text || ''
  const quickReplies = data?.quickReplies || []

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-lg">
          {data?.contactAvatar || '👤'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{contact}</p>
          <p className="text-xs text-text-muted">WhatsApp</p>
        </div>
        <button onClick={onDismiss} className="text-text-muted hover:text-white p-1">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-300 mb-4">{message}</p>
      <div className="flex flex-wrap gap-2">
        {quickReplies.map((reply: string, i: number) => (
          <button
            key={i}
            onClick={() => onRespond(reply)}
            className="px-3 py-1.5 text-xs rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors border border-accent/20"
          >
            {reply}
          </button>
        ))}
        <button
          onClick={() => onRespond('__open_chat__')}
          className="px-3 py-1.5 text-xs rounded-full bg-white/5 text-text-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          ✏️ Responder
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add NotificationOverlay to App.tsx**

In `apps/momai/src/renderer/src/App.tsx`, import and render NotificationOverlay:

```typescript
import NotificationOverlay from './components/NotificationOverlay'
```

Add inside the root div:
```tsx
<NotificationOverlay />
```

- [ ] **Step 3: Commit**

```bash
git add apps/momai/src/renderer/src/components/NotificationOverlay.tsx apps/momai/src/renderer/src/App.tsx
git commit -m "feat: notification overlay for extension events"
```

---

### Task 8: WhatsApp Extension — Manifest + SKILL.md

**Files:**
- Create: `scripts/skills/packaged/whatsapp/manifest.json`
- Create: `scripts/skills/packaged/whatsapp/SKILL.md`
- Create: `scripts/skills/packaged/whatsapp/locales/pt-BR.json`

- [ ] **Step 1: Create manifest.json**

```json
{
  "id": "whatsapp",
  "name": "WhatsApp",
  "kind": "packaged",
  "description": "Monitora e responde mensagens do WhatsApp",
  "icon": "💚",
  "author": "WesleyQDev",
  "background": true,
  "backgroundScript": "background-worker.js",
  "permissions": ["network:persistent", "storage:persistent"],
  "sidebarPanel": {
    "icon": "💚",
    "label": "WhatsApp",
    "panelEndpoint": "/extensions/whatsapp/panel"
  },
  "version": "0.1.0"
}
```

- [ ] **Step 2: Create SKILL.md**

```markdown
---
id: whatsapp
name: WhatsApp
description: Monitora e responde mensagens do WhatsApp
capabilities:
  intents:
    - enviar mensagem no whatsapp
    - mandar zap
    - whatsapp
    - falar com contato
    - whitelist do whatsapp
  tools:
    - send_message
    - list_contacts
    - add_contact
    - remove_contact
    - set_contact_name
  triggers:
    - mensagem
    - zap
    - whatsapp
---

## Instruções para o LLM

Você pode interagir com o WhatsApp do usuário através das tools abaixo.

### Tools Disponíveis

1. **send_message** — Envia uma mensagem para um contato ou grupo.
   - Parâmetros: `contact` (nome/ID), `message` (texto)
   - Sempre confirme com o usuário antes de enviar mensagens que possam ser ambíguas.
   - Use nomes personalizados se disponíveis.

2. **list_contacts** — Lista os contatos no whitelist.
   - Sem parâmetros.

3. **add_contact** — Adiciona um contato ao whitelist para monitoramento.
   - Parâmetros: `contact` (número ou nome)

4. **remove_contact** — Remove um contato do whitelist.
   - Parâmetros: `contact` (nome ou ID)

5. **set_contact_name** — Define um nome personalizado para um contato (melhora o contexto do LLM).
   - Parâmetros: `contact` (número), `name` (nome personalizado)

### Regras

- Nunca envie mensagens sem confirmar com o usuário em caso de ambiguidade.
- Respeite a whitelist — só mencione monitoramento de contatos que estão nela.
- Se o usuário perguntar "tem mensagens novas?", use list_contacts primeiro.
```

- [ ] **Step 3: Create pt-BR.json**

```json
{
  "name": "WhatsApp",
  "description": "Monitore e responda mensagens do WhatsApp",
  "panel": {
    "title": "WhatsApp",
    "connected": "Conectado",
    "disconnected": "Desconectado",
    "qr_instructions": "Abra o WhatsApp no celular e escaneie o QR code",
    "whitelist": "Contatos Monitorados",
    "add_contact": "Adicionar Contato",
    "remove_contact": "Remover",
    "no_contacts": "Nenhum contato na whitelist"
  },
  "notification": {
    "message_from": "Nova mensagem de",
    "dismiss": "Ignorar",
    "reply": "Responder"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/skills/packaged/whatsapp/
git commit -m "feat: whatsapp extension manifest, SKILL.md, and locales"
```

---

### Task 9: WhatsApp Extension — Background Worker

**Files:**
- Create: `scripts/skills/packaged/whatsapp/background-worker.js`

- [ ] **Step 1: Create background-worker.js**

```javascript
// scripts/skills/packaged/whatsapp/background-worker.js
// Persistent worker for WhatsApp Web connection via Baileys

const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const path = require('path')
const fs = require('fs/promises')

const WHITELIST_KEY = 'whitelist'
const CONTACT_NAMES_KEY = 'contact_names'
const CHECK_INTERVAL = 5000

let sock = null
let whitelist = []
let contactNames = {}
let connected = false

async function main() {
  // Signal ready
  process.send({ type: 'ready' })

  // Load whitelist
  whitelist = (await momai.storage.get(WHITELIST_KEY)) || []
  contactNames = (await momai.storage.get(CONTACT_NAMES_KEY)) || {}

  // Start connection
  await connect()
}

async function connect() {
  try {
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(momai.storage.storageDir, 'baileys-auth')
    )

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      emitOwnEvents: false
    })

    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', handleConnectionUpdate)
    sock.ev.on('messages.upsert', handleMessagesUpsert)

    // Handle QR code
    sock.ev.on('connection.update', ({ qr }) => {
      if (qr) {
        momai.sendEvent('qr_code', { qr, expiresIn: 30 })
      }
    })
  } catch (err) {
    momai.log(`Connection error: ${err.message}`)
    setTimeout(connect, 5000)
  }
}

async function handleConnectionUpdate({ connection, lastDisconnect }) {
  if (connection === 'open') {
    connected = true
    momai.sendEvent('authenticated', { status: 'connected' })
    momai.log('WhatsApp connected')
  } else if (connection === 'close') {
    connected = false
    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
    if (shouldReconnect) {
      momai.sendEvent('connection_status', { status: 'reconnecting' })
      setTimeout(connect, CHECK_INTERVAL)
    } else {
      momai.sendEvent('authenticated', { status: 'logged_out' })
    }
  }
}

async function handleMessagesUpsert({ messages }) {
  for (const msg of messages) {
    if (msg.key.fromMe) continue
    if (!msg.message?.conversation && !msg.message?.extendedTextMessage) continue

    const contact = msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text
    if (!text || !contact) continue

    // Check whitelist
    const isWhitelisted = whitelist.some((w) => contact.includes(w) || w === contact)
    if (!isWhitelisted) continue

    // Resolve display name
    const displayName = contactNames[contact] || contact.split('@')[0] || contact

    // Send notification
    momai.sendEvent('whatsapp_notification', {
      contact: displayName,
      contactJid: contact,
      message: text,
      timestamp: msg.messageTimestamp
    })
  }
}

async function sendMessage(contact, message) {
  if (!sock || !connected) throw new Error('WhatsApp not connected')

  let jid = contact
  if (!jid.includes('@')) {
    jid = `${jid}@s.whatsapp.net`
  }

  await sock.sendMessage(jid, { text: message })
  return { ok: true }
}

async function getPanelData() {
  return {
    connected,
    whitelist: whitelist.map((w) => ({
      id: w,
      name: contactNames[w] || w,
      number: w
    }))
  }
}

// IPC listener for runtime.js commands
process.on('message', async (msg) => {
  if (msg.type === 'execute') {
    try {
      let result
      switch (msg.payload?.toolName) {
        case 'send_message':
          result = await sendMessage(msg.payload.args?.contact, msg.payload.args?.message)
          break
        case 'list_contacts':
          result = { contacts: whitelist.map((w) => ({ id: w, name: contactNames[w] || w })) }
          break
        case 'add_contact':
          if (msg.payload.args?.contact) {
            whitelist.push(msg.payload.args.contact)
            await momai.storage.set(WHITELIST_KEY, whitelist)
            result = { ok: true, contact: msg.payload.args.contact }
          }
          break
        case 'remove_contact':
          whitelist = whitelist.filter((w) => w !== msg.payload.args?.contact)
          await momai.storage.set(WHITELIST_KEY, whitelist)
          result = { ok: true, contact: msg.payload.args?.contact }
          break
        case 'set_contact_name':
          if (msg.payload.args?.contact && msg.payload.args?.name) {
            contactNames[msg.payload.args.contact] = msg.payload.args.name
            await momai.storage.set(CONTACT_NAMES_KEY, contactNames)
            result = { ok: true }
          }
          break
        case 'panel':
          result = await getPanelData()
          break
        default:
          result = await getPanelData()
      }
      process.send({ type: 'response', requestId: msg.requestId, result })
    } catch (err) {
      process.send({ type: 'response', requestId: msg.requestId, result: { ok: false, error: err.message } })
    }
  }
})

main().catch((err) => {
  momai.log(`Fatal error: ${err.message}`)
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```bash
git add scripts/skills/packaged/whatsapp/background-worker.js
git commit -m "feat: whatsapp background worker with Baileys"
```

---

### Task 10: WhatsApp Extension — Runtime (LLM Tools)

**Files:**
- Create: `scripts/skills/packaged/whatsapp/runtime.js`

- [ ] **Step 1: Create runtime.js**

This runtime.js is loaded when the LLM calls a tool. However, since the WhatsApp skill has `background: true`, the `registry.js` routes execution to the persistent worker via `sendToPersistent()`. The persistent worker (`background-worker.js`) handles the actual logic. The runtime.js here serves as the tool definitions and a fallback.

```javascript
// scripts/skills/packaged/whatsapp/runtime.js
// LLM tools for WhatsApp
// Execution is routed to background-worker.js via sendToPersistent in registry.js

module.exports = {
  tools: [
    {
      name: 'send_message',
      description: 'Envia uma mensagem para um contato ou grupo do WhatsApp',
      parameters: {
        type: 'object',
        required: ['contact', 'message'],
        properties: {
          contact: { type: 'string', description: 'Nome ou número do contato' },
          message: { type: 'string', description: 'Texto da mensagem' }
        }
      }
    },
    {
      name: 'list_contacts',
      description: 'Lista os contatos monitorados no WhatsApp',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'add_contact',
      description: 'Adiciona um contato ou grupo para monitoramento',
      parameters: {
        type: 'object',
        required: ['contact'],
        properties: {
          contact: { type: 'string', description: 'Número do contato ou ID do grupo' }
        }
      }
    },
    {
      name: 'remove_contact',
      description: 'Remove um contato ou grupo do monitoramento',
      parameters: {
        type: 'object',
        required: ['contact'],
        properties: {
          contact: { type: 'string', description: 'Número ou ID do contato' }
        }
      }
    },
    {
      name: 'set_contact_name',
      description: 'Define um nome personalizado para um contato (melhora o contexto do LLM)',
      parameters: {
        type: 'object',
        required: ['contact', 'name'],
        properties: {
          contact: { type: 'string', description: 'Número do contato' },
          name: { type: 'string', description: 'Nome personalizado' }
        }
      }
    }
  ],

  async execute({ content, context, args, toolName }) {
    // This is a fallback — for background skills, registry.js routes to sendToPersistent.
    // The background-worker.js handles tool execution and returns structured responses.
    // If this executes directly (no persistent worker), return a fallback error.
    return {
      tool: toolName || 'unknown',
      instruction: JSON.stringify({ error: 'Worker not connected', toolName, args }),
      directResponse: 'Extensão WhatsApp não está ativa. Verifique a conexão no painel.'
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/skills/packaged/whatsapp/runtime.js
git commit -m "feat: whatsapp runtime.js with LLM tools"
```

---

### Task 11: Register Extension in Registry + Update skill-orchestrator

**Files:**
- Modify: `registry.json` (project root)
- Modify: `apps/momai/scripts/node-core/services/skill-orchestrator.js` (whitelist packaged skills)

- [ ] **Step 1: Add WhatsApp to registry.json**

In `registry.json`:
```json
{
  "extensions": [
    {
      "id": "system_info",
      "name": "Dashboard do Sistema",
      "description": "Veja o uso de recursos do seu computador em tempo real (Versão Remota).",
      "author": "WesleyQDev",
      "version": "0.1.0",
      "download_url": "https://github.com/WesleyQDev/momai-system-info/archive/refs/tags/v0.1.zip",
      "is_official": true
    },
    {
      "id": "whatsapp",
      "name": "WhatsApp",
      "description": "Monitore e responda mensagens do WhatsApp",
      "author": "WesleyQDev",
      "version": "0.1.0",
      "download_url": "https://github.com/WesleyQDev/momai-whatsapp-extension/archive/refs/tags/v0.1.zip",
      "is_official": true
    }
  ]
}
```

- [ ] **Step 2: Ensure skill-orchestrator picks up packaged skills**

In `apps/momai/scripts/node-core/services/skill-orchestrator.js`, verify that `buildExtensionsPayload` reads from `scripts/skills/packaged/` directory (the existing code should already do this since `registry.js` loads packaged skills).

- [ ] **Step 3: Commit**

```bash
git add registry.json
git commit -m "feat: add whatsapp extension to registry"
```

---

### Task 12: Verify — Lint + Typecheck

- [ ] **Step 1: Run typecheck**

```bash
cd apps/momai && pnpm typecheck
```
Expected: No type errors.

- [ ] **Step 2: Run lint**

```bash
cd apps/momai && pnpm lint
```
Expected: No lint errors.

- [ ] **Step 3: Start dev mode and verify**

```bash
pnpm dev:all
```
Expected: App starts, sidebar shows WhatsApp icon, extension system loads without errors.

- [ ] **Step 4: Final commit if fixes needed**

```bash
git add -A && git commit -m "fix: lint and typecheck fixes"
```
