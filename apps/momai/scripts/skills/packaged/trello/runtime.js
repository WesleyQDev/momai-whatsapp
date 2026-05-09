const TRELLO_API = 'https://api.trello.com/1'
const DEFAULT_BOARD_ID = process.env.TRELLO_DEFAULT_BOARD_ID || '***REMOVED***'
const DEFAULT_BOARD_NAME = 'MomAI Desktop'

function buildUrl(path, params = {}) {
  const apiKey = process.env.TRELLO_API_KEY
  const token = process.env.TRELLO_TOKEN
  if (!apiKey || !token) {
    throw new Error(
      'TRELLO_API_KEY e TRELLO_TOKEN sao obrigatorios. Configure as variaveis de ambiente.'
    )
  }
  const url = new URL(`${TRELLO_API}${path}`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('token', token)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

async function trelloFetch(path, params = {}) {
  const url = buildUrl(path, params)
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Trello API error ${res.status}: ${text}`)
  }
  return res.json()
}

async function trelloPost(path, body = {}) {
  const apiKey = process.env.TRELLO_API_KEY
  const token = process.env.TRELLO_TOKEN
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: apiKey, token, ...body })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Trello API error ${res.status}: ${text}`)
  }
  return res.json()
}

async function trelloPut(path, body = {}) {
  const apiKey = process.env.TRELLO_API_KEY
  const token = process.env.TRELLO_TOKEN
  const url = buildUrl(path)
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: apiKey, token, ...body })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Trello API error ${res.status}: ${text}`)
  }
  return res.json()
}

module.exports = {
  tools: [
    {
      name: 'get_board_info',
      description: 'Mostra informacoes do board MomAI Desktop e suas listas.'
    },
    {
      name: 'list_lists',
      description: 'Lista todas as listas do board MomAI Desktop.',
      parameters: {
        type: 'object',
        properties: {
          boardId: { type: 'string', description: 'ID do board (opcional, usa MomAI Desktop por padrao)' }
        }
      }
    },
    {
      name: 'list_cards',
      description: 'Lista todos os cartoes de uma lista no board MomAI Desktop.',
      parameters: {
        type: 'object',
        required: ['listId'],
        properties: {
          listId: { type: 'string', description: 'ID da lista (obtido via list_lists)' }
        }
      }
    },
    {
      name: 'get_card',
      description: 'Obtem detalhes completos de um cartao do board MomAI Desktop.',
      parameters: {
        type: 'object',
        required: ['cardId'],
        properties: {
          cardId: { type: 'string', description: 'ID do cartao' }
        }
      }
    },
    {
      name: 'create_card',
      description: 'Cria um novo cartao em uma lista do board MomAI Desktop.',
      parameters: {
        type: 'object',
        required: ['listId', 'name'],
        properties: {
          listId: { type: 'string', description: 'ID da lista onde criar o cartao' },
          name: { type: 'string', description: 'Nome/titulo do cartao' },
          description: { type: 'string', description: 'Descricao do cartao (opcional)' },
          dueDate: { type: 'string', description: 'Data de vencimento ISO 8601 (opcional)' }
        }
      }
    },
    {
      name: 'update_card',
      description: 'Atualiza os dados de um cartao existente no board MomAI Desktop.',
      parameters: {
        type: 'object',
        required: ['cardId'],
        properties: {
          cardId: { type: 'string', description: 'ID do cartao' },
          name: { type: 'string', description: 'Novo nome (opcional)' },
          description: { type: 'string', description: 'Nova descricao (opcional)' },
          dueDate: { type: 'string', description: 'Nova data de vencimento ISO 8601 (opcional)' }
        }
      }
    },
    {
      name: 'move_card',
      description: 'Move um cartao para outra lista no board MomAI Desktop.',
      parameters: {
        type: 'object',
        required: ['cardId', 'listId'],
        properties: {
          cardId: { type: 'string', description: 'ID do cartao' },
          listId: { type: 'string', description: 'ID da lista de destino' }
        }
      }
    },
    {
      name: 'add_comment',
      description: 'Adiciona um comentario a um cartao no board MomAI Desktop.',
      parameters: {
        type: 'object',
        required: ['cardId', 'text'],
        properties: {
          cardId: { type: 'string', description: 'ID do cartao' },
          text: { type: 'string', description: 'Texto do comentario' }
        }
      }
    }
  ],

  async execute({ content, args, toolName }) {
    const toolArgs = args || {}
    const boardId = toolArgs.boardId || DEFAULT_BOARD_ID

    try {
      if (toolName === 'get_board_info') {
        const board = await trelloFetch(`/boards/${DEFAULT_BOARD_ID}`, {
          fields: 'id,name,desc,url'
        })
        const lists = await trelloFetch(`/boards/${DEFAULT_BOARD_ID}/lists`, {
          fields: 'id,name,closed'
        })
        const activeLists = lists.filter((l) => !l.closed)

        return {
          tool: 'get_board_info',
          structuredResponse: {
            type: 'trello_lists',
            data: { lists: activeLists, boardName: board.name, boardId: DEFAULT_BOARD_ID }
          },
          instruction: JSON.stringify({
            board: { id: board.id, name: board.name },
            lists: activeLists.map((l) => ({ id: l.id, name: l.name }))
          }),
          webSources: []
        }
      }

      if (toolName === 'list_lists') {
        const lists = await trelloFetch(`/boards/${boardId}/lists`, {
          fields: 'id,name,closed'
        })
        const activeLists = lists.filter((l) => !l.closed)

        return {
          tool: 'list_lists',
          structuredResponse: {
            type: 'trello_lists',
            data: { lists: activeLists, boardId }
          },
          instruction: JSON.stringify({
            lists: activeLists.map((l) => ({ id: l.id, name: l.name }))
          }),
          webSources: []
        }
      }

      if (toolName === 'list_cards') {
        if (!toolArgs.listId) {
          return {
            tool: 'list_cards',
            instruction: 'ID da lista nao fornecido. Use list_lists primeiro.'
          }
        }
        const cards = await trelloFetch(`/lists/${toolArgs.listId}/cards`, {
          fields: 'id,name,desc,due,idList,labels'
        })

        return {
          tool: 'list_cards',
          structuredResponse: {
            type: 'trello_cards',
            data: { cards, listId: toolArgs.listId }
          },
          instruction: JSON.stringify({
            cards: cards.map((c) => ({ id: c.id, name: c.name, due: c.due, labels: c.labels }))
          }),
          webSources: []
        }
      }

      if (toolName === 'get_card') {
        if (!toolArgs.cardId) {
          return { tool: 'get_card', instruction: 'ID do cartao nao fornecido.' }
        }
        const card = await trelloFetch(`/cards/${toolArgs.cardId}`, {
          fields: 'id,name,desc,due,idList,labels,url,start,dueComplete'
        })
        const comments = await trelloFetch(`/cards/${toolArgs.cardId}/actions`, {
          filter: 'commentCard',
          fields: 'id,data,date,memberCreator'
        })

        return {
          tool: 'get_card',
          structuredResponse: {
            type: 'trello_card_detail',
            data: {
              card,
              comments: comments.map((c) => ({
                id: c.id,
                text: c.data?.text,
                date: c.date,
                member: c.memberCreator?.fullName || c.memberCreator?.username
              }))
            }
          },
          instruction: JSON.stringify({
            card: { id: card.id, name: card.name, desc: card.desc, due: card.due, url: card.url }
          }),
          webSources: []
        }
      }

      if (toolName === 'create_card') {
        if (!toolArgs.listId || !toolArgs.name) {
          return {
            tool: 'create_card',
            instruction: 'listId e name sao obrigatorios.'
          }
        }
        const body = { idList: toolArgs.listId, name: toolArgs.name }
        if (toolArgs.description) body.desc = toolArgs.description
        if (toolArgs.dueDate) body.due = toolArgs.dueDate

        const card = await trelloPost('/cards', body)

        return {
          tool: 'create_card',
          structuredResponse: {
            type: 'trello_card_detail',
            data: { card, comments: [] }
          },
          instruction: JSON.stringify({
            card: { id: card.id, name: card.name, url: card.url },
            action: 'created'
          }),
          webSources: []
        }
      }

      if (toolName === 'update_card') {
        if (!toolArgs.cardId) {
          return { tool: 'update_card', instruction: 'cardId é obrigatorio.' }
        }
        const body = {}
        if (toolArgs.name) body.name = toolArgs.name
        if (toolArgs.description) body.desc = toolArgs.description
        if (toolArgs.dueDate) body.due = toolArgs.dueDate

        const card = await trelloPut(`/cards/${toolArgs.cardId}`, body)

        return {
          tool: 'update_card',
          instruction: JSON.stringify({
            card: { id: card.id, name: card.name },
            action: 'updated'
          }),
          webSources: []
        }
      }

      if (toolName === 'move_card') {
        if (!toolArgs.cardId || !toolArgs.listId) {
          return {
            tool: 'move_card',
            instruction: 'cardId e listId sao obrigatorios.'
          }
        }
        const card = await trelloPut(`/cards/${toolArgs.cardId}`, { idList: toolArgs.listId })

        return {
          tool: 'move_card',
          instruction: JSON.stringify({
            card: { id: card.id, name: card.name, listId: card.idList },
            action: 'moved'
          }),
          webSources: []
        }
      }

      if (toolName === 'add_comment') {
        if (!toolArgs.cardId || !toolArgs.text) {
          return {
            tool: 'add_comment',
            instruction: 'cardId e text sao obrigatorios.'
          }
        }
        await trelloPost(`/cards/${toolArgs.cardId}/actions/comments`, { text: toolArgs.text })

        return {
          tool: 'add_comment',
          instruction: `Comentario adicionado ao cartao ${toolArgs.cardId}.`,
          webSources: []
        }
      }

      return {
        tool: 'unknown',
        instruction: 'Comando nao reconhecido. Use get_board_info para ver as listas do MomAI Desktop.'
      }
    } catch (err) {
      return {
        tool: 'error',
        instruction: `Erro ao acessar Trello: ${err.message}`
      }
    }
  }
}
