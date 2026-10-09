import { getApiBaseUrl } from '../utils/apiBase'

export interface GifItem {
  id: string
  title: string
  previewUrl: string
  url: string
  mp4Url?: string
  /** Origin of the result; drives the GIPHY attribution in the picker. */
  source?: 'giphy' | 'nekos' | string
}

const GIF_FETCH_TIMEOUT_MS = 8000

/** AbortSignal-based timeout so a slow GIF service never hangs the picker. */
function withFetchTimeout(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GIF_FETCH_TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

export async function fetchTrendingGifs(limit = 20): Promise<GifItem[]> {
  return searchGifs('', limit)
}

/**
 * GIF search. The extension worker is the primary source: it uses the keyless
 * Nekos.best API (and GIPHY only when the host configures a key) and validates
 * every URL. The direct fallback below is also keyless and only runs when the
 * worker route is unavailable.
 */
export async function searchGifs(query: string, limit = 20): Promise<GifItem[]> {
  // 1. Backend tool do worker da extensão (fonte principal, sem chave no app).
  try {
    const base = getApiBaseUrl()
    const token = (window as any)?.api?.getSessionToken?.() || ''
    const { signal, clear } = withFetchTimeout()
    try {
      const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': token
        },
        body: JSON.stringify({
          toolName: 'fetch_gifs',
          args: { query, limit }
        }),
        signal
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.ok && Array.isArray(data.gifs) && data.gifs.length > 0) {
          return data.gifs
        }
      }
    } finally {
      clear()
    }
  } catch (err) {
    console.warn('[GifService] Falha na chamada via worker tool, tentando fallback:', err)
  }

  // 2. Fallback direto keyless via Nekos.best
  try {
    const q = query.trim().toLowerCase()
    const categoryMap: Record<string, string> = {
      abraco: 'hug',
      abraço: 'hug',
      hug: 'hug',
      beijo: 'kiss',
      kiss: 'kiss',
      feliz: 'happy',
      happy: 'happy',
      smile: 'smile',
      sorriso: 'smile',
      rir: 'laugh',
      laugh: 'laugh',
      danca: 'dance',
      dança: 'dance',
      dance: 'dance',
      tchau: 'wave',
      wave: 'wave',
      choro: 'cry',
      triste: 'cry',
      cry: 'cry',
      dormir: 'sleep',
      sono: 'sleep',
      joinha: 'thumbsup',
      ok: 'thumbsup',
      piscar: 'wink',
      wink: 'wink'
    }
    const cat = categoryMap[q] || (q ? '' : 'happy')
    const url = cat
      ? `https://nekos.best/api/v2/${cat}?amount=${limit}`
      : `https://nekos.best/api/v2/search?query=${encodeURIComponent(q)}&type=2&amount=${limit}`
    const { signal, clear } = withFetchTimeout()
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return (data?.results || []).map((item: any) => ({
        id: item.url,
        title: item.anime_name || 'Anime GIF',
        source: 'nekos',
        previewUrl: item.url,
        url: item.url,
        mp4Url: item.url
      }))
    } finally {
      clear()
    }
  } catch (err) {
    console.warn('[GifService] Erro no fallback keyless:', err)
    return []
  }
}
