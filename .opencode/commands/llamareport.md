---
description: Verifica versão do llama.cpp, compara com upstream e gera relatório de mudanças focado em Vulkan/AMD
---

Você é um engenheiro especializado em LLM inference engines. Execute uma análise completa do llama.cpp usado no MomAI.

## Processo

### 1. Descobrir versão atual

Execute o binário `llama-server` com `--version` para ambos os backends (CPU e Vulkan) em `apps/momai/bin/llama/`:

```powershell
& "apps/momai/bin/llama/cpu/llama-server.exe" --version
& "apps/momai/bin/llama/vulkan/llama-server.exe" --version
```

Extraia o número da versão (ex: `8996`) e o commit hash (ex: `c3c150539`).

### 2. Buscar versão mais recente no GitHub

Use a GitHub API para buscar o latest release:

```
https://api.github.com/repos/ggml-org/llama.cpp/releases/latest
```

Extraia: `tag_name`, `name`, `published_at`, `body` (release notes).

### 3. Comparar versões

- Se a versão atual for a latest: informe e pare.
- Se não: identifique TODOS os releases entre a versão atual e a latest (use `releases?per_page=50`).

### 4. Analisar mudanças relevantes

Faça fetch do HTML/README da release page de cada versão intermediária e da versão latest.

Foco principal (nessa ordem de prioridade):
1. **Vulkan**: mudanças no backend Vulkan (ggml-vulkan, shaders, performance, compatibilidade)
2. **AMD GPUs**: suporte a AMD no Vulkan, ROCm, fixes específicos para AMD
3. **Performance**: speedups gerais de inference, otimizações de KV cache, flash attention
4. **Contexto**: mudanças no tamanho máximo de contexto, gerenciamento de memória
5. **Features relevantes**: novas funcionalidades que impactam o MomAI (server API, slots, etc.)
6. **Bug fixes**: correções críticas (crash, memory leak, data corruption)

Para cada mudança relevante, pesquise:
- O PR original no GitHub (ex: `https://github.com/ggml-org/llama.cpp/pull/17927`)
- Leia a descrição e comentários do PR
- Identifique métricas de impacto (ex: "3x mais rápido no Vulkan", "redução de 40% no uso de VRAM")

### 5. Gerar relatório

Crie `artifacts/reports/llamareports/llamareport-YYYY-MM-DD-HH-mm-ss.md` com:

#### Capa
- Título: "Llama.cpp Upgrade Report - MomAI"
- Versão atual vs latest
- Data da análise

#### Sumário Executivo
- Versão atual: `bXXXX (hash)`
- Versão latest: `bXXXX (hash)`
- Total de releases entre elas: N
- Risco da atualização: Baixo/Médio/Alto
- Recomendação: **Atualizar para bXXX** / **Aguardar** / **Não atualizar** (seja específico — diga a versão exata)
- Decisão: **[SIM / NÃO / PARCIAL]** — justifique em 1 parágrafo

#### Mudanças por Release (lista cronológica reversa)
Para cada release intermediate e a latest, documente:

**Release bXXXX - YYYY-MM-DD**
- **Vulkan/AMD**: lista de mudanças com:
  - Descrição clara do que mudou
  - Link para o PR
  - Impacto estimado (ex: "+25% tok/s no Vulkan com AMD", "10% menos VRAM")
  - Relevância para MomAI: 🔴 Alta / 🟡 Média / 🟢 Baixa
- **Performance Geral**: mudanças que afetam todos os backends
- **Server API**: mudanças no llama-server compatível com MomAI
- **Bug Fixes Críticos**: correções importantes

#### Tabela Comparativa Final

| Aspecto | Versão Atual (bXXXX) | Versão Nova (bXXXX) | Ganho Esperado |
|---------|---------------------|--------------------|----------------|
| Tok/s (Vulkan AMD) | ~N | ~N | +X% |
| Tok/s (Vulkan NVIDIA) | ~N | ~N | +X% |
| VRAM Usage | ~N GB | ~N GB | -X% |
| Max Context | N tokens | N tokens | +X |
| ... | ... | ... | ... |

#### Recomendação de Versão Específica

Escolha uma das três abordagens e justifique com dados:

**A) Atualizar para a última versão (bXXX)**
- Benefícios concretos para MomAI (com métricas):
  - Ex: "+20% tok/s no Vulkan AMD, 15% menos VRAM, suporte a contexto de 32K"
  - Ex: "Corrige crash no llama-server ao usar slots paralelos"
- Riscos identificados:
  - Ex: "Drop de suporte a GPUs com < 4GB VRAM"
  - Ex: "Mudança na API de slots que exige atualizar o llama-manager.js"
- Veredito: 🔥 **Atualizar** / ✅ **Atualizar com cautela** / ⏸ **Aguardar**

**B) Atualizar para uma versão intermediária específica (bXXX)**
- Por que não a última: (ex: "última versão tem regressão no Vulkan AMD")
- Versão recomendada: `bXXXX` — data, benefícios, riscos
- Veredito: 🎯 **Atualizar para bXXX**

**C) Não atualizar**
- Por que: (ex: "versão atual é a mesma", "mudanças são irrelevantes", "risco > benefício")
- Próxima recomendação: Revisar em N dias
- Veredito: ⏹ **Manter versão atual**

#### Plano de Ação (se recomendou atualizar)

Passo a passo:
1. Alterar `MOMAI_LLAMA_VERSION` no `.env` ou executar `hydrate-bin.ps1` manualmente
2. Rodar `pnpm --filter momai build` e verificar se `validate-llama-package.js` passa
3. Testar com `pnpm dev` — verificar se o Vulkan backend sobe corretamente
4. Validar com modelo Qwen: performance, slots, estabilidade
5. Se tudo ok, commit da atualização dos binários

#### Referências
- Links para todos os PRs mencionados
- Links para releases no GitHub
- Benchmarks relevantes

## Formato

Use markdown limpo com tabelas bem formatadas. Seja técnico e preciso. Não invente métricas — se não encontrou o dado, escreva "Não disponível" ou faça uma estimativa conservadora.
