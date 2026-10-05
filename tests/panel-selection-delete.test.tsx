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

let container: HTMLDivElement
let root: Root

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

describe('WhatsApp message selection and deletion flow', () => {
  it('enters selection mode on clicking delete in context menu and opens confirmation dialog only from selection bar', async () => {
    const messages = [
      {
        id: 'msg-1',
        timestamp: 1000,
        direction: 'incoming' as const,
        text: 'Olá tudo bem?',
        from: 'Lucas'
      },
      {
        id: 'msg-2',
        timestamp: 2000,
        direction: 'outgoing' as const,
        text: 'Tudo bem e com você?',
        from: 'Você'
      }
    ]

    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Lucas',
            contactJid: '5511999999999@s.whatsapp.net',
            isHistoryOverlay: true,
            conversationHistory: messages,
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    // Right-click first message
    const msg1El = container.querySelector('#msg-1000')
    expect(msg1El).not.toBeNull()

    await act(async () => {
      msg1El!.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100
        })
      )
    })
    await flush()

    // Context menu should be visible with delete option
    const deleteOption = Array.from(document.body.querySelectorAll('button[role="menuitem"]')).find(
      (btn) => btn.textContent?.includes('Apagar')
    )
    expect(deleteOption).toBeDefined()

    // Click delete option in context menu
    await act(async () => {
      deleteOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    // Confirmation dialog should NOT be shown yet
    let confirmModal = document.body.querySelector('h3')
    expect(confirmModal?.textContent).toBeUndefined()

    // Selection bar should be active with 1 selected
    expect(container.textContent).toContain('1 selecionada')

    // Click second message to select it as well
    const msg2El = container.querySelector('#msg-2000')
    expect(msg2El).not.toBeNull()
    await act(async () => {
      msg2El!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(container.textContent).toContain('2 selecionadas')

    // Now click the delete/trash button on the selection toolbar
    const deleteButtonInBar = container.querySelector('button[title="Apagar"]')
    expect(deleteButtonInBar).not.toBeNull()

    await act(async () => {
      deleteButtonInBar!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    // Now confirmation modal should appear with "Deseja apagar as 2 mensagens?"
    confirmModal = document.body.querySelector('h3')
    expect(confirmModal?.textContent).toContain('Deseja apagar as 2 mensagens?')
    expect(document.body.textContent).toContain('Apagar para todos')
    expect(document.body.textContent).toContain('Apagar para mim')
  })

  it('shows only "Ir para a mensagem" and "Desafixar" on right-clicking pinned message banner', async () => {
    const messages = [
      {
        id: 'msg-1',
        timestamp: 1000,
        direction: 'incoming' as const,
        text: 'Aviso importante!',
        from: 'Chefe'
      }
    ]

    localStorage.setItem('momai_wa_pinned_msgs_5511999999999@s.whatsapp.net', JSON.stringify([1000]))

    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Chefe',
            contactJid: '5511999999999@s.whatsapp.net',
            isHistoryOverlay: true,
            conversationHistory: messages,
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    // Find the pinned message banner button
    const pinnedBtn = container.querySelector('.group\\/pin')
    expect(pinnedBtn).not.toBeNull()

    // Right-click the pinned banner
    await act(async () => {
      pinnedBtn!.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 80
        })
      )
    })
    await flush()

    const menuItems = Array.from(document.body.querySelectorAll('button[role="menuitem"]'))
    expect(menuItems.length).toBe(2)
    expect(menuItems[0].textContent).toContain('Ir para a mensagem')
    expect(menuItems[1].textContent).toContain('Desafixar')

    // Click "Desafixar"
    await act(async () => {
      menuItems[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    // Pinned banner should be removed
    expect(container.querySelector('.group\\/pin')).toBeNull()
  })

  it('shows reply preview above composer when clicking responder and quotes on send', async () => {
    const messages = [
      {
        id: 'msg-1',
        timestamp: 1000,
        direction: 'incoming' as const,
        text: 'Qual o valor total?',
        from: 'Cliente'
      }
    ]

    await act(async () => {
      root.render(
        <WhatsAppNotificationCard
          data={{
            contact: 'Cliente',
            contactJid: '5511999999999@s.whatsapp.net',
            isHistoryOverlay: true,
            conversationHistory: messages,
            quickReplies: [],
            onClose: vi.fn()
          }}
        />
      )
    })
    await flush()

    // Right-click message to open context menu
    const msg1El = container.querySelector('#msg-1000')
    expect(msg1El).not.toBeNull()

    await act(async () => {
      msg1El!.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100
        })
      )
    })
    await flush()

    const replyOption = Array.from(document.body.querySelectorAll('button[role="menuitem"]')).find(
      (btn) => btn.textContent?.includes('Responder')
    )
    expect(replyOption).toBeDefined()

    await act(async () => {
      replyOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    // Reply bar should appear above composer with author and snippet
    const replyPreview = container.querySelector('.group\\/reply')
    expect(replyPreview).not.toBeNull()
    expect(replyPreview?.textContent).toContain('Cliente')
    expect(replyPreview?.textContent).toContain('Qual o valor total?')
  })
})
