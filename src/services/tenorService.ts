export interface GifItem {
  id: string
  title: string
  previewUrl: string
  url: string
  mp4Url?: string
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

const GIPHY_API_KEY = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh'

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
      if (data?.ok && Array.isArray(data.gifs) && data.gifs.length > 0) {
        return data.gifs
      }
    }
  } catch (err) {
    console.warn('[GifService] Falha na chamada via worker tool, tentando fallback:', err)
  }

  // 2. Fallback direto via GIPHY API (retorna tanto preview/gif quanto mp4 nativo para o WhatsApp)
  try {
    const q = query.trim()
    const endpoint = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=${limit}&rating=g`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=g`
    const res = await fetch(endpoint)
    if (res.ok) {
      const data = await res.json()
      if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        return data.data.map((item: any) => ({
          id: item.id || item.images?.fixed_height?.url,
          title: item.title || 'GIF',
          previewUrl: item.images?.fixed_height_small?.url || item.images?.fixed_height?.url || item.images?.original?.url,
          url: item.images?.fixed_height?.url || item.images?.original?.url,
          mp4Url: item.images?.fixed_height?.mp4 || item.images?.original?.mp4
        }))
      }
    }
  } catch (err) {
    console.warn('[GifService] Erro no fallback GIPHY:', err)
  }

  // 3. Fallback secundário via Nekos.best
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
      url: item.url,
      mp4Url: item.url
    }))
  } catch (err) {
    console.warn('[GifService] Erro no fallback secundário:', err)
    return []
  }
}
