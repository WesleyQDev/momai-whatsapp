// scripts/skills/packaged/whatsapp/runtime.js
// LLM tools for WhatsApp
// Execution is routed to background-worker.js via sendToPersistent in registry.js

module.exports = {
  tools: [
    {
      name: 'send_message',
      description: 'Envia uma mensagem para um contato ou grupo do WhatsApp. Pode incluir uma imagem (data URI, base64) que será enviada com o texto como legenda.',
      parameters: {
        type: 'object',
        required: ['contact', 'message'],
        properties: {
          contact: { type: 'string', description: 'Nome ou número do contato' },
          message: {
            type: 'string',
            description: 'Texto da mensagem',
            default: '{description}'
          },
          image: {
            type: 'string',
            description: 'Imagem a enviar (data URI como data:image/jpeg;base64,... ou base64 puro). O texto vira a legenda.',
            default: '{event.imageDataUri}'
          }
        }
      }
    },
    {
      name: 'set_actions',
      description: 'Configura as actions que o host executa automaticamente quando chega uma mensagem (evento whatsapp_message). Cada action: { id, target, tool, args }. Args podem usar {contact}, {message}, {contactJid}, {isGroup} ou {from: "event.<campo>"}.',
      parameters: {
        type: 'object',
        required: ['actions'],
        properties: {
          actions: {
            type: 'array',
            description: 'Lista de actions a anexar ao evento whatsapp_message'
          }
        }
      }
    },
    {
      name: 'get_actions',
      description: 'Retorna as actions configuradas para o evento whatsapp_message.',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'set_default_contact',
      description: 'Define o contato padrão usado para preencher automaticamente o campo "para quem" das actions do WhatsApp.',
      parameters: {
        type: 'object',
        required: ['contact'],
        properties: {
          contact: { type: 'string', description: 'Nome ou número do contato padrão' }
        }
      }
    },
    {
      name: 'get_default_contact',
      description: 'Retorna o contato padrão configurado.',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'list_contacts',
      description: 'Lista os contatos monitorados no WhatsApp',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'add_contact',
      description: 'Adiciona um contato ou grupo para monitoramento',
      parameters: {
        type: 'object',
        required: ['contact'],
        properties: {
          contact: { type: 'string', description: 'Número do contato ou ID do grupo' }
        }
      }
    },
    {
      name: 'remove_contact',
      description: 'Remove um contato ou grupo do monitoramento',
      parameters: {
        type: 'object',
        required: ['contact'],
        properties: {
          contact: { type: 'string', description: 'Número ou ID do contato' }
        }
      }
    },
    {
      name: 'set_contact_name',
      description: 'Define um nome personalizado para um contato (melhora o contexto do LLM)',
      parameters: {
        type: 'object',
        required: ['contact', 'name'],
        properties: {
          contact: { type: 'string', description: 'Número do contato' },
          name: { type: 'string', description: 'Nome personalizado' }
        }
      }
    },
    {
      name: 'get_stats',
      description: 'Obtem estatisticas do WhatsApp',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'get_history',
      description: 'Obtem historico de mensagens recentes',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'get_avatars',
      description: 'Busca fotos de perfil para uma lista de JIDs (contatos ou grupos)',
      parameters: {
        type: 'object',
        properties: {
          jids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de JIDs WhatsApp (@s.whatsapp.net ou @g.us)'
          }
        },
        required: ['jids']
      }
    },
    {
      name: 'get_wa_contacts',
      description:
        'Lista os contatos do WhatsApp importados automaticamente do telefone. Retorna nome e numero.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Busca por nome ou numero (opcional)' }
        }
      }
    },
    {
      name: 'get_wa_groups',
      description: 'Lista os grupos do WhatsApp sincronizados. Suporta busca e paginacao.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Busca por nome do grupo (opcional)' },
          page: { type: 'number', description: 'Pagina (opcional)' },
          perPage: { type: 'number', description: 'Itens por pagina (opcional)' }
        }
      }
    },
    {
      name: 'sync_contacts',
      description:
        'Forca uma re-sincronizacao dos contatos do WhatsApp com o telefone. Use quando os contatos estiverem ausentes, incompletos ou desatualizados. Retorna a quantidade de contatos apos a sincronizacao.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  ],

  async execute({ content, context, args, toolName }) {
    // This is a fallback — for background skills, registry.js routes to sendToPersistent.
    // The background-worker.js handles tool execution and returns structured responses.
    // If this executes directly (no persistent worker), return a fallback error.
    return {
      tool: toolName || 'unknown',
      instruction: JSON.stringify({ error: 'Worker not connected', toolName, args }),
      directResponse: 'Extensão WhatsApp não está ativa. Verifique a conexão no painel.'
    }
  },

  hooks: {
    async onUninstall({ extId }) {
      const dataDir = process.env.MOMAI_DATA_DIR || process.env.MOMAI_NODE_CORE_DATA_DIR
      if (dataDir) {
        const path = require('node:path')
        const fs = require('node:fs')
        const storageDir = path.join(dataDir, 'extensions', extId)
        if (fs.existsSync(storageDir)) {
          try {
            fs.rmSync(storageDir, { recursive: true, force: true })
            console.log(`[whatsapp] Cleaned up storage directory on uninstall: ${storageDir}`)
          } catch (err) {
            console.error(`[whatsapp] Failed to clean up storage directory: ${err.message}`)
          }
        }
      }
    }
  }
}
