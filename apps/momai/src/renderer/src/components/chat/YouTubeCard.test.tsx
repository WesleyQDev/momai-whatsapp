import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import YouTubeCard from './YouTubeCard'

const mockVideos = [
  {
    id: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    channel: 'Rick Astley',
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    durationText: '3:33',
    viewsText: '1B views'
  }
]

describe('YouTubeCard', () => {
  const originalLocation = window.location

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal('location', {
      ...originalLocation,
      protocol: 'http:',
      origin: 'http://localhost:48291',
      href: 'http://localhost:48291/index.html'
    })
  })

  afterEach(() => {
    vi.stubGlobal('location', originalLocation)
  })

  it('renders the search query title', () => {
    render(
      <YouTubeCard
        data={{ query: 'Lo-Fi Hip Hop', videos: mockVideos }}
        isSpeaking={false}
      />
    )

    expect(screen.getByText('YouTube: Lo-Fi Hip Hop')).toBeTruthy()
  })

  it('does not mount the iframe before playback is allowed', () => {
    const { container } = render(
      <YouTubeCard
        data={{ query: 'Lo-Fi Hip Hop', videos: mockVideos }}
        isSpeaking={false}
      />
    )

    expect(container.querySelector('iframe')).toBeNull()
  })

  it('builds a production-ready iframe src when playback starts', async () => {
    const { container } = render(
      <YouTubeCard
        data={{ query: 'Lo-Fi Hip Hop', videos: mockVideos }}
        isSpeaking={false}
      />
    )

    const overlay = container.querySelector('.group\\/overlay') as HTMLElement
    await act(async () => {
      fireEvent.click(overlay)
    })

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy()
    })

    const iframe = container.querySelector('iframe')
    expect(iframe?.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(iframe?.getAttribute('src')).toContain('origin=http%3A%2F%2Flocalhost%3A48291')
    expect(iframe?.getAttribute('src')).toContain('widget_referrer=')
    expect(iframe?.getAttribute('referrerpolicy')).toBe('no-referrer-when-downgrade')
  })

  it('replicates the broken file:// production iframe configuration', async () => {
    vi.stubGlobal('location', {
      ...originalLocation,
      protocol: 'file:',
      origin: 'file://',
      href: 'file:///C:/Program%20Files/MomAI/resources/app.asar/out/renderer/index.html'
    })

    const { container } = render(
      <YouTubeCard
        data={{ query: 'Lo-Fi Hip Hop', videos: mockVideos }}
        isSpeaking={false}
      />
    )

    const overlay = container.querySelector('.group\\/overlay') as HTMLElement
    await act(async () => {
      fireEvent.click(overlay)
    })

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy()
    })

    const iframe = container.querySelector('iframe')
    expect(iframe?.getAttribute('src')).not.toContain('origin=')
    expect(iframe?.getAttribute('src')).not.toContain('widget_referrer=')
  })
})
