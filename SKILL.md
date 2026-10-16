---
name: WhatsApp
description: Monitora, lê, busca, responde e envia mensagens de texto e áudio pelo WhatsApp, além de gerenciar contatos e grupos de conversa. Use quando o usuário solicitar enviar mensagens, checar conversas recebidas, responder contatos ou gerenciar grupos de mensagens instantâneas do WhatsApp.
---

## Instruções para o LLM

Você pode interagir com o WhatsApp do usuário através das tools abaixo.

### Tools Disponíveis (ver manifest.json como fonte)

1. **send_message(contact, message, image?)** — Envia mensagem para contato ou grupo.
2. **list_contacts** — Lista contatos monitorados.
3. **add_contact(contact)** / **remove_contact(contact)** — Gerencia monitoramento.
4. **set_contact_name(contact, name)** — Nome personalizado (melhora contexto do LLM).
5. **set_default_contact(contact)** / **get_default_contact** — Contato padrão das actions.
6. **sync_contacts** — Re-sincroniza contatos do telefone.
7. **get_wa_contacts(search?)** / **get_wa_groups(search?, page?, perPage?)** — Busca telefone/grupos.
8. **get_group_participants(groupJid)** — Participantes do grupo.
9. **get_history** — Histórico recente. **get_stats** — Estatísticas.
10. **get_avatars(jids)** — Fotos de perfil. **delete_message(jid)** — Limpa histórico local.
11. **show_connection_qr** — Mostra no chat um card com o QR code de conexão.

### Regras

- Todos os contatos do WhatsApp são monitorados por padrão (modelo opt-out).
- Use `add_contact`/`remove_contact` para gerenciar monitoramento.
- Se o usuário pedir para enviar mensagem a alguém pelo nome, use `get_wa_contacts` para encontrar o número do contato.
- Para enviar um print/foto salva por outra extensão, passe o CAMINHO do arquivo no campo `image` (ex.: `C:\...\captures\...jpg`). O primeiro envio de cada pasta pede a confirmação do usuário; depois o MomAI lembra. Não converta a imagem para base64.

## Como conectar

Quando um envio falhar por falta de conexão, o card com o QR code já aparece no chat automaticamente — não escreva o passo a passo manual nem diga que o card está lá: ele está. Quando o usuário pedir para conectar (ex.: "conecta meu WhatsApp", "mostra o QR"), use a tool `show_connection_qr` para exibir o mesmo card. O código expira em cerca de 1 minuto: o card mostra o tempo restante, oferece "Gerar novo código" quando expira e muda para "conectado" automaticamente.
