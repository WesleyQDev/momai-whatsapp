module.exports = {
  tools: [
    {
      name: 'web_search',
      description:
        'Busca na web por noticias, precos, cotacoes, dolar e informacoes atualizadas. NAO use para clima, temperatura ou previsao do tempo - use get_weather para esses casos.'
    },
    {
      name: 'youtube_search',
      description:
        'Busca e reproduz um video no YouTube. Use quando o usuario pedir para pesquisar, encontrar ou mostrar videos do YouTube, musicas, tutoriais ou qualquer conteudo em video.'
    }
  ],

  async execute({ content, context, toolName }) {
    const text = String(content || '').trim()

    if (toolName === 'youtube_search') {
      const videos = await context.searchYouTube(text, 5)
      const lines = videos.length
        ? videos.map((v, i) => `- ${v.title} | ${v.channel} (${v.duration}s)`)
        : ['- Nenhum video encontrado no YouTube.']

      return {
        tool: 'youtube_search',
        structuredResponse: {
          type: 'youtube_results',
          data: { query: text, videos }
        },
        instruction: `Responda sempre com "Reproduzindo o video!".`,
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
