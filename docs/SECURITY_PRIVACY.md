# Security and Privacy

Status: Draft  
Owner: MomAI Team  
Ultima revisao: 2026-04-17  
Relacionados: [DATA_MODEL.md](./DATA_MODEL.md), [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)

## Objetivo

Definir postura de seguranca e privacidade da MomAI com foco local-first.

## Principios

- Privacy by default.
- Menor privilegio para integracoes e ferramentas.
- Transparencia para usuario sobre fluxos de dados.

## Ameacas e controles (baseline)

- Exfiltracao de dados por extensoes:
- Controle: isolamento logico, revisao de extensoes e permissoes explicitas.
- Vazamento em logs:
- Controle: sanitizacao e padrao de nao registrar segredos.
- Quebra de contrato IPC/API:
- Controle: contratos tipados e validacao de schema.
- Execucao indevida de acoes locais:
- Controle: guardrails por tool, escopo de comandos e validacoes de seguranca.

## Compliance e governanca

- LGPD: minimizar coleta, manter finalidade clara e controle local de dados.
- Processos de incidente devem incluir analise de impacto em privacidade.

## Backlog de endurecimento

- Modelo formal de ameacas por superficie (Desktop, Core, extensoes).
- Classificacao de dados por sensibilidade.
- Checklist de seguranca para PRs com impacto em dados/comandos do sistema.

