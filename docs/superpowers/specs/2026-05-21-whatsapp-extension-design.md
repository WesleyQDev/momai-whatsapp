# WhatsApp Extension — Design Document

## Overview

Extensão do WhatsApp para MomAI usando Baileys (protocolo WhatsApp Web puro em JS). Permite monitorar mensagens de contatos autorizados, notificar o usuário via card overlay, e responder via clique ou comando de voz.

## Architecture

```
whatsapp-extension/
├── manifest.json           # background, permissions, sidebarPanel, structuredTypes
├── background-worker.js    # Processo persistente: Baileys, WebSocket, monitoramento
├── runtime.js              # Tools pro LLM: send_message, list_contacts, add_contact, etc.
├── SKILL.md                # Frontmatter + instruções LLM
└── locales/
    └── pt-BR.json
```

## Infrastructure Components (Generic — reusável por qualquer extensão)

### 1. Background Workers Persistentes

`extension-host-manager.js` ganha modo persistente:

- `startPersistent(id, skillPath, manifest)` — `fork()` do worker, mantém processo vivo
- Auto-restart com backoff (3 tentativas: 1s, 3s, 5s; se exceder, marca como `crashed`)
- `stopPersistent(id)`, `restartPersistent(id)`
- Lifecycle gerenciado pelo `extension-host-manager`: start na inicialização do app, stop no shutdown

`manifest.json` declara:
```json
{
  "background": true,
  "backgroundScript": "background-worker.js"
}
```

### 2. SSE de Extensões (GET /extensions/events)

Canal SSE dedicado para eventos de extensão.

- `scripts/node-core/services/extension-events.js` — mantém `Set<Response>`, broadcast
- Rota `GET /extensions/events` registrada em `index.js`
- Frontend: `api.ts` ganha `connectExtensionEvents(onEvent)` com auto-reconnect
- Hook `useExtensionEvents.ts` — escuta eventos e dispatch no store

Worker → `process.send({ type: 'event', eventType, data })` → host-manager → `extensionEvents.broadcast()` → SSE → frontend

### 3. Storage API

Extensão acessa via `momai.storage.get(key)` e `momai.storage.set(key, value)`.

- Implementado em `extension-host-worker.js`
- Salva em `data/extensions/<id>/<key>.json`
- 1MB max por extensão
- Usado pela WhatsApp extensão para persistir `creds.json` do Baileys

### 4. Permissões Granulares

`manifest.json` declara permissões. Validadas antes de `fork()`:

- `network:persistent` — WebSocket/HTTP persistente (Baileys)
- `storage:persistent` — acesso a momai.storage
- UI mostra permissões solicitadas ao instalar

### 5. Sidebar Panels (VS Code-style)

Qualquer extensão pode declarar ícone na navbar esquerda com painel lateral customizado.

`manifest.json`:
```json
{
  "sidebarPanel": {
    "icon": "💚",
    "label": "WhatsApp",
    "panelEndpoint": "/extensions/whatsapp/panel"
  }
}
```

- Ao instalar, frontend lê `manifest.sidebarPanel` e adiciona ícone na navbar esquerda (seção "Extensões")
- Clicar → `GET <panelEndpoint>` → `runtime.js` processa → retorna `structuredResponse` → renderiza no painel direito via `GenericExtensionCard`
- Nenhum componente específico de extensão no código fonte

## WhatsApp Extension — Components

### background-worker.js

Processo persistente que:
1. `Baileys.auth()` — tenta carregar creds do `momai.storage`
2. Se sem sessão → gera QR → emite evento `{ type: 'qr_code', data: { qr, expiresIn: 30 } }`
3. Mantém WebSocket com WhatsApp
4. Escuta `messages.upsert` → filtra por whitelist → emite `whatsapp_notification`
5. Escuta `connection.update` → trata reconnect
6. Comunica com runtime.js via IPC para enviar mensagens

### runtime.js

Tools expostas ao LLM (funcionam como qualquer outra skill durante o chat):

| Tool | Description |
|------|-------------|
| `send_message` | Envia mensagem para contato/grupo |
| `list_contacts` | Lista contatos do whitelist |
| `add_contact` | Adiciona contato ao whitelist |
| `remove_contact` | Remove contato do whitelist |
| `set_contact_name` | Define nome personalizado para contato |

### Fluxo de Autenticação (QR Code)

```
App inicia → worker fork → Baileys.auth() → sem sessão → gera QR
  → evento 'qr_code' via SSE → frontend recebe
  → frontend abre modal com QR + timer 30s
  → usuário escaneia → worker salva creds → evento 'authenticated'
  → modal fecha → extensão ativa
```

Re-autenticação automática se creds expirarem.

### Fluxo de Notificação (Card Overlay)

```
Mensagem de contato whitelist
  → worker emite 'whatsapp_notification' { contact, message }
  → SSE → frontend → LLM processa e gera quick replies contextualizadas
  → Card: avatar/nome, mensagem, quick replies, [Responder], [Ignorar]
  → Timeout 30s → minimiza para badge
```

Resposta:
- **Clique**: quick reply → POST `/extensions/whatsapp/send` → worker envia
- **Voz**: wakeword (customizável via card #91) → STT → LLM interpreta → confirma → envia

Quick replies são geradas pelo LLM no momento da notificação, não pelo worker. O worker apenas encaminha a mensagem bruta.

### Sidebar Panel

Clicar no ícone WhatsApp na navbar:

```
GET /extensions/whatsapp/panel → runtime.js processa
  → structuredResponse { type: 'whatsapp_settings', data: { ... } }
  → GenericExtensionCard renderiza no painel direito
  → Conteúdo: status conexão, lista whitelist, adicionar contato, QR (se desconectado)
```

## Implementation Order

1. **Background Workers Persistentes** — extension-host-manager modo persistent
2. **SSE de Extensões** — extension-events.js + frontend stream
3. **Storage API** — momai.storage no worker
4. **Permissões Granulares** — validação no registry.js
5. **Sidebar Panels** — slot genérico na navbar + painel direito
6. **WhatsApp Extension** — background-worker.js + runtime.js
7. **QR Code Auth Flow** — modal + timer
8. **Card Overlay** — notificação centralizada + quick replies

## Dependencies

Baileys (`@whiskeysockets/baileys`) e `qrcode` são dependências **da extensão**, não do core. A extensão deve ser publicada com `node_modules` incluídos ou com `package.json` próprio que é instalado via `npm install` durante a instalação da extensão.

O download da extensão inclui `node_modules/` pré-compilados para Windows (plataforma alvo), evitando necessidade de build nativo.

## Risks

| Risk | Mitigation |
|------|------------|
| QR expira (30s) | Auto-regenera, UI conta regressiva |
| Conexão cai | Baileys auto-reconnect nativo |
| Múltiplas notificações simultâneas | Fila FIFO no worker |
| Ban por automação | Delay mínimo 1s entre ações |
