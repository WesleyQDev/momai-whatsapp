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
const suggestion = 'Vou confirmar e te aviso ainda hoje.'

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  sdkMocks.apiPost.mockReset().mockResolvedValue({ data: {} })
  sdkMocks.llmComplete.mockReset().mockResolvedValue({ text: '{"suggestions":[]}' })
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  )
  vi.stubGlobal('fetch', fetchMock)
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

describe('WhatsApp quick reply', () => {
  it('sends the displayed suggestion without making another LLM completion', async () => {
    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Ana',
            contactJid: '5511999999999@s.whatsapp.net',
            message: 'Você consegue confirmar?',
            quickReplies: [suggestion],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === suggestion
    )
    expect(button).toBeDefined()

    sdkMocks.apiPost.mockClear()
    const completionsBeforeClick = sdkMocks.llmComplete.mock.calls.length
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(sdkMocks.llmComplete).toHaveBeenCalledTimes(completionsBeforeClick)
    expect(sdkMocks.apiPost).not.toHaveBeenCalledWith(
      '/extensions/llm/complete',
      expect.anything()
    )
    const sendRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/extensions/momai-whatsapp/command')
    )
    expect(sendRequest).toBeDefined()
    expect(JSON.parse(sendRequest?.[1]?.body as string)).toMatchObject({
      toolName: 'send_message',
      args: { message: suggestion }
    })
  })
})
