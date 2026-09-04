---
name: WhatsApp
description: Monitora, lê, responde e envia mensagens do WhatsApp, gerencia contatos e grupos. Use quando o usuario falar de whatsapp, zap, mensagem, contato, grupo, responder ou enviar mensagem.
---

## Instruções para o LLM

Você pode interagir com o WhatsApp do usuário através das tools abaixo.

### Tools Disponíveis (15 tools atuais — ver manifest.json como fonte)

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

### Regras

- Todos os contatos do WhatsApp são monitorados por padrão (modelo opt-out).
- Use `add_contact`/`remove_contact` para gerenciar monitoramento.
- Se o usuário pedir para enviar mensagem a alguém pelo nome, use `get_wa_contacts` para encontrar o número do contato.

## Como conectar

Se o WhatsApp não estiver conectado, oriente o usuário a abrir a página da extensão e escanear o código com o celular (WhatsApp > Aparelhos conectados > Conectar um aparelho). O código expira em cerca de 1 minuto; se expirar, um novo aparece sozinho.
