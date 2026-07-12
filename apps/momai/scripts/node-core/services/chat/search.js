async function searchYouTube(query, limit = 5) {
  const q = String(query || '').trim()
  if (!q) return []
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        }
      }
    )
    if (!res.ok) return []
    const html = await res.text()
    const dataMatch = html.match(/var ytInitialData = ({.*?});/s)
    if (!dataMatch) return []
    const data = JSON.parse(dataMatch[1])
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents?.[0]?.itemSectionRenderer?.contents || []
    const parseDuration = (text) => {
      if (!text) return 0
      const parts = String(text).split(':').map(Number)
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
      if (parts.length === 2) return parts[0] * 60 + parts[1]
      return parts[0] || 0
    }
    const parseViews = (text) => {
      if (!text) return 0
      const match = String(text).replace(/\./g, '').match(/(\d+)/)
      return match ? Number(match[1]) : 0
    }
    return contents
      .filter((c) => c.videoRenderer)
      .slice(0, limit)
      .map((c) => {
        const v = c.videoRenderer
        return {
          id: v.videoId,
          title: v.title?.runs?.[0]?.text || '',
          channel: v.ownerText?.runs?.[0]?.text || '',
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          duration: parseDuration(v.lengthText?.simpleText),
          durationText: v.lengthText?.simpleText || '',
          views: parseViews(v.viewCountText?.simpleText),
          viewsText: v.viewCountText?.simpleText || '',
          url: `https://www.youtube.com/watch?v=${v.videoId}`
        }
      })
  } catch {
    return []
  }
}

async function searchWeb(query, limit = 4) {
  const q = encodeURIComponent(String(query || '').trim())
  if (!q) return []
  try {
    const response = await fetch(`https://duckduckgo.com/html/?q=${q}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'MomAI-NodeCore/1.0'
      }
    })
    if (!response.ok) return []
    const html = await response.text()
    const results = []
    const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let match
    while ((match = regex.exec(html)) && results.length < limit) {
      const rawUrl = String(match[1] || '')
      const title = String(match[2] || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!title || !rawUrl) continue
      results.push({ title, url: rawUrl })
    }
    return results
  } catch {
    return []
  }
}

module.exports = {
  searchYouTube,
  searchWeb
}
