# Vision

Status: Active  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [REQUIREMENTS.md](./REQUIREMENTS.md), [SYSTEM_CONTEXT.md](./SYSTEM_CONTEXT.md)

## Objetivo

Definir direcao de produto e principios que guiam evolucao tecnica da MomAI.

## Visao de produto

MomAI e uma assistente virtual local-first e privacy-first que combina LLMs com a capacidade de executar acoes reais no computador do usuario.

## Objetivos estrategicos

- Privacidade por padrao com processamento local sempre que possivel.
- Latencia baixa para conversa, voz e automacoes.
- Extensibilidade por skills/tools sem degradar desempenho.
- Experiencia desktop robusta, com bootstrap resiliente do backend.

## Nao-objetivos atuais

- Dependencia obrigatoria de cloud para funcoes basicas.
- Arquitetura acoplada a um unico provedor de modelo.
- Operacao centrada em infraestrutura remota obrigatoria.

## Principios de engenharia

- Local-first antes de cloud-first.
- Contratos explicitos entre Desktop e Core.
- Decisoes arquiteturais registradas em ADR.
- Mudancas relevantes guiadas por SPEC.

