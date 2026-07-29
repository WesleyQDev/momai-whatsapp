# Solo Dev Workflow — MomAI

## Contexto

Desenvolvedor solo do projeto MomAI (Electron + React + Python monorepo com extensões, landing page, futuro Android). Trabalha ~4h/dia, 7 dias por semana (~28h/semana).

Dores identificadas:
- Sobrecarga de papéis (dev, QA, release manager, scrum master, devops)
- Esquecimento de etapas do release
- Cansaço cognitivo de "ter que pensar no que fazer agora"
- Volume de responsabilidades: app desktop, core Python, landing page, extensões, blog, Android futuro

## Ferramentas existentes

|||
|-|-|
| **Linear** | Team MomAI configurado, usado ativamente para issues |
| **GitHub Actions** | CI (lint, typecheck, test). Build de release **não** usa GH Actions (créditos limitados) |
| **Agente de código** | OpenCode/Claude com MCPs para GitHub, Linear |
| **Build local** | AppX (você), EXE + Linux (agente) |
| **Comandos OpenCode** | `/release`, `/checklist-release`, `/changelog`, `/blog`, `/auditoria`, `/analyze-issues`, `/comandos` |

---

## Checklists Detalhadas

### 🗓️ Domingo: Planning

- [ ] Abrir Linear, revisar o que ficou da release anterior
- [ ] Criar issues para a nova versão (features planejadas)
- [ ] Criar issues para bugs conhecidos (viram issues normais)
- [ ] Criar issues para dívida técnica necessária
- [ ] Priorizar: o que entra vs o que fica pra depois
- [ ] Verificar PRs/issues pendentes do amigo
- [ ] Definir escopo da release (data fixa, escopo flexível)

**Regra:** O que não couber, vai pra próxima release. Data não move.

---

### 🗓️ Segunda–Quinta: Feature Mode

**Cada dia:**
- [ ] Pegar próxima issue do topo da fila no Linear
- [ ] Trabalhar até completar OU até dar o tempo do dia
- [ ] Se completou: pegar próxima issue do topo
- [ ] Se não completou: continua amanhã de onde parou

**Se surgir bug durante o dia:**
- [ ] É blocker (impede de continuar a feature)?
    - Se SIM: resolve agora, depois volta pra feature
    - Se NÃO: cria issue no Linear pra release atual ou próxima

**Maintenance Window (encaixado até quinta):**
- [ ] Revisar PRs do amigo pendentes
- [ ] Responder issues que ele abriu
- [ ] Mergear dependabot PRs (se CI passar)
- [ ] Rodar `pnpm audit` se aplicável
- [ ] Atualizar docs/AGENTS.md se mudou algo

---

### 🗓️ Sexta–Sábado: Finalização

- [ ] Finalizar issues que estão perto de fechar
- [ ] Revisar se algo ficou cru demais pra release
    - Se sim: move pra próxima, sem culpa
    - Se não: prepara pra builds

---

### 🗓️ Domingo: Release Day

#### 1. Testes Manuais

- [ ] App abre sem crash
- [ ] Chat funciona (enviar mensagem, receber resposta)
- [ ] Voz/STT/TTS funciona (se aplicável)
- [ ] Extensões carregam (WhatsApp, Launcher, etc)
- [ ] Structured responses renderizam
- [ ] Settings abrem e salvam
- [ ] Se mudou UI: checar tema claro + escuro
- [ ] Se mudou core Python: testar endpoints principais
- [ ] Testar no Windows (seu ambiente)
- [ ] Linux: build do agente + smoke test

#### 2. Builds

- [ ] Build AppX (você, local)
- [ ] Pedir pro agente: Build EXE + Linux

#### 3. Pós-Build

- [ ] Pedir pro agente: Gerar changelog
- [ ] Pedir pro agente: Criar GitHub Release com assets
- [ ] Pedir pro agente: Atualizar landing page
- [ ] Pedir pro agente: Postar blog de versão

#### 4. Planning do Próximo Ciclo

- [ ] Verificar o que ficou de fora
- [ ] Criar issues da próxima versão
- [ ] Priorizar

---

## Gatilhos e Responsabilidades

| Etapa | Quem faz | Gatilho | Ferramenta |
|-------|----------|---------|------------|
| Criar issues da versão | Você | Domingo (planejamento) | Linear |
| Resolver issues | Você | Segunda–Quinta | Linear + código |
| Revisar PRs do amigo | Você | Até quinta | GitHub |
| Dependabot/audit | Você | Até quinta | GitHub |
| Testes manuais | Você | Antes do build (domingo) | App rodando |
| Build AppX | Você | Release day | Local |
| Build EXE + Linux | Agente | Você pede | opencode |
| Changelog | Agente | Build pronto | opencode |
| GitHub Release | Agente | Build pronto | opencode |
| Blog versão | Agente | Release pronta | opencode |
| Landing page bump | Agente | Release pronta | opencode |
| Planning próximo ciclo | Você | Domingo depois da release | Linear |

## Regras de Ouro

1. **Nada acontece sem você mandar** — agente só executa quando você pede
2. **Uma issue por vez** — termine antes de começar outra
3. **Release data fixa, escopo flexível** — o que não couber, vai pra próxima
4. **Bug blocker interrompe feature** — bug leve é issue
5. **Checklist > memória** — nenhuma etapa depende de você lembrar
6. **Planning é domingo** — segunda de manhã é refinamento rápido, não planejamento do zero
7. **Teste manual antes do build** — não libera release sem smoke test
