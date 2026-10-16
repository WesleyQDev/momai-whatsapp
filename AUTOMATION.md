# Guia de Automação: WhatsApp

A extensão WhatsApp atua como um canal de comunicação bidirecional para o assistente, permitindo receber mensagens como gatilhos e enviar notificações com texto e imagens como ações.

## Actions (Ações Executáveis)

1. **`momai-whatsapp.send_message`**
   - Envia mensagens de texto e mídias (fotos, documentos, figurinhas, GIFs) para contatos ou grupos.
   - **Parâmetros** (o contrato completo está em `manifest.json` → `tools`):
     - `contact`: Nome, número ou JID do contato ou grupo (ex.: `"Paixão"`, `"Família"`, `"+5511999999999"` ou `"120363xxx@g.us"`).
     - `message`: Texto da mensagem ou legenda (suporta interpolação: ex.: `"🚨 Alerta detectado: {{trigger.payload.message}}"`).
     - `image` *(opcional)*: data URI/base64, `{{trigger.payload.imageDataUri}}` ou caminho de um arquivo de imagem local (jpg/png/webp) — em conversa, o primeiro envio de cada pasta pede a confirmação do usuário.
     - `documents` *(opcional)*: lista de documentos (data URI ou `{ dataUrl, fileName, mimetype }`).
     - `sticker` / `gif` *(opcionais)*: figurinha `.webp` ou URL de GIF.
   - Por segurança, automações (sem interação) só aceitam caminhos de arquivo dentro da pasta de dados da própria extensão; anexos escolhidos pelo usuário na interface continuam funcionando normalmente. Imagens de fora da pasta só são lidas em conversa, depois da confirmação do usuário.

> O id canônico de qualquer ação de extensão é `momai-whatsapp.<tool>`; a lista de ações disponíveis no Hub é montada a partir do cadastro da extensão. Outras ferramentas (ex.: `momai-whatsapp.list_contacts`, `momai-whatsapp.get_history`) seguem o mesmo formato.

## Triggers (Gatilhos de Evento)

1. **`momai-whatsapp.whatsapp_message`**
   - Disparado quando uma nova mensagem é recebida no WhatsApp conectado.
   - **Campos do Payload (`trigger.payload`)**:
     - `contact`: Nome exibido do contato ou grupo
     - `senderName`: Nome de quem enviou dentro do grupo (quando `isGroup`)
     - `contactJid`: JID da conversa (`@s.whatsapp.net` ou `@g.us`)
     - `senderJid`: JID de quem enviou
     - `message`: Conteúdo em texto da mensagem
     - `id`: Identificador da mensagem (permite responder citando)
     - `isGroup`: Booleano indicando se a mensagem partiu de um grupo
     - `isStatus`: Booleano indicando se é um status (story)
     - `timestamp`: Momento da mensagem (segundos)
     - `image`, `audio`, `video`, `document`, `documentName`, `sticker`: Nome do arquivo salvo pela extensão (quando houver mídia)
     - `recentMedia`: Últimas mídias dessa conversa (fotos/documentos/vídeos)
   - O evento irmão `momai-whatsapp.whatsapp_notification` é usado pelo overlay de notificação; para automações, use `whatsapp_message`.

## Padrões de Uso no Hub de Automações

- **Como Canal de Alerta e Notificação**:
  Pode ser conectado a qualquer evento do sistema, alertas visuais, leituras de sensores ou relatórios periódicos, formatando a mensagem com as variáveis do gatilho e enviando imagens quando disponíveis.
- **Como Gatilho de Comandos**:
  Mensagens recebidas de remetentes autorizados podem acionar rotinas, ativar modos da casa inteligente ou disparar respostas automatizadas.

## Modelo Se-em-lista (Hub de Automações)

- **Vários gatilhos (OU)**: `trigger_ids: ["momai-whatsapp.whatsapp_message", "<outra_ext>.<evento>"]` — qualquer um dispara. `trigger_configs` leva params por gatilho.
- **Condições (E)** em `global_conditions`, cada uma com `kind`:
  - `"trigger_field"` (padrão): `trigger.payload.<campo>` (ex: `contact`, `message`, `isGroup`);
  - `"time_window"`: `time.time` (HH:MM, `between`/`equals`), `time.weekday` (`in`, 0=dom–6=sáb), `time.hour`, `time.date` — ex: só responder em horário comercial;
  - `"extension_state"`: `extension.<id>.enabled` true/false.
- **Frequência (`policy`)**: `cooldownSeconds` (ex: 20, anti-flood), `maxPerDay`, `weekdays`, `startTime`/`endTime` (HH:MM, suporta 22:00–06:00), `expiresAt`. Omita para executar sempre.
