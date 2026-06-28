import { describe, expect, it } from 'vitest'
import {
  isYouTubeNetworkRequest,
  patchYouTubeRequestHeaders,
  resolveRendererOriginForYouTube,
  resolveYouTubeRequestReferer
} from './youtube-session'

describe('isYouTubeNetworkRequest', () => {
  it('matches embed and streaming hosts', () => {
    expect(isYouTubeNetworkRequest('https://www.youtube-nocookie.com/embed/abc')).toBe(true)
    expect(isYouTubeNetworkRequest('https://rr1---sn-abc.googlevideo.com/videoplayback')).toBe(true)
    expect(isYouTubeNetworkRequest('https://example.com/video')).toBe(false)
  })
})

describe('resolveRendererOriginForYouTube', () => {
  it('prefers the live BrowserWindow origin in production', () => {
    expect(
      resolveRendererOriginForYouTube('http://localhost:48291/index.html', 'http://localhost:11111')
    ).toBe('http://localhost:48291')
  })

  it('falls back to the static server origin before window load completes', () => {
    expect(resolveRendererOriginForYouTube(null, 'http://localhost:48291')).toBe(
      'http://localhost:48291'
    )
  })

  it('ignores file:// windows so we do not propagate the broken protocol', () => {
    expect(
      resolveRendererOriginForYouTube(
        'file:///C:/Program%20Files/MomAI/resources/app.asar/out/renderer/index.html',
        'http://localhost:48291'
      )
    ).toBe('http://localhost:48291')
  })
})

describe('resolveYouTubeRequestReferer', () => {
  it('replicates the earlier broken production referer spoof', () => {
    const brokenReferer = resolveYouTubeRequestReferer(
      'https://www.youtube-nocookie.com/embed/abc',
      'https://www.youtube.com/',
      'http://localhost:48291'
    )

    expect(brokenReferer).not.toBe('https://www.youtube.com/')
  })

  it('sets referer to the renderer origin for YouTube requests', () => {
    expect(
      resolveYouTubeRequestReferer(
        'https://www.youtube-nocookie.com/embed/abc',
        undefined,
        'http://localhost:48291'
      )
    ).toBe('http://localhost:48291/')
  })

  it('leaves unrelated requests untouched', () => {
    expect(
      resolveYouTubeRequestReferer('https://example.com', 'https://example.com/page', null)
    ).toBe('https://example.com/page')
  })
})

describe('patchYouTubeRequestHeaders', () => {
  it('overwrites conflicting youtube.com referer with the page origin', () => {
    const headers = patchYouTubeRequestHeaders(
      {
        url: 'https://www.youtube-nocookie.com/embed/abc',
        requestHeaders: { Referer: 'https://www.youtube.com/' }
      },
      'http://localhost:48291'
    )

    expect(headers.Referer).toBe('http://localhost:48291/')
  })
})
