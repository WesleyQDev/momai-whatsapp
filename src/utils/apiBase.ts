import sdk from 'momai:sdk'

/**
 * Resolves the host API base URL from every surface an extension may run on
 * (page, overlay panel and widgets), with the local default as last resort.
 * Single source shared by page/panel/services (item 19).
 */
export function getApiBaseUrl(): string {
  const fromHost =
    (window as any)?.momaiAPI?.getApiBaseUrl?.() ||
    (window as any)?.api?.getApiBaseUrl?.()
  if (fromHost) return String(fromHost).replace(/\/+$/, '')
  const fromSdk = (sdk as any)?.API_URL
  if (fromSdk) return String(fromSdk).replace(/\/+$/, '')
  return 'http://127.0.0.1:8050'
}
