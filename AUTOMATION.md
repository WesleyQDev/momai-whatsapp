# Guia de Automação: WhatsApp

## Como Funciona a Automação no WhatsApp
O WhatsApp permite enviar mensagens e mídias (fotos de câmeras, prints de eventos de visão) automaticamente para **contatos individuais** ou **grupos**.

## Ação Principal: `whatsapp.send_message`
- **Parâmetros**:
  - `contact`: Nome ou JID do contato ou grupo (ex.: `"Paixão"`, `"Família"`, `"+5511999999999"` ou `"120363xxx@g.us"`). O campo lista contatos e grupos automaticamente no modal de automações.
  - `message`: Texto da mensagem ou legenda (ex: `"🚨 Alerta de movimento na câmera {{trigger.payload.cameraName}}!"`).
  - `image`: URI de imagem em base64 (ex.: `{{trigger.payload.imageDataUri}}`) disparada por eventos do MomAI Vision.

## Exemplos de Automação com MomAI Vision
1. **Alerta de Carro/Pessoa no WhatsApp**:
   - Trigger: `momai-vision.vision_alert`
   - Condição global: `trigger.payload.className` igual a `"car"` ou `"person"`
   - Ação: `whatsapp.send_message`
     - `contact`: `"Família"` (Grupo) ou `"João"` (Contato)
     - `message`: `"🚨 Alerta: detectado na câmera {{trigger.payload.cameraName}}!"`
     - `image`: `"{{trigger.payload.imageDataUri}}"`

