---
description: Gera documentação completa do projeto em PDF
---

Você é um engenheiro de software sênior especializado em documentação técnica. Gere uma documentação completa e detalhada do projeto em formato PDF, usando linguagem menos técnica e mais acessível, mas sem perder profundidade.

## Processo

1. Explore TODO o código do projeto (apps, scripts, configurações, pipelines)
2. Analise arquivos de configuração (package.json, pyproject.toml, turbo.json, etc.)
3. Leia a documentação markdown existente em `docs/` e `AGENTS.md`
4. **Reorganize e atualize** a documentação markdown em `docs/`:
   - Estruture em seções lógicas dentro de `docs/` (ex: `docs/apps/`, `docs/guides/`)
   - Corrija informações desatualizadas
   - Adicione seções faltantes baseado na análise do código
   - Use formato markdown limpo e consistente
5. Gere um PDF abrangente com base na documentação atualizada

## Estrutura do Relatório

O documento deve ter NO MÍNIMO:

### 1. Visão Geral do Projeto
- O que é o MomAIOS, propósito, público-alvo
- Arquitetura geral (monorepo, apps, como se comunicam)
- Diagrama textual da arquitetura

### 2. Tecnologias e Stack
Tabela detalhada com:
| Tecnologia | Versão | Onde é usada | Propósito |
| Frameworks | Bibliotecas | Ferramentas | Infraestrutura |

Explique POR QUE cada tecnologia foi escolhida (ex: "LanceDB foi escolhido por ser local-first e rodar embedded, ideal para privacidade de dados do usuário")

### 3. Decisões Técnicas
Para cada decisão importante:
- O problema que motivou a decisão
- Alternativas consideradas
- Por que a escolha atual foi feita
- Trade-offs e impactos

### 4. Estrutura de Diretórios
- Árvore comentada dos principais diretórios
- O que cada app faz, suas responsabilidades
- Como os dados fluem entre eles

### 5. Principais Features e Fluxos
- Como funciona o pipeline de voz (WakeWord -> STT -> LLM -> TTS)
- Como funcionam as Structured Skill Responses (com diagrama de fluxo)
- Como funciona o sistema de extensões
- Call mode e voice pipeline

### 6. Guia de Desenvolvimento
- Setup do ambiente
- Comandos principais
- Convenções de código (naming, estrutura)
- Como testar, buildar, fazer release

### 7. Dependências e Bibliotecas
Tabela completa com:
- Nome, versão, propósito, app onde é usada
- Destaque para bibliotecas críticas

### 8. Configuração e Ambiente
- Variáveis de ambiente necessárias
- Arquivos de configuração
- CI/CD pipeline (GitHub Actions)

## Saída

### Markdown (docs/)
Reorganize e atualize os arquivos em `docs/`. Apague e recrie a estrutura se necessário. O objetivo é ter uma base markdown organizada e atualizada para consulta futura dos agentes.

### PDF
Use a skill de PDF para gerar o relatório em `docs/` com o formato `documentacao-completa-YYYY-MM-DD-HH-mm-ss.pdf`. O formato deve ser:
- **Menos listas, mais textos explicativos** - cada seção deve ter parágrafos que contam uma história
- **Tabelas** para dados comparativos (tecnologias, dependências)
- **Diagramas textuais** para fluxos e arquitetura
- **Linguagem acessível** - como se estivesse explicando para um desenvolvedor junior talentoso
- **Seções bem separadas com headings
