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

const API_BASE = 'http://127.0.0.1:8050'
const verse = '"For God so loved the world." (John 3:16 - KJV)'

let container: HTMLDivElement
let root: Root

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function composer(): HTMLInputElement | null {
  return container.querySelector('input[type="text"]')
}

beforeEach(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  sdkMocks.apiPost.mockReset().mockResolvedValue({ data: {} })
  sdkMocks.llmComplete.mockReset().mockResolvedValue({ text: '{"suggestions":[]}' })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
  )
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
})

describe('WhatsApp composer initial draft', () => {
  it('pre-fills the message input with a shared verse', async () => {
    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Ana',
            contactJid: '5511999999999@s.whatsapp.net',
            message: '',
            initialDraft: verse,
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    expect(composer()?.value).toBe(verse)
  })

  it('keeps the composer empty without a draft and never clobbers typed text', async () => {
    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Ana',
            contactJid: '5511999999999@s.whatsapp.net',
            message: '',
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    expect(composer()?.value).toBe('')
  })
})
