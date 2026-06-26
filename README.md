<div align="center">

![MomAI](apps/docs/logo/logo.png)

[![GitHub](https://img.shields.io/badge/GitHub-WesleyQDev%2FMomAI-181717?style=for-the-badge&logo=github)](https://github.com/WesleyQDev/MomAI)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg?style=for-the-badge)](LICENSE)

</div>

## O que é MomAI?

MomAI é uma assistente virtual **local-first** e focada em privacidade. Ela combina a inteligência dos LLMs modernos com a capacidade de executar ações reais no seu computador.

### Destaques da Versão Atual

- **Roteamento Semântico (LanceDB):** Identifica intenções do usuário em milissegundos usando busca vetorial local, economizando tokens e tempo.
- **Tool RAG:** Carrega dinamicamente apenas as ferramentas necessárias para cada tarefa, permitindo um ecossistema de centenas de extensões sem perda de performance.
- **Motor de IA Local:** Roda modelos Llama/Qwen via `llama-server.exe` em processo dedicado, garantindo performance máxima.
- **Streaming TTS Real-time:** Fala com você enquanto ainda está pensando, com latência mínima usando Kokoro-82m.
- **Wake Word Local:** Diga "Sistema" para ativar a assistente sem precisar tocar no teclado (processamento offline).
- **Interface Moderna:** Dashboard com monitoramento de recursos em tempo real e interface gráfica dinâmica.
- **Modo Gaming:** Pausa automaticamente processos de IA quando jogos são detectados (via FortScript).

### Por que usar MomAI?

- **Privacidade** - Seus dados ficam no seu computador.
- **Extensível** - Adicione apenas as funcionalidades (agentes e ferramentas) que você precisa.
- **Gratuito** - Uso pessoal sem custos.
- **Multiplataforma** - Windows, Linux e Mac.

## Funcionalidades

- **Agentes Especialistas:** Pesquisa web, controle de sistema, agendador e interface.
- **Lembretes Inteligentes:** Notificações por voz e repetições customizáveis.
- **Comandos de Voz:** Ativação por palavra-chave ("Sistema") e processamento natural offline.
- **Conexão com Extensões:** Suporte a ferramentas externas via RAG dinâmico.
- **Modo Gaming:** Pausa automática de processos de IA quando jogos são detectados.
- **Instalador Automático:** Baixa e configura o motor local (`llama-server.exe`) de acordo com seu hardware (Vulkan/CPU).
- **Pesquisa Web:** Busca via DuckDuckGo com conexão direta local.

## Arquitetura

MomAI utiliza um **Grafo de Agentes (LangGraph)**. O fluxo começa em um **Roteador Semântico** que decide se a tarefa pode ser resolvida localmente por um especialista ou se precisa de orquestração estratégica.

## Documentação

Para instruções de instalação, guia de contribuição, detalhes técnicos e mais informações, acesse a documentação completa:

**[https://wesleyqdev.github.io/momai](https://wesleyqdev.github.io/momai)**

Para a documentação técnica raiz (Spec-Driven, Arc42 + C4, ADR e specs incrementais), veja:

**[docs/README.md](docs/README.md)**

## Contribuições

Antes de abrir Pull Requests, leia:

- [CONTRIBUTING.md](CONTRIBUTING.md) — guia de contribuição e regras
- [CLA.md](CLA.md) — termos de cessão de direitos

## Licença

Uso pessoal gratuito sob licença proprietária. Veja o arquivo [LICENSE](LICENSE) para os termos completos.

---

<div align="center">

**Feito com ❤️ WesleyQDev**

[GitHub](https://github.com/WesleyQDev/MomAI) • [Documentação](https://wesleyqdev.github.io/momai) • [Reportar Bug](https://github.com/WesleyQDev/MomAI/issues)

</div>
