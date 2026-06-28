export type YouTubeEmbedPageContext = {
  protocol: string
  origin: string
  href: string
}

export type YouTubeEmbedOptions = {
  videoId: string
  autoplay?: boolean
  page?: YouTubeEmbedPageContext
}

export type YouTubeEmbedConfig = {
  src: string
  referrerPolicy: 'no-referrer-when-downgrade'
  origin: string | null
  widgetReferrer: string | null
  isProductionReady: boolean
  failureReason: string | null
}

const YOUTUBE_EMBED_HOST = 'https://www.youtube-nocookie.com'

export function readYouTubeEmbedPageContext(
  locationLike: Pick<Location, 'protocol' | 'origin' | 'href'> = globalThis.location
): YouTubeEmbedPageContext {
  return {
    protocol: locationLike.protocol,
    origin: locationLike.origin,
    href: locationLike.href
  }
}

export function isHttpEmbedOrigin(origin: string): boolean {
  return /^https?:\/\//.test(origin)
}

/** Mirrors production failure: file:// parent cannot satisfy YouTube embed origin checks. */
export function getYouTubeEmbedFailureReason(page: YouTubeEmbedPageContext): string | null {
  if (page.protocol === 'file:') {
    return 'file-protocol'
  }
  if (!isHttpEmbedOrigin(page.origin)) {
    return 'invalid-origin'
  }
  return null
}

export function buildYouTubeEmbedConfig(options: YouTubeEmbedOptions): YouTubeEmbedConfig {
  const page = options.page ?? readYouTubeEmbedPageContext()
  const failureReason = getYouTubeEmbedFailureReason(page)
  const origin = failureReason ? null : page.origin
  const widgetReferrer = failureReason ? null : page.href

  const params = new URLSearchParams()
  params.set('enablejsapi', '1')
  params.set('autoplay', options.autoplay ? '1' : '0')
  if (origin) {
    params.set('origin', origin)
  }
  if (widgetReferrer) {
    params.set('widget_referrer', widgetReferrer)
  }

  return {
    src: `${YOUTUBE_EMBED_HOST}/embed/${options.videoId}?${params.toString()}`,
    referrerPolicy: 'no-referrer-when-downgrade',
    origin,
    widgetReferrer,
    isProductionReady: failureReason === null,
    failureReason
  }
}

/** Detects the broken combo that caused error 153 in earlier builds. */
export function isConflictingYouTubeReferrer(
  requestReferer: string | undefined,
  embedOrigin: string | null
): boolean {
  if (!embedOrigin || !requestReferer) return false
  try {
    const refererOrigin = new URL(requestReferer).origin
    return refererOrigin !== embedOrigin && refererOrigin.includes('youtube.com')
  } catch {
    return false
  }
}
