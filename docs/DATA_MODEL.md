# Data Model

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md), [REQUIREMENTS.md](./REQUIREMENTS.md)

## Objetivo

Mapear entidades de dados, persistencia e politicas de retencao no contexto local-first.

## Dominios de dados principais

- Conversas e sessoes de chat.
- Configuracoes de usuario e estado de onboarding.
- Memoria/notas locais.
- Lembretes e agendamentos.
- Vetores semanticos para roteamento/intencao.
- Logs de aplicacao para diagnostico.

## Persistencia atual (as-is)

- SQLite: dados estruturados de aplicacao.
- LanceDB: indice vetorial para busca semantica e roteamento.
- Arquivos locais: configuracoes e artefatos operacionais.

## Regras de retencao (baseline)

- Dados devem permanecer locais por padrao.
- Qualquer sincronizacao externa deve ser opt-in explicito.
- Logs devem evitar dados sensiveis sempre que possivel.

## Abertos para detalhamento futuro

- Catalogo formal de entidades e campos por modulo.
- Politica de expiracao por tipo de dado.
- Procedimento de exportacao/backup/restauracao.

