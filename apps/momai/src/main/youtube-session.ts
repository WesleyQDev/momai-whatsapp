import type { OnBeforeSendHeadersListenerDetails, BeforeSendResponse } from 'electron'
import { getMainWindow } from './state'
import { getActiveRendererOrigin } from './renderer-static-server'

const YOUTUBE_URL_PATTERNS = [
  'https://*.youtube.com/*',
  'https://*.youtube-nocookie.com/*',
  'https://*.googlevideo.com/*',
  'https://*.ytimg.com/*'
] as const

export function isYouTubeNetworkRequest(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return (
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtube-nocookie.com' ||
      hostname.endsWith('.youtube-nocookie.com') ||
      hostname.endsWith('.googlevideo.com') ||
      hostname.endsWith('.ytimg.com')
    )
  } catch {
    return false
  }
}

export function resolveRendererOriginForYouTube(
  mainWindowUrl: string | null | undefined,
  staticServerOrigin: string | null | undefined
): string | null {
  if (mainWindowUrl) {
    try {
      const parsed = new URL(mainWindowUrl)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin
      }
    } catch {
      // fall through
    }
  }

  return staticServerOrigin ?? null
}

export function resolveYouTubeRequestReferer(
  requestUrl: string,
  existingReferer: string | undefined,
  rendererOrigin: string | null
): string | undefined {
  if (!isYouTubeNetworkRequest(requestUrl) || !rendererOrigin) {
    return existingReferer
  }

  return `${rendererOrigin}/`
}

export function patchYouTubeRequestHeaders(
  details: Pick<OnBeforeSendHeadersListenerDetails, 'url' | 'requestHeaders'>,
  rendererOrigin: string | null
): Record<string, string> {
  const headers = { ...details.requestHeaders }
  const referer = resolveYouTubeRequestReferer(
    details.url,
    headers.Referer ?? headers.referer,
    rendererOrigin
  )

  if (referer) {
    headers.Referer = referer
    delete headers.referer
  }

  return headers
}

export function createYouTubeBeforeSendHeadersHandler(): (
  details: OnBeforeSendHeadersListenerDetails,
  callback: (response: BeforeSendResponse) => void
) => void {
  return (details, callback) => {
    const mainWindow = getMainWindow()
    const mainWindowUrl =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.getURL() : null
    const rendererOrigin = resolveRendererOriginForYouTube(mainWindowUrl, getActiveRendererOrigin())

    callback({
      requestHeaders: patchYouTubeRequestHeaders(details, rendererOrigin)
    })
  }
}

export function getYouTubeWebRequestFilterUrls(): string[] {
  return [...YOUTUBE_URL_PATTERNS]
}
