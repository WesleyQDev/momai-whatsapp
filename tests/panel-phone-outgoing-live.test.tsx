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
const PAISAO_PHONE_JID = '554196863850@s.whatsapp.net'
const PAISAO_LID = '179423064117270@lid'
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

beforeEach(() => {
  __resetExtensionEvents()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.stubGlobal('location', { origin: API_BASE })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return new Response(JSON.stringify({ history: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })
  )
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('Live updates for messages sent from user smartphone', () => {
  it('appends outgoing message sent from smartphone when overlay was opened with LID', async () => {
    // Overlay opened for Paisão with contactJid set to LID
    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Paisão',
            contactJid: PAISAO_LID,
            jid: PAISAO_PHONE_JID,
            isHistoryOverlay: true,
            conversationHistory: [
              { id: 'in-1', direction: 'incoming', text: 'Kkk', timestamp: NOW_SEC - 60, from: 'Paisão' }
            ],
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    expect(container.textContent).toContain('Kkk')
    expect(container.textContent).not.toContain('Ai')

    // Message sent from physical smartphone addressing standard phone JID
    await act(async () => {
      __emitExtensionEvent({
        eventType: 'message_sent',
        data: {
          jid: PAISAO_PHONE_JID,
          contactJid: PAISAO_PHONE_JID,
          contact: 'Paisão',
          contactName: 'Paisão',
          lid: PAISAO_LID,
          id: 'MSG-PHONE-1',
          direction: 'outgoing',
          text: 'Ai',
          from: 'Você',
          timestamp: NOW_SEC
        }
      })
    })
    await flush()

    // Message 'Ai' must appear in the overlay history
    expect(container.textContent).toContain('Ai')
  })

  it('appends outgoing message sent from smartphone when matching by non-generic contact name', async () => {
    // Overlay opened with LID and no JID prop, but contact name "Paisão"
    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Paisão',
            contactJid: PAISAO_LID,
            isHistoryOverlay: true,
            conversationHistory: [
              { id: 'in-1', direction: 'incoming', text: 'Kkk', timestamp: NOW_SEC - 60, from: 'Paisão' }
            ],
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    // Message sent from smartphone carrying contact: 'Paisão'
    await act(async () => {
      __emitExtensionEvent({
        eventType: 'message_sent',
        data: {
          jid: PAISAO_PHONE_JID,
          contact: 'Paisão',
          contactName: 'Paisão',
          id: 'MSG-PHONE-2',
          direction: 'outgoing',
          text: 'Ai',
          from: 'Você',
          timestamp: NOW_SEC
        }
      })
    })
    await flush()

    expect(container.textContent).toContain('Ai')
  })
})
