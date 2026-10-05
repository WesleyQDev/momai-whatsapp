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

function renderOverlay(conversationHistory: unknown[], extraData: Record<string, unknown> = {}) {
  return act(async () => {
    root.render(
      <WhatsAppNotificationCard
        data={{
          contact: 'Lucas',
          contactJid: '5511999999999@s.whatsapp.net',
          isHistoryOverlay: true,
          conversationHistory,
          quickReplies: [],
          onClose: vi.fn(),
          ...extraData
        }}
      />
    )
  })
}

describe('bloco de citação no overlay (padrão WhatsApp Web)', () => {
  it('mostra "Você" em cima ao responder a própria mensagem sem `from`', async () => {
    await renderOverlay([
      {
        id: 'orig-1',
        timestamp: 1000,
        direction: 'outgoing',
        text: 'dcd',
        from: 'Você'
      },
      {
        id: 'reply-1',
        timestamp: 2000,
        direction: 'outgoing',
        text: 'qdsq',
        quoted: { id: 'orig-1', text: 'dcd' }
      }
    ])
    await flush()

    const text = container.textContent || ''
    expect(text).toContain('Você')
    expect(text).toContain('dcd')
    expect(text).toContain('qdsq')
    expect(text).not.toContain('Responder')
  })

  it('mostra o nome do contato ao citar mensagem dele sem `from`', async () => {
    await renderOverlay([
      {
        id: 'orig-2',
        timestamp: 1000,
        direction: 'incoming',
        text: 'olá',
        from: 'Lucas'
      },
      {
        id: 'reply-2',
        timestamp: 2000,
        direction: 'outgoing',
        text: 'oi!',
        quoted: { id: 'orig-2', text: 'olá' }
      }
    ])
    await flush()

    const text = container.textContent || ''
    expect(text).toContain('Lucas')
    expect(text).toContain('olá')
    expect(text).toContain('oi!')
  })

  it('mostra "Você" mesmo quando a linha citada veio do servidor com `from` do contato', async () => {
    // O worker grava as mensagens enviadas com `from` = nome do contato;
    // ao citar a própria mensagem, o cabeçalho deve ser "Você".
    await renderOverlay([
      {
        id: 'orig-4',
        timestamp: 1000,
        direction: 'outgoing',
        text: 'dcd',
        from: 'Lucas'
      },
      {
        id: 'reply-4',
        timestamp: 2000,
        direction: 'outgoing',
        text: 'qdsq',
        quoted: { id: 'orig-4', text: 'dcd', from: 'Lucas' }
      }
    ])
    await flush()

    const replyEl = container.querySelector('#msg-2000')
    expect(replyEl).not.toBeNull()
    const quoteHeader = replyEl!.querySelector('p.text-\\[11px\\]')
    expect(quoteHeader).not.toBeNull()
    expect(quoteHeader!.textContent).toBe('Você')
    // Nome próprio em rosa (WhatsApp Web) e barra lateral vermelha
    expect((quoteHeader as HTMLElement).style.color).toBe('#ff5b8f')
    const quoteBox = quoteHeader!.closest('div.rounded-md') as HTMLElement | null
    expect(quoteBox).not.toBeNull()
    expect(quoteBox!.style.borderLeft).toContain('4px solid')
    expect(quoteBox!.style.borderLeft).toContain('ff5b8f')
    // Bloco com tonalização própria
    expect(quoteBox!.style.backgroundColor).not.toBe('')
  })

  it('usa o `from` resolvido pelo worker quando presente', async () => {
    await renderOverlay([
      {
        id: 'reply-3',
        timestamp: 3000,
        direction: 'outgoing',
        text: 'qdsq',
        quoted: { id: 'orig-9', text: 'dcd', from: 'Você' }
      }
    ])
    await flush()

    const text = container.textContent || ''
    expect(text).toContain('Você')
    expect(text).toContain('dcd')
  })

  it('responder pelo menu anexa a citação ao envio (sem stale closure)', async () => {
    // Mock por chamada (Response zerada por uso): conversa vazia + envio ok.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
        let toolName = ''
        try {
          toolName = JSON.parse(String(init?.body || '{}'))?.toolName || ''
        } catch {}
        const payload =
          toolName === 'send_message' ? { ok: true, id: 'sent-1' } : { ok: true, history: [] }
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
    await renderOverlay([
      {
        id: 'orig-5',
        timestamp: 1000,
        direction: 'incoming',
        text: 'Df',
        from: 'Paisão'
      }
    ])
    await flush()

    // Ativa o modo resposta com duplo clique (igual ao WhatsApp Web)
    const msgEl = container.querySelector('#msg-1000')
    expect(msgEl).not.toBeNull()
    await act(async () => {
      msgEl!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })
    await flush()

    const replyPreview = container.querySelector('.group\\/reply')
    expect(replyPreview).not.toBeNull()

    // Digita e envia com Enter
    const input = container.querySelector(
      'input[placeholder="Digite uma mensagem..."]'
    ) as HTMLInputElement | null
    expect(input).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(input!, 'wefw')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await flush()

    // O payload de envio carrega a citação da mensagem respondida
    const fetchMock = vi.mocked(fetch)
    const sendCall = fetchMock.mock.calls.find(([url, init]) => {
      try {
        const body = JSON.parse(String((init as RequestInit)?.body || '{}'))
        return body?.toolName === 'send_message'
      } catch {
        return false
      }
    })
    expect(sendCall).toBeDefined()
    const sentBody = JSON.parse(String((sendCall![1] as RequestInit)?.body || '{}'))
    expect(sentBody.args.message).toBe('wefw')
    expect(sentBody.args.quotedMessageId).toBe('orig-5')
    expect(sentBody.args.quoted?.id).toBe('orig-5')
    expect(sentBody.args.quoted?.text).toBe('Df')
    expect(sentBody.args.quoted?.from).toBe('Paisão')

    // O balão otimista renderiza o bloco de citação (cabeçalho em negrito)
    const quoteHeaders = Array.from(
      container.querySelectorAll('p.text-\\[11px\\].font-bold')
    ).map((el) => el.textContent)
    expect(quoteHeaders).toContain('Paisão')
  })

  it('mostra a citação também no overlay de notificação (igual ao de contato)', async () => {
    await renderOverlay(
      [
        {
          id: 'o1',
          timestamp: 1000,
          direction: 'incoming',
          text: 'Df',
          from: 'Paisão'
        },
        {
          id: 'r1',
          timestamp: 2000,
          direction: 'outgoing',
          text: 'cxasca',
          quoted: { id: 'o1', text: 'Df', from: 'Paisão' }
        }
      ],
      { isHistoryOverlay: false, contact: 'Paisão', message: 'Df' }
    )
    await flush()

    const quoteHeaders = Array.from(
      container.querySelectorAll('p.text-\\[11px\\].font-bold')
    ).map((el) => el.textContent)
    expect(quoteHeaders).toContain('Paisão')
    // Citação de terceiros: barra lateral na cor de destaque + tonalização
    const notifHeader = Array.from(
      container.querySelectorAll('p.text-\\[11px\\].font-bold')
    ).find((el) => el.textContent === 'Paisão')
    expect(notifHeader).toBeDefined()
    const notifBox = notifHeader!.closest('div.rounded-md') as HTMLElement | null
    expect(notifBox).not.toBeNull()
    expect(notifBox!.style.borderLeft).toContain('4px solid')
    expect(notifBox!.style.backgroundColor).not.toBe('')
  })

  it('auto-resposta no overlay de notificação envia a citação com o stanzaId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'))
        const payload =
          body?.toolName === 'send_message' ? { ok: true, id: 'sent-1' } : { ok: true }
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
    // Overlay de notificação: a mensagem exibida vem do evento, com id e
    // senderJid (o worker precisa mandá-los para a citação existir no envio).
    await renderOverlay([], {
      isHistoryOverlay: false,
      contact: 'Paisão',
      message: 'Df',
      id: 'notif-9',
      senderJid: '5511888888888@s.whatsapp.net'
    })
    await flush()

    const input = container.querySelector(
      'input[placeholder="Digite uma mensagem..."]'
    ) as HTMLInputElement | null
    expect(input).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(input!, 'respondendo')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    })
    await flush()

    const fetchMock = vi.mocked(fetch)
    const sendCall = fetchMock.mock.calls.find(([, init]) => {
      try {
        return JSON.parse(String((init as RequestInit)?.body || '{}'))?.toolName === 'send_message'
      } catch {
        return false
      }
    })
    expect(sendCall).toBeDefined()
    const sentBody = JSON.parse(String((sendCall![1] as RequestInit)?.body || '{}'))
    expect(sentBody.args.message).toBe('respondendo')
    expect(sentBody.args.quotedMessageId).toBe('notif-9')
    expect(sentBody.args.quoted?.id).toBe('notif-9')
    expect(sentBody.args.quoted?.text).toBe('Df')
    expect(sentBody.args.quoted?.senderJid).toBe('5511888888888@s.whatsapp.net')
  })

  it('sem stanzaId não envia citação (evita balão de resposta falso)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'))
        const payload =
          body?.toolName === 'send_message' ? { ok: true, id: 'sent-1' } : { ok: true }
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
    await renderOverlay([], {
      isHistoryOverlay: false,
      contact: 'Paisão',
      message: 'Df'
    })
    await flush()

    const input = container.querySelector(
      'input[placeholder="Digite uma mensagem..."]'
    ) as HTMLInputElement | null
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(input!, 'sem citar')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    })
    await flush()

    const fetchMock = vi.mocked(fetch)
    const sendCall = fetchMock.mock.calls.find(([, init]) => {
      try {
        return JSON.parse(String((init as RequestInit)?.body || '{}'))?.toolName === 'send_message'
      } catch {
        return false
      }
    })
    expect(sendCall).toBeDefined()
    const sentBody = JSON.parse(String((sendCall![1] as RequestInit)?.body || '{}'))
    expect(sentBody.args.message).toBe('sem citar')
    expect(sentBody.args.quoted).toBeUndefined()
    expect(sentBody.args.quotedMessageId).toBeUndefined()
  })
})
