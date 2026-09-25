// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderTextWithLinks } from '../src/utils/linkify'

describe('renderTextWithLinks', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('returns plain text when no URL is present', () => {
    const result = renderTextWithLinks('Hello world, how are you?')
    expect(result).toBe('Hello world, how are you?')
  })

  it('renders http and https links as clickable anchor tags', () => {
    act(() => {
      root.render(<div>{renderTextWithLinks('Check this out: https://momai.app/download and http://example.com')}</div>)
    })

    const links = container.querySelectorAll('a')
    expect(links.length).toBe(2)
    expect(links[0].getAttribute('href')).toBe('https://momai.app/download')
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[1].getAttribute('href')).toBe('http://example.com')
  })

  it('renders www. links with https:// prepended', () => {
    act(() => {
      root.render(<div>{renderTextWithLinks('Visit www.google.com for search')}</div>)
    })

    const link = container.querySelector('a')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toBe('https://www.google.com')
    expect(link?.textContent).toBe('www.google.com')
  })

  it('handles click events with stopPropagation and window.open fallback', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    act(() => {
      root.render(<div>{renderTextWithLinks('Link: https://momai.app')}</div>)
    })

    const link = container.querySelector('a')
    expect(link).toBeTruthy()
    act(() => {
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(openSpy).toHaveBeenCalledWith('https://momai.app', '_blank')
    openSpy.mockRestore()
  })

  it('applies distinct styling for outgoing bubbles', () => {
    act(() => {
      root.render(<div>{renderTextWithLinks('https://momai.app', false)}</div>)
    })
    const incomingLink = container.querySelector('a')
    expect(incomingLink?.className).toContain('text-accent')

    act(() => {
      root.render(<div>{renderTextWithLinks('https://momai.app', true)}</div>)
    })
    const outgoingLink = container.querySelector('a')
    expect(outgoingLink?.className).toContain('text-white')
  })
})
