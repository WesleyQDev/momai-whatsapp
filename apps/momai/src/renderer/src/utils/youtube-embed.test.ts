import { describe, expect, it } from 'vitest'
import {
  buildYouTubeEmbedConfig,
  getYouTubeEmbedFailureReason,
  isConflictingYouTubeReferrer
} from './youtube-embed'

const devPage = {
  protocol: 'http:',
  origin: 'http://localhost:5173',
  href: 'http://localhost:5173/index.html#/chat'
}

const prodPage = {
  protocol: 'http:',
  origin: 'http://localhost:48291',
  href: 'http://localhost:48291/index.html'
}

const filePage = {
  protocol: 'file:',
  origin: 'file://',
  href: 'file:///C:/Program%20Files/MomAI/resources/app.asar/out/renderer/index.html'
}

describe('getYouTubeEmbedFailureReason (production mock)', () => {
  it('flags file:// as the broken production protocol (error 152)', () => {
    expect(getYouTubeEmbedFailureReason(filePage)).toBe('file-protocol')
  })

  it('accepts localhost HTTP origins used by the renderer static server', () => {
    expect(getYouTubeEmbedFailureReason(prodPage)).toBeNull()
    expect(getYouTubeEmbedFailureReason(devPage)).toBeNull()
  })
})

describe('buildYouTubeEmbedConfig', () => {
  it('builds a dev embed URL with origin and widget_referrer', () => {
    const config = buildYouTubeEmbedConfig({
      videoId: 'dQw4w9WgXcQ',
      autoplay: true,
      page: devPage
    })

    expect(config.isProductionReady).toBe(true)
    expect(config.origin).toBe('http://localhost:5173')
    expect(config.src).toContain('origin=http%3A%2F%2Flocalhost%3A5173')
    expect(config.src).toContain('widget_referrer=')
    expect(config.src).toContain('enablejsapi=1')
  })

  it('builds a production embed URL when served over localhost HTTP', () => {
    const config = buildYouTubeEmbedConfig({
      videoId: 'abc123',
      autoplay: false,
      page: prodPage
    })

    expect(config.isProductionReady).toBe(true)
    expect(config.origin).toBe('http://localhost:48291')
    expect(config.src).toContain('origin=http%3A%2F%2Flocalhost%3A48291')
  })

  it('replicates the broken file:// production embed (missing origin)', () => {
    const config = buildYouTubeEmbedConfig({
      videoId: 'abc123',
      page: filePage
    })

    expect(config.isProductionReady).toBe(false)
    expect(config.failureReason).toBe('file-protocol')
    expect(config.origin).toBeNull()
    expect(config.src).not.toContain('origin=')
    expect(config.src).not.toContain('widget_referrer=')
  })
})

describe('isConflictingYouTubeReferrer', () => {
  it('detects the earlier broken referer spoof that mismatched page origin', () => {
    expect(isConflictingYouTubeReferrer('https://www.youtube.com/', 'http://localhost:48291')).toBe(
      true
    )
  })

  it('accepts a referer that matches the embed origin', () => {
    expect(isConflictingYouTubeReferrer('http://localhost:48291/', 'http://localhost:48291')).toBe(
      false
    )
  })
})
