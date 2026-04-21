module.exports = {
  tools: [{ name: 'web_search', description: 'Realiza busca web e retorna fontes resumidas.' }],

  async execute({ content, context }) {
    const text = String(content || '').trim()
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
