// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('momai:sdk', () => ({
  default: {
    api: { post: vi.fn().mockResolvedValue({ data: {} }) },
    llm: { complete: vi.fn().mockResolvedValue({ text: '{"suggestions":[]}' }) },
    i18n: { getLocale: () => 'pt-BR' },
    media: { url: (_extensionId: string, file: string) => `/extensions/momai-whatsapp/${file}` }
  }
}))

import WhatsAppNotificationCard from '../src/panel'

const API_BASE = 'http://127.0.0.1:8050'

let container: HTMLDivElement
let root: Root

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function presenceCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .map((call) => {
      const init = call[1] as RequestInit | undefined
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
      return { url: String(call[0]), init, body }
    })
    .filter((entry) => entry.body?.toolName === 'history_overlay_presence')
}

beforeEach(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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

describe('history overlay presence announcements', () => {
  it('announces opened on mount and a keepalive closed on pagehide', async () => {
    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Ana',
            contactJid: '5511999999999@s.whatsapp.net',
            message: '',
            isHistoryOverlay: true,
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>

    const opened = presenceCalls(fetchMock).filter((entry) => entry.body.args.state === 'opened')
    expect(opened).toHaveLength(1)
    expect(opened[0].init?.keepalive).toBe(true)

    fetchMock.mockClear()
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
    })

    const closed = presenceCalls(fetchMock).filter((entry) => entry.body.args.state === 'closed')
    expect(closed).toHaveLength(1)
    expect(closed[0].init?.keepalive).toBe(true)
  })
})
