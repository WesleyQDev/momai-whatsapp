// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdkMocks = vi.hoisted(() => ({
  apiPost: vi.fn()
}))

vi.mock('momai:sdk', () => ({
  default: {
    api: { post: (...args: unknown[]) => sdkMocks.apiPost(...args) }
  }
}))

import ConnectionQrCard from '../src/components/ConnectionQrCard'
import { __emitExtensionEvent, __resetExtensionEvents } from './stubs/momai-events'

let container: HTMLDivElement
let root: Root

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function render(data?: Record<string, unknown>): void {
  act(() => {
    root.render(<ConnectionQrCard data={data as any} />)
  })
}

function qrImg(): HTMLImageElement | null {
  return container.querySelector('img')
}

beforeEach(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  __resetExtensionEvents()
  // Default: the worker has no QR yet. Ready/expired cards never auto-request,
  // so this only shapes the pending-card flows.
  sdkMocks.apiPost.mockReset().mockResolvedValue({ ok: true, data: { pending: true } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('ConnectionQrCard', () => {
  it('renders the QR centered with its countdown for a ready card', async () => {
    render({ state: 'ready', qr: '2@abc', expiresIn: 40, generatedAt: Date.now() })
    await flush()

    expect(container.textContent).toContain('O código expira em')
    const img = qrImg()
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')?.startsWith('data:image/png;base64,')).toBe(true)
    // The card is just the QR: no title/instructions chrome around it.
    expect(container.textContent).not.toContain('Conecte seu WhatsApp')
    expect(container.textContent).not.toContain('Aparelhos conectados')
  })

  it('shows the QR when a live qr_code event arrives while pending', async () => {
    render({ state: 'pending', generatedAt: Date.now() })
    await flush()
    expect(container.textContent).toContain('Gerando QR code')
    expect(qrImg()).toBeNull()

    act(() => {
      __emitExtensionEvent({ eventType: 'qr_code', data: { qr: '2@live', expiresIn: 55 } })
    })
    await flush()

    expect(qrImg()).toBeTruthy()
    expect(container.textContent).toContain('O código expira em')
  })

  it('asks the worker once when a live pending card mounts', async () => {
    sdkMocks.apiPost.mockResolvedValue({ ok: true, data: { qr: '2@auto', expiresIn: 50 } })
    render({ state: 'pending', generatedAt: Date.now() })
    await flush()

    expect(sdkMocks.apiPost).toHaveBeenCalledTimes(1)
    expect(sdkMocks.apiPost).toHaveBeenCalledWith('/extensions/whatsapp/command', {
      toolName: 'request_qr',
      args: { force: false }
    })
    expect(qrImg()).toBeTruthy()
    expect(container.textContent).toContain('O código expira em')
  })

  it('keeps a stale history card as a quiet expired snapshot', async () => {
    render({ state: 'pending', generatedAt: Date.now() - 60 * 60 * 1000 })
    await flush()

    expect(container.textContent).toContain('O código expirou')
    expect(sdkMocks.apiPost).not.toHaveBeenCalled()

    // A new QR belongs to a newer pairing attempt, not to this old card.
    act(() => {
      __emitExtensionEvent({ eventType: 'qr_code', data: { qr: '2@new', expiresIn: 60 } })
    })
    await flush()

    expect(container.textContent).toContain('O código expirou')
    expect(qrImg()).toBeNull()
  })

  it('switches to connected when the pairing is confirmed', async () => {
    render({ state: 'ready', qr: '2@abc', expiresIn: 40, generatedAt: Date.now() })
    await flush()

    act(() => {
      __emitExtensionEvent({ eventType: 'connection_status', data: { status: 'connected' } })
    })
    await flush()

    expect(container.textContent).toContain('WhatsApp conectado')
    expect(qrImg()).toBeNull()
  })

  it('offers a fresh code when the shown QR already expired', async () => {
    render({ state: 'ready', qr: '2@old', expiresIn: 30, generatedAt: Date.now() - 60000 })
    await flush()

    expect(container.textContent).toContain('O código expirou')
    const button = container.querySelector('button')
    expect(button).toBeTruthy()

    sdkMocks.apiPost.mockResolvedValue({ ok: true, data: { qr: '2@fresh', expiresIn: 60 } })
    await act(async () => {
      button?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await flush()

    expect(sdkMocks.apiPost).toHaveBeenCalledWith('/extensions/whatsapp/command', {
      toolName: 'request_qr',
      args: { force: false }
    })
    expect(container.textContent).toContain('O código expira em')
    expect(qrImg()).toBeTruthy()
  })
})
