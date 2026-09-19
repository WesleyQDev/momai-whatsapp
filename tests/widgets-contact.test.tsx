// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.hoisted(() => vi.fn())

vi.mock('momai:sdk', () => ({
  default: {
    i18n: { getLocale: () => 'pt-BR' },
    media: { url: (extensionId: string, file: string) => `/extensions/${extensionId}/${file}` },
    api: {
      post: (...args: unknown[]) => (postMock as (...a: unknown[]) => unknown)(...args)
    }
  }
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
import WhatsappUnreadWidget from '../src/widgets/unread'
import WhatsappLastMessageWidget from '../src/widgets/last-message'
import { __emitExtensionEvent, __resetExtensionEvents } from './stubs/momai-events'

const NOW = 1758036670

let serverHistory: any[]

function seedHistory(): void {
  serverHistory = [
    {
      jid: '211093884559589@lid',
      from: 'Mae',
      text: 'teste',
      timestamp: NOW,
      direction: 'incoming',
      profilePicUrl: 'https://example.com/mae.jpg'
    },
    {
      jid: '5511999999999@s.whatsapp.net',
      from: 'Joao',
      text: 'opa',
      timestamp: NOW - 60,
      direction: 'incoming',
      profilePicUrl: null
    }
  ]
}

let container: HTMLDivElement
let root: Root

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mount(element: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(element)
  })
  await flush()
}

beforeEach(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  __resetExtensionEvents()
  seedHistory()
  postMock.mockReset()
  postMock.mockImplementation(async (_path: unknown, body: any) => {
    if (body?.toolName === 'get_stats') return { data: { connected: true, totalMessages: 5 } }
    if (body?.toolName === 'get_history') return { data: { history: serverHistory } }
    if (body?.toolName === 'get_avatars') return { data: { avatars: {} } }
    return { data: {} }
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('whatsapp widgets show contact name and photo', () => {
  it('unread widget renders display names with avatars, never the raw JID', async () => {
    await mount(<WhatsappUnreadWidget />)
    expect(container.textContent).toContain('Mae')
    expect(container.textContent).not.toContain('211093884559589@lid')
    const photo = container.querySelector('img[alt="Mae"]')
    expect(photo).not.toBeNull()
    expect(photo?.getAttribute('src')).toContain('mae.jpg')
  })

  it('last message widget renders display name with avatar, never the raw JID', async () => {
    await mount(<WhatsappLastMessageWidget />)
    expect(container.textContent).toContain('Mae')
    expect(container.textContent).not.toContain('211093884559589@lid')
    const photo = container.querySelector('img[alt="Mae"]')
    expect(photo).not.toBeNull()
    expect(photo?.getAttribute('src')).toContain('mae.jpg')
  })

  it('last message widget shows a message sent after mount', async () => {
    await mount(<WhatsappLastMessageWidget />)
    expect(container.textContent).toContain('teste')
    serverHistory = [
      {
        jid: '211093884559589@lid',
        from: 'Mae',
        text: 'cheguei agora',
        timestamp: NOW + 120,
        direction: 'incoming',
        profilePicUrl: 'https://example.com/mae.jpg'
      },
      ...serverHistory
    ]
    await act(async () => {
      __emitExtensionEvent({ eventType: 'whatsapp_message', data: {} })
    })
    await flush()
    expect(container.textContent).toContain('cheguei agora')
  })

  it('unread widget lists a conversation started after mount', async () => {
    await mount(<WhatsappUnreadWidget />)
    expect(container.textContent).not.toContain('Maria')
    serverHistory = [
      {
        jid: '5521988887777@s.whatsapp.net',
        from: 'Maria',
        text: 'oi, tudo bem?',
        timestamp: NOW + 180,
        direction: 'incoming',
        profilePicUrl: null
      },
      ...serverHistory
    ]
    await act(async () => {
      __emitExtensionEvent({ eventType: 'history_loaded', data: { count: 3 } })
    })
    await flush()
    expect(container.textContent).toContain('Maria')
    expect(container.textContent).toContain('oi, tudo bem?')
  })

  it('last message widget shows cached history when the server answers empty', async () => {
    serverHistory = []
    localStorage.setItem(
      'momai_whatsapp_cached_history',
      JSON.stringify([
        {
          jid: '211093884559589@lid',
          from: 'Mae',
          text: 'mensagem do cache',
          timestamp: NOW,
          direction: 'incoming',
          profilePicUrl: 'https://example.com/mae.jpg'
        }
      ])
    )
    await mount(<WhatsappLastMessageWidget />)
    expect(container.textContent).toContain('mensagem do cache')
    expect(container.textContent).not.toContain('Nenhuma mensagem ainda')
  })

  it('unread widget shows cached history when the server answers empty', async () => {
    serverHistory = []
    localStorage.setItem(
      'momai_whatsapp_cached_history',
      JSON.stringify([
        {
          jid: '211093884559589@lid',
          from: 'Mae',
          text: 'mensagem do cache',
          timestamp: NOW,
          direction: 'incoming',
          profilePicUrl: null
        }
      ])
    )
    await mount(<WhatsappUnreadWidget />)
    expect(container.textContent).toContain('Mae')
    expect(container.textContent).toContain('mensagem do cache')
  })

  it('last message widget shows the event payload even when server and cache are empty', async () => {
    serverHistory = []
    await mount(<WhatsappLastMessageWidget />)
    expect(container.textContent).toContain('Nenhuma mensagem ainda')
    await act(async () => {
      __emitExtensionEvent({
        eventType: 'whatsapp_notification',
        data: {
          contact: 'Mae',
          contactJid: '211093884559589@lid',
          message: 'chegou ao vivo',
          timestamp: NOW + 300,
          contactAvatar: 'https://example.com/mae.jpg'
        }
      })
    })
    await flush()
    expect(container.textContent).toContain('chegou ao vivo')
    expect(container.textContent).toContain('Mae')
  })

  it('unread widget shows the event payload even when server and cache are empty', async () => {
    serverHistory = []
    await mount(<WhatsappUnreadWidget />)
    await act(async () => {
      __emitExtensionEvent({
        eventType: 'whatsapp_notification',
        data: {
          contact: 'Maria',
          contactJid: '5521988887777@s.whatsapp.net',
          message: 'oi ao vivo',
          timestamp: NOW + 300
        }
      })
    })
    await flush()
    expect(container.textContent).toContain('Maria')
    expect(container.textContent).toContain('oi ao vivo')
  })

  it('last message widget updates live while the home is in edit mode', async () => {
    await mount(<WhatsappLastMessageWidget isEditing />)
    expect(container.textContent).toContain('teste')
    serverHistory = [
      {
        jid: '211093884559589@lid',
        from: 'Mae',
        text: 'mensagem em edicao',
        timestamp: NOW + 400,
        direction: 'incoming',
        profilePicUrl: 'https://example.com/mae.jpg'
      },
      ...serverHistory
    ]
    await act(async () => {
      __emitExtensionEvent({ eventType: 'whatsapp_message', data: {} })
    })
    await flush()
    expect(container.textContent).toContain('mensagem em edicao')
  })

  it('unread widget updates live while the home is in edit mode', async () => {
    await mount(<WhatsappUnreadWidget isEditing />)
    await act(async () => {
      __emitExtensionEvent({
        eventType: 'whatsapp_notification',
        data: {
          contact: 'Maria',
          contactJid: '5521988887777@s.whatsapp.net',
          message: 'oi em edicao',
          timestamp: NOW + 400
        }
      })
    })
    await flush()
    expect(container.textContent).toContain('Maria')
    expect(container.textContent).toContain('oi em edicao')
  })
})
