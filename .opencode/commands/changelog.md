---
description: changelog
agent: build
---

Sempre que rodar este comando, siga estes passos nesta ordem:

## 1. Refatorar entradas existentes

Analise TUDO que está em `apps/landing-page/public/CHANGELOG.md` e refatore qualquer entrada que:
- **Menções a landing page** ou blog — remova
- **Menções a monorepo** (build scripts, CI/CD, GitHub Actions, workflows, turbo, pnpm, etc.) — remova
- **Menções a GitHub** (releases, artefatos, pipelines, etc.) — remova
- **Jargão técnico desnecessário** — substitua por linguagem comum que qualquer usuário entenda
  - Ex: "migração do workflow do agente para arquitetura baseada em Langgraph" → "agente mais inteligente com fluxos de raciocínio avançados"
  - Ex: "implementação de rotas de API para controle refinado" → "maior controle sobre as configurações de voz"
  - Ex: "substituição de pyaudio por sounddevice utilizando CFFI" → "áudio mais estável e instalação simplificada"

O changelog deve conter **apenas** mudanças que impactam o usuário da MomAI, descritas em linguagem clara e acessível.

## 2. Identificar versões faltando

Compare as tags git (formato `v*.*.*`) com as versões listadas no changelog (`## X.Y.Z - data`). Identifique quais versões existem como tag mas não estão no changelog.

## 3. Adicionar versões faltando

Para cada versão faltando (da mais antiga para a mais recente):
1. Faça `git diff v{ULTIMA_VERSAO_NO_CHANGELOG}..v{VERSAO_ATUAL}` para ver o que mudou
2. Examine os arquivos modificados (não confie só nos commits — prefira ver os arquivos)
3. Escreva um resumo em linguagem simples, focando no que o usuário final ganha
4. Use a estrutura de seções: `## ✨ Novas Funcionalidades`, `## ⚙️ Melhorias`, `## 🐛 Correções`, `## 🗑️ Remoções`
5. Adicione no começo do arquivo, mantendo ordem cronológica reversa

## Regras importantes

- **Nunca** considere a versão do `package.json` (é modificada automaticamente no CI)
- **Nunca** inclua landing page, monorepo ou GitHub no changelog
- **Sempre** prefira linguagem de usuário final sobre jargão técnico
- Se o usuário pedir uma versão específica e ela já existir, pergunte se quer incrementar path, minor ou adicionar ao que já existe