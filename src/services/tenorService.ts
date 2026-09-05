export interface GifItem {
  id: string
  title: string
  previewUrl: string
  url: string
}

const getApiBaseUrl = (): string => {
  const fromHost =
    (window as any)?.momaiAPI?.getApiBaseUrl?.() ||
    (window as any)?.api?.getApiBaseUrl?.()
  if (fromHost) return String(fromHost).replace(/\/+$/, '')
  return 'http://127.0.0.1:8050'
}

export async function fetchTrendingGifs(limit = 20): Promise<GifItem[]> {
  return searchGifs('', limit)
}

export async function searchGifs(query: string, limit = 20): Promise<GifItem[]> {
  // 1. Tentar via backend tool do worker da extensão (envia User-Agent oficial do MomAI sem restrições)
  try {
    const base = getApiBaseUrl()
    const token = (window as any)?.api?.getSessionToken?.() || ''
    const res = await fetch(`${base}/extensions/momai-whatsapp/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': token
      },
      body: JSON.stringify({
        toolName: 'fetch_gifs',
        args: { query, limit }
      })
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.ok && Array.isArray(data.gifs)) {
        return data.gifs
      }
    }
  } catch (err) {
    console.warn('[NekosBestService] Falha na chamada via worker tool, tentando fallback:', err)
  }

  // 2. Fallback direto via fetch
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
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return (data?.results || []).map((item: any) => ({
      id: item.url,
      title: item.anime_name || 'Anime GIF',
      previewUrl: item.url,
      url: item.url
    }))
  } catch (err) {
    console.warn('[NekosBestService] Erro na busca de GIFs:', err)
    return []
  }
}
