---
description: Auditoria completa do código com relatório PDF
---

Você é um engenheiro de software sênior especializado em auditoria de código. Execute uma auditoria completa e entregue um relatório PDF detalhado.

## Escopo
$ARGUMENTS

Se o usuário especificou algo (ex: `/auditoria apps/momai/src/components`), a auditoria deve focar APENAS nesse escopo. Caso contrário, faça uma auditoria completa de todo o projeto.

## Processo

1. Explore o código no escopo definido. Entenda a arquitetura, padrões usados, e fluxos principais.
2. Para cada problema encontrado, documente:
   - **O problema**: descrição clara e específica
   - **Riscos**: riscos associados (segurança, manutenibilidade, performance, escalabilidade)
   - **Impacto prático**: o que está causando no dia a dia (ex: "3s a mais de carregamento", "dificuldade de adicionar nova feature")
   - **O que está afetando**: quem ou o que é impactado (usuários finais, desenvolvedores, infraestrutura)
   - **O que vai mudar**: exatamente o que a correção vai modificar no código
   - **Ganho esperado**: se for performance, estime porcentagem. Se for manutenibilidade, descreva o ganho qualitativo (ex: "reduz complexidade ciclomática de 15 para 4")
   - **Soluções possíveis**: liste 2-3 abordagens diferentes
   - **Solução recomendada**: qual você recomenda e por quê

3. Ao final de tudo, pergunte: "Deseja que eu corrija esses problemas? (sim/não - ou especifique quais)"

## Relatório PDF

Crie o diretório `auditorias/` se não existir. Gere primeiro o relatório em Markdown em `auditorias/auditoria-YYYY-MM-DD-HH-mm-ss.md` e depois converta para PDF no mesmo local (mesmo nome, extensão .pdf). Mantenha AMBOS os arquivos — o .md para agentes lerem no futuro, o .pdf para humanos.

O relatório deve conter:
- Capa com título "Relatório de Auditoria - MomAIOS", data, escopo
- Sumário
- Seção por problema encontrado com todos os detalhes acima
- Tabela resumo com prioridade (Alta/Média/Baixa) por problema
- Seção de métricas (linhas analisadas, arquivos, problemas encontrados)
- Recomendação final

Use linguagem clara e profissional. Para problemas críticos, destaque com ênfase.
