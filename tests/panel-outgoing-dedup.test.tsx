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
const MSG_TEXT = 'mensagem unica'
const MSG_ID = 'MSG-1'
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

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function makeFetchMock(sendResponse: Promise<Response>) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
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
    if (toolName === 'send_message') {
      return sendResponse
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  })
}

function resolvedSendResponse(): Response {
  return new Response(JSON.stringify({ ok: true, id: MSG_ID }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

function outgoingEvent(text = MSG_TEXT) {
  return {
    eventType: 'message_sent',
    data: {
      jid: JID,
      id: MSG_ID,
      direction: 'outgoing',
      text,
      from: 'Lucas',
      timestamp: NOW_SEC
    }
  }
}

async function renderOverlay(): Promise<void> {
  await act(async () => {
    root.render(
      <WhatsAppNotificationCard
        data={{
          contact: 'Lucas',
          contactJid: JID,
          isHistoryOverlay: true,
          conversationHistory: [
            { id: 'in-1', direction: 'incoming', text: 'oi', timestamp: NOW_SEC - 60, from: 'Lucas' }
          ],
          quickReplies: [],
          onClose: vi.fn()
        }}
      />
    )
  })
  await flush()
}

async function typeAndSend(text = MSG_TEXT): Promise<void> {
  const input = container.querySelector('input[type="text"]') as HTMLInputElement | null
  expect(input).not.toBeNull()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input!, text)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await flush()
  await act(async () => {
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
  await flush()
}

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
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  __resetExtensionEvents()
})

describe('dedup do balão enviado no overlay de histórico', () => {
  it('não duplica quando o evento message_sent chega antes da resposta HTTP', async () => {
    let resolveSend!: (r: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveSend = resolve
    })
    vi.stubGlobal('fetch', makeFetchMock(pending))

    await renderOverlay()
    await typeAndSend()

    await act(async () => {
      __emitExtensionEvent(outgoingEvent())
    })
    await flush()

    await act(async () => {
      resolveSend(resolvedSendResponse())
      await pending
    })
    await flush()

    expect(countOccurrences(container.textContent || '', MSG_TEXT)).toBe(1)
  })

  it('não duplica quando a resposta HTTP chega antes do evento', async () => {
    let resolveSend!: (r: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveSend = resolve
    })
    vi.stubGlobal('fetch', makeFetchMock(pending))

    await renderOverlay()
    await typeAndSend()

    await act(async () => {
      resolveSend(resolvedSendResponse())
      await pending
    })
    await flush()

    await act(async () => {
      __emitExtensionEvent(outgoingEvent())
    })
    await flush()

    expect(countOccurrences(container.textContent || '', MSG_TEXT)).toBe(1)
  })

  it('não colapsa mensagem recebida com o mesmo texto de uma enviada na janela de 2s', async () => {
    vi.stubGlobal('fetch', makeFetchMock(Promise.resolve(resolvedSendResponse())))

    await renderOverlay()
    await typeAndSend()

    await act(async () => {
      __emitExtensionEvent({
        eventType: 'whatsapp_message',
        data: {
          contactJid: JID,
          id: 'incoming-same-text',
          text: MSG_TEXT,
          from: 'Lucas',
          timestamp: NOW_SEC
        }
      })
    })
    await flush()

    expect(countOccurrences(container.textContent || '', MSG_TEXT)).toBe(2)
  })
})
