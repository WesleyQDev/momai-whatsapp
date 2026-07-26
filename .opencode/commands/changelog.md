---
description: changelog
agent: build
---

Sempre que rodar este comando, siga estes passos nesta ordem:

## 1. Refatorar entradas existentes

Analise TUDO que está em `CHANGELOG.md` (raiz do repositório) e refatore qualquer entrada que:
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
1. Faça `git diff v{ULTIMA_VERSAO_NO_CHANGELOG}..v{VERSAO_ATUAL}` para ver o que mudou (se a versão faltando é a primeira, use `git diff v0.1.0..v{VERSAO_ATUAL}`)
2. Examine os arquivos modificados — **não confie em títulos de commit ou PR**, prefira ler o diff real dos arquivos
3. Verifique se a tag contém mudanças que impactam o usuário final:
   - Se o diff contém **apenas** `.github/`, `build/installer.nsh`, `pnpm-lock.yaml`, `pyproject.toml` (bumps), `package.json` (bumps), ou landing page — **pule a versão**, não adicione ao changelog
   - Versões que só contêm CI, build, dependências ou landing page não devem aparecer
4. Escreva um resumo em linguagem simples, focando no que o usuário final ganha
5. Use a estrutura de seções: `## ✨ Novas Funcionalidades`, `## ⚙️ Melhorias`, `## 🐛 Correções`, `## 🗑️ Remoções`
6. Adicione no começo do arquivo, mantendo ordem cronológica reversa

Ao processar **lacunas históricas grandes** (ex: 0.7.0 → 1.2.0 com 7 tags intermediárias), analise o salto completo primeiro (`git diff v{ANTIGA}..v{NOVA}`) para entender o contexto antes de processar cada tag individualmente. Se a maior parte das mudanças já está capturada pela versão seguinte documentada, pule as tags intermediárias.

## Regras importantes

- **Nunca** considere a versão do `package.json` (é modificada automaticamente no CI)
- **Nunca** inclua landing page, monorepo ou GitHub no changelog
- **Sempre** prefira linguagem de usuário final sobre jargão técnico
- **Pule tags** cujo diff contenha apenas `.github/`, `installer.nsh`, `pnpm-lock.yaml`, landing page, ou bumps de dependência
- **Créditos**: sempre dê créditos com @ do GitHub quando uma funcionalidade/correção for claramente de um contribuidor específico. Use `git log --format="%an <%ae>"` para mapear autores. Os principais contribuidores são @WesleyQDev e @AndersonTavares0.
- Se o usuário pedir uma versão específica e ela já existir, pergunte se quer incrementar path, minor ou adicionar ao que já existe