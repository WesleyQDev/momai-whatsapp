export function resolveRendererLoadUrl(options: {
  isDev: boolean
  electronRendererUrl?: string
  productionBaseUrl?: string
  routeHash?: string
}): string {
  const { isDev, electronRendererUrl, productionBaseUrl = '', routeHash } = options

  if (isDev && electronRendererUrl) {
    return routeHash ? `${electronRendererUrl}/#/${routeHash}` : electronRendererUrl
  }

  return routeHash
    ? `${productionBaseUrl}/index.html#/${routeHash}`
    : `${productionBaseUrl}/index.html`
}
