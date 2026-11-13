// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdkMocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  llmComplete: vi.fn()
}))

vi.mock('momai:sdk', () => ({
  default: {
    api: { post: (...args: unknown[]) => sdkMocks.apiPost(...args) },
    llm: { complete: (...args: unknown[]) => sdkMocks.llmComplete(...args) },
    i18n: { getLocale: () => 'pt-BR' },
    media: { url: (_extensionId: string, file: string) => `/extensions/momai-whatsapp/${file}` }
  }
}))

import WhatsAppNotificationCard from '../src/panel'
import { __emitExtensionEvent, __resetExtensionEvents } from './stubs/momai-events'

const API_BASE = 'http://127.0.0.1:8050'
const JID = '5511999999999@s.whatsapp.net'
const MSG_ID = 'MSG-STATUS-1'
const NOW_SEC = Math.floor(Date.now() / 1000)

let container: HTMLDivElement
let root: Root

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe('Live message status updates in overlay', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    sdkMocks.apiPost.mockReset().mockResolvedValue({ data: {} })
    sdkMocks.llmComplete.mockReset().mockResolvedValue({ text: '{"suggestions":[]}' })
    __resetExtensionEvents()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getApiBaseUrl: () => API_BASE,
        getSessionToken: () => 'test-session-token'
      }
    })
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      let toolName = ''
      try {
        toolName = JSON.parse(String(init?.body || '{}'))?.toolName || ''
      } catch {}
      if (toolName === 'get_conversation') {
        return new Response(JSON.stringify({ history: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }) as any

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('transitions from delivered (status 3, grey) to read (status 4, blue) on message_status event', async () => {
    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Paisão',
            contactJid: JID,
            isHistoryOverlay: true,
            conversationHistory: [
              {
                id: MSG_ID,
                direction: 'outgoing',
                text: 'kkkk',
                status: 3,
                timestamp: NOW_SEC
              }
            ],
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    // Initially status 3: delivered (double check grey)
    let statusSpan = container.querySelector('span[title="Entregue"]')
    expect(statusSpan).not.toBeNull()
    expect(statusSpan?.className).not.toContain('text-[#53bdeb]')

    // Recipient reads the message -> Baileys emits message_status with status 4
    await act(async () => {
      __emitExtensionEvent({
        eventType: 'message_status',
        data: {
          id: MSG_ID,
          jid: JID,
          status: 4
        }
      })
    })
    await flush()

    // Now status 4: read (double check blue)
    statusSpan = container.querySelector('span[title="Lida"]')
    expect(statusSpan).not.toBeNull()
    expect(statusSpan?.className).toContain('text-[#53bdeb]')
    const polylines = statusSpan!.querySelectorAll('polyline')
    expect(polylines.length).toBe(2)
  })

  it('does not regress from read (status 4) back to sent (status 2) if an older status event arrives', async () => {
    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Paisão',
            contactJid: JID,
            isHistoryOverlay: true,
            conversationHistory: [
              {
                id: MSG_ID,
                direction: 'outgoing',
                text: 'pl',
                status: 4,
                timestamp: NOW_SEC
              }
            ],
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    // Verify it starts as Lida (blue)
    let statusSpan = container.querySelector('span[title="Lida"]')
    expect(statusSpan).not.toBeNull()

    // Emitting an older status 2 (e.g. from a delayed message_sent or send completion)
    await act(async () => {
      __emitExtensionEvent({
        eventType: 'message_status',
        data: {
          id: MSG_ID,
          jid: JID,
          status: 2
        }
      })
    })
    await flush()

    // Must still remain Lida (blue)
    statusSpan = container.querySelector('span[title="Lida"]')
    expect(statusSpan).not.toBeNull()
    expect(statusSpan?.className).toContain('text-[#53bdeb]')
  })

  it('preserves read status (status 4) even when HTTP sendReply resolves afterwards with status 2', async () => {
    let resolveSend!: (resp: Response) => void
    const sendPromise = new Promise<Response>((resolve) => {
      resolveSend = resolve
    })

    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      let toolName = ''
      try {
        toolName = JSON.parse(String(init?.body || '{}'))?.toolName || ''
      } catch {}
      if (toolName === 'send_message') {
        return sendPromise
      }
      return new Response(JSON.stringify({ ok: true, history: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }) as any

    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Paisão',
            contactJid: JID,
            isHistoryOverlay: true,
            conversationHistory: [],
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    // 1. Send message via UI input
    const input = container.querySelector('input[type="text"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(input!, 'nova mensagem')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await flush()

    // 2. Worker emits message_sent with id MSG-LIVE-1
    await act(async () => {
      __emitExtensionEvent({
        eventType: 'message_sent',
        data: {
          id: 'MSG-LIVE-1',
          jid: JID,
          text: 'nova mensagem',
          direction: 'outgoing',
          status: 2,
          timestamp: Math.floor(Date.now() / 1000)
        }
      })
    })
    await flush()

    let statusSpan = container.querySelector('span[title="Enviada"]')
    expect(statusSpan).not.toBeNull()

    // 3. Live read event arrives while HTTP send is still in flight!
    await act(async () => {
      __emitExtensionEvent({
        eventType: 'message_status',
        data: {
          id: 'MSG-LIVE-1',
          jid: JID,
          status: 4
        }
      })
    })
    await flush()

    statusSpan = container.querySelector('span[title="Lida"]')
    expect(statusSpan).not.toBeNull()
    expect(statusSpan?.className).toContain('text-[#53bdeb]')

    // 4. HTTP sendReply finally resolves now with id: MSG-LIVE-1
    await act(async () => {
      resolveSend(
        new Response(JSON.stringify({ ok: true, id: 'MSG-LIVE-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    })
    await flush()

    // 5. Must NOT be downgraded to status 2 (Enviada) — must stay status 4 (Lida)!
    statusSpan = container.querySelector('span[title="Lida"]')
    expect(statusSpan).not.toBeNull()
    expect(statusSpan?.className).toContain('text-[#53bdeb]')
  })
})
