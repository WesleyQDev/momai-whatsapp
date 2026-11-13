// @vitest-environment happy-dom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MessageStatusIcon from '../src/components/MessageStatusIcon'

describe('MessageStatusIcon', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('renders a single check (✓) when status is 2 (SERVER_ACK / sent but not delivered)', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(<MessageStatusIcon status={2} />)
    })
    const polylines = container.querySelectorAll('polyline')
    expect(polylines.length).toBe(1)
    expect(polylines[0].getAttribute('points')).toBe('20 6 9 17 4 12')
    const span = container.querySelector('span')
    expect(span?.getAttribute('title')).toBe('Enviada')
    await act(async () => {
      root.unmount()
    })
  })

  it('renders a single check (✓) when status is undefined (default outgoing not yet delivered)', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(<MessageStatusIcon />)
    })
    const polylines = container.querySelectorAll('polyline')
    expect(polylines.length).toBe(1)
    expect(polylines[0].getAttribute('points')).toBe('20 6 9 17 4 12')
    const span = container.querySelector('span')
    expect(span?.getAttribute('title')).toBe('Enviada')
    await act(async () => {
      root.unmount()
    })
  })

  it('renders a double check (✓✓) in grey when status is 3 (DELIVERY_ACK / delivered)', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(<MessageStatusIcon status={3} />)
    })
    const polylines = container.querySelectorAll('polyline')
    expect(polylines.length).toBe(2)
    const span = container.querySelector('span')
    expect(span?.getAttribute('title')).toBe('Entregue')
    expect(span?.className).not.toContain('text-[#53bdeb]')
    await act(async () => {
      root.unmount()
    })
  })

  it('renders a double check (✓✓) in blue when status is 4 (READ)', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(<MessageStatusIcon status={4} />)
    })
    const polylines = container.querySelectorAll('polyline')
    expect(polylines.length).toBe(2)
    const span = container.querySelector('span')
    expect(span?.getAttribute('title')).toBe('Lida')
    expect(span?.className).toContain('text-[#53bdeb]')
    await act(async () => {
      root.unmount()
    })
  })

  it('renders a double check (✓✓) in blue when status is string "4" or "read"', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(<MessageStatusIcon status="4" />)
    })
    let span = container.querySelector('span')
    expect(span?.getAttribute('title')).toBe('Lida')
    expect(span?.className).toContain('text-[#53bdeb]')

    await act(async () => {
      root.render(<MessageStatusIcon status="read" />)
    })
    span = container.querySelector('span')
    expect(span?.getAttribute('title')).toBe('Lida')
    expect(span?.className).toContain('text-[#53bdeb]')

    await act(async () => {
      root.unmount()
    })
  })

  it('renders clock icon when status is 1 (pending)', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(<MessageStatusIcon status={1} />)
    })
    const circle = container.querySelector('circle')
    expect(circle).not.toBeNull()
    const span = container.querySelector('span')
    expect(span?.getAttribute('title')).toBe('Enviando')
    await act(async () => {
      root.unmount()
    })
  })
})

