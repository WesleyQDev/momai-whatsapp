module.exports = {
  tools: [
    {
      name: 'web_search',
      description:
        'Search the web for news, prices, exchange rates, and current information (pesquisar ou buscar na internet/web). DO NOT use for weather, temperature, or weather forecasts - use get_weather for those cases.'
    },
    {
      name: 'youtube_search',
      description:
        'Search and play a video or music on YouTube (reproduzir/tocar vídeo ou música no YouTube). ALWAYS call this tool IMMEDIATELY without outputting any preliminary text, preamble, or conversational intro before calling the tool. Use when the user asks to search, find, play, watch, or listen to YouTube videos, music, songs, or tutorials (e.g. "tocar música", "tocar vídeo", "mostrar vídeo", "ouvir música", "buscar no youtube").'
    }
  ],

  async execute({ content, context, toolName }) {
    const text = String(content || '').trim()

    if (toolName === 'youtube_search') {
      const videos = await context.searchYouTube(text, 5)
      const lines = videos.length
        ? videos.map((v, i) => `- ${v.title} | ${v.channel} (${v.duration}s)`)
        : ['- No videos found on YouTube.']

      return {
        tool: 'youtube_search',
        structuredResponse: {
          type: 'youtube_results',
          data: { query: text, videos }
        },
        instruction: `Always respond ONLY by saying "Reproduzindo vídeo..." in the user's preferred language (e.g. "Reproduzindo vídeo..." for pt-BR, "Playing video..." for en-US). Do not add any extra text, details, or summary.`,
        webSources: videos.map((v) => ({
          url: v.url,
          title: v.title,
          snippet: v.channel,
          retrieval_type: 'youtube'
        }))
      }
    }

    const results = await context.searchWeb(text, 4)
    const lines = results.length
      ? results.map((r) => `- ${r.title} (${r.url})`)
      : ['- Nenhum resultado web encontrado no momento.']

    return {
      tool: 'web_search',
      instruction: `Resultado da ferramenta web_search:\n${lines.join('\n')}`,
      webSources: results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: 'Resultado web',
        retrieval_type: 'web'
      }))
    }
  }
}
