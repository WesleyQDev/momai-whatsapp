# Guia de Automação: WhatsApp

A extensão WhatsApp atua como um canal de comunicação bidirecional para o assistente, permitindo receber mensagens como gatilhos e enviar notificações com texto e imagens como ações.

## Actions (Ações Executáveis)

1. **`whatsapp.send_message`**
   - Envia mensagens de texto e mídias (fotos, capturas de câmera, alertas) para contatos ou grupos.
   - **Parâmetros**:
     - `contact`: Nome ou JID do contato ou grupo (ex.: `"Paixão"`, `"Família"`, `"+5511999999999"` ou `"120363xxx@g.us"`). O campo lista contatos e grupos conhecidos automaticamente nos esquemas dinâmicos.
     - `message`: Texto da mensagem ou legenda (suporta interpolação: ex.: `"🚨 Alerta detectado: {{trigger.payload.description}}"`).
     - `image` *(opcional)*: URI de imagem em base64 ou URL (ex.: `{{trigger.payload.imageDataUri}}`) gerada por câmeras, relatórios ou gráficos.

## Triggers (Gatilhos de Evento)

1. **`whatsapp.message_received`**
   - Disparado quando uma nova mensagem é recebida no WhatsApp conectado.
   - **Campos do Payload (`trigger.payload`)**:
     - `from`: Número ou JID do remetente
     - `senderName`: Nome amigável do remetente
     - `body`: Conteúdo em texto da mensagem recebida
     - `isGroup`: Booleano indicando se a mensagem partiu de um grupo

## Padrões de Uso no Hub de Automações

- **Como Canal de Alerta e Notificação**:
  Pode ser conectado a qualquer evento do sistema, alertas visuais, leituras de sensores ou relatórios periódicos, formatando a mensagem com as variáveis do gatilho e enviando imagens quando disponíveis.
- **Como Gatilho de Comandos**:
  Mensagens recebidas de remetentes autorizados podem acionar rotinas, ativar modos da casa inteligente ou disparar respostas automatizadas.

## Modelo Se-em-lista (Hub de Automações)

- **Vários gatilhos (OU)**: `trigger_ids: ["whatsapp.message_received", "<outra_ext>.<evento>"]` — qualquer um dispara. `trigger_configs` leva params por gatilho.
- **Condições (E)** em `global_conditions`, cada uma com `kind`:
  - `"trigger_field"` (padrão): `trigger.payload.<campo>` (ex: `senderName`, `body`, `isGroup`);
  - `"time_window"`: `time.time` (HH:MM, `between`/`equals`), `time.weekday` (`in`, 0=dom–6=sáb), `time.hour`, `time.date` — ex: só responder em horário comercial;
  - `"extension_state"`: `extension.<id>.enabled` true/false.
- **Frequência (`policy`)**: `cooldownSeconds` (ex: 20, anti-flood), `maxPerDay`, `weekdays`, `startTime`/`endTime` (HH:MM, suporta 22:00–06:00), `expiresAt`. Omita para executar sempre.
